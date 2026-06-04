import {
  ErrorCodes,
  type AuthRequest,
  type AuthResponse,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { verifyPassword } from '../../auth/password';
import { generateToken, verifyToken } from '../../auth/jwt';
import { createError, createResponse, type MessageRouter } from '../router';
import { createSession, type Database } from '../../db/session';

export interface AuthDeps {
  passwordHash: string;
  signingSecret: string;
  sessionDb: Database;
}

/** JWT expiry duration string (7 days) – keep in sync with jwt.ts default. */
const TOKEN_EXPIRY = '7d';

const authAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60_000; // 1 minute
const MAX_PASSWORD_LENGTH = 128;
const MAX_AUTH_ENTRIES = 10_000;

/** Remove auth-attempt tracking for a disconnected session. */
export function cleanupAuthAttempts(sessionId: string): void {
  authAttempts.delete(sessionId);
  enforceAuthAttemptsLimit();
}

/** Evict oldest entries when authAttempts exceeds the maximum size. */
function enforceAuthAttemptsLimit(): void {
  if (authAttempts.size <= MAX_AUTH_ENTRIES) return;

  // Collect entries sorted by lastAttempt ascending (oldest first)
  const sorted = [...authAttempts.entries()].sort((a, b) => a[1].lastAttempt - b[1].lastAttempt);
  const excess = sorted.length - MAX_AUTH_ENTRIES;
  for (let i = 0; i < excess; i++) {
    authAttempts.delete(sorted[i][0]);
  }
}

/** Convert expiry string like "7d" to seconds. */
function expiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60; // fallback 7 days
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unit[match[2]] ?? 86400);
}

/**
 * Register the 'auth' channel handler and an auth middleware on the router.
 *
 * The middleware runs before any non-'auth' channel handler: if the
 * connection is not already authenticated and the envelope carries no valid
 * token, an AUTH_REQUIRED error is returned.
 */
export function registerAuthHandlers(router: MessageRouter, deps: AuthDeps): () => void {
  // --- auth channel handler -----------------------------------------------
  router.handle('auth', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<AuthRequest>;
    const password: string = req.payload?.password ?? '';

    // Reject overly long passwords before hashing
    if (password.length > MAX_PASSWORD_LENGTH) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'auth' },
        ErrorCodes.AUTH_FAILED,
        'Password too long',
      );
      conn.send(err);
      return;
    }

    // Per-connection rate limiting
    const attempts = authAttempts.get(conn.sessionId) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    // Reset counter if outside the window
    if (now - attempts.lastAttempt >= AUTH_WINDOW_MS) {
      attempts.count = 0;
    }
    if (attempts.count >= MAX_AUTH_ATTEMPTS) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'auth' },
        ErrorCodes.AUTH_FAILED,
        'Too many authentication attempts. Try again later.',
      );
      conn.send(err);
      return;
    }

    const valid = await verifyPassword(password, deps.passwordHash);

    if (!valid) {
      conn.isAuthenticated = false;
      attempts.count++;
      attempts.lastAttempt = Date.now();
      authAttempts.set(conn.sessionId, attempts);
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'auth' },
        ErrorCodes.AUTH_FAILED,
        'Invalid password',
      );
      conn.send(err);
      return;
    }

    // Clear rate-limit attempts on successful auth
    authAttempts.delete(conn.sessionId);

    // Create a session in the DB and issue a JWT
    const sessionId = createSession(deps.sessionDb, conn.sessionId);
    const token = await generateToken(sessionId, deps.signingSecret, TOKEN_EXPIRY);

    conn.isAuthenticated = true;

    const resp: ResponseEnvelope<AuthResponse> = createResponse(req, {
      token,
      expiresIn: expiryToSeconds(TOKEN_EXPIRY),
    } satisfies AuthResponse);

    conn.send(resp);
  });

  // --- periodic cleanup of stale authAttempts entries --------------------
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of authAttempts) {
      if (now - val.lastAttempt >= AUTH_WINDOW_MS) {
        authAttempts.delete(key);
      }
    }
    enforceAuthAttemptsLimit();
  }, AUTH_WINDOW_MS);

  // --- auth middleware ----------------------------------------------------
  // We wrap the router's dispatch so that non-auth channels require auth.
  const originalRoute = router.route.bind(router);
  router.route = async function (
    conn: ClientConnection,
    envelope: MessageEnvelope,
  ): Promise<ResponseEnvelope | null> {
    const channel = envelope.channel ?? '';

    // The 'auth' channel itself is always accessible
    if (channel === 'auth') {
      return originalRoute(conn, envelope);
    }

    // Already authenticated on this connection
    if (conn.isAuthenticated) {
      return originalRoute(conn, envelope);
    }

    // Try to authenticate via token in the envelope
    const token = envelope.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        await verifyToken(token, deps.signingSecret);

        // Token is valid — ensure this connection has a DB session row.
        // On page refresh a new WebSocket is created with a fresh sessionId,
        // so we create a session for it (idempotent if already present).
        try {
          createSession(deps.sessionDb, conn.sessionId);
        } catch {
          // Session row already exists for this connection — that's fine.
        }

        conn.isAuthenticated = true;
        return originalRoute(conn, envelope);
      } catch {
        // Token verification failed – fall through to AUTH_REQUIRED
      }
    }

    // Not authenticated
    const err = createError(
      { id: envelope.id ?? '', channel },
      ErrorCodes.AUTH_REQUIRED,
      'Authentication required',
    );
    conn.send(err);
    return err;
  };

  // Return cleanup function
  return () => {
    clearInterval(cleanupTimer);
  };
}
