import { describe, expect, it, beforeEach } from 'bun:test';
import { type RequestEnvelope, PROTOCOL_VERSION, ErrorCodes } from '@ymir/shared';
import { MessageRouter } from '../router';
import { registerAuthHandlers } from './auth';
import { hashPassword } from '../../auth/password';
import { generateToken, generateSigningSecret, verifyToken } from '../../auth/jwt';
import { initSessionDb, type Database } from '../../db/session';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock connection object. */
function mockConn(overrides?: Partial<{ sessionId: string; isAuthenticated: boolean }>) {
  const sent: unknown[] = [];
  return {
    sessionId: overrides?.sessionId ?? crypto.randomUUID(),
    isAuthenticated: overrides?.isAuthenticated ?? false,
    sent,
    send(data: unknown) {
      sent.push(data);
    },
  };
}

/** Build a request envelope for the given channel + payload. */
function request(channel: string, payload: unknown, token?: string): RequestEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: 'request',
    id: crypto.randomUUID(),
    channel,
    payload,
    ...(token ? { token } : {}),
  } as RequestEnvelope;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerAuthHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let passwordHash: string;
  let signingSecret: string;
  let sessionDb: Database;

  beforeEach(async () => {
    router = new MessageRouter();
    conn = mockConn();
    passwordHash = await hashPassword('test-password');
    signingSecret = generateSigningSecret();
    sessionDb = initSessionDb();
    registerAuthHandlers(router, { passwordHash, signingSecret, sessionDb });
  });

  it('correct password returns AuthResponse with token and expiresIn', async () => {
    const req = request('auth', { password: 'test-password' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.id).toBe(req.id);
    expect(resp.error).toBeUndefined();
    const payload = resp.payload as Record<string, unknown>;
    expect(typeof payload.token).toBe('string');
    expect(typeof payload.expiresIn).toBe('number');
    expect(payload.expiresIn as number).toBeGreaterThan(0);

    // Token should be verifiable
    const decoded = await verifyToken(payload.token as string, signingSecret);
    expect(typeof decoded.sessionId).toBe('string');
  });

  it('wrong password returns error with AUTH_FAILED code', async () => {
    const req = request('auth', { password: 'wrong-password' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.AUTH_FAILED);
    expect(resp.payload).toBeNull();
  });

  it('subsequent requests with valid token pass authentication', async () => {
    // First create a valid token
    const token = await generateToken('some-session', signingSecret);

    // Register a dummy handler for another channel
    let handlerReached = false;
    router.handle('terminal.create', async () => {
      handlerReached = true;
    });

    const req = request('terminal.create', { workspaceId: 'ws-1' }, token);
    await router.route(conn, req);

    expect(handlerReached).toBe(true);
    expect(conn.isAuthenticated).toBe(true);
  });

  it('invalid token returns AUTH_REQUIRED error', async () => {
    router.handle('terminal.create', async () => {});

    const req = request('terminal.create', { workspaceId: 'ws-1' }, 'invalid-token-value');
    const result = await router.route(conn, req);

    // Should get an AUTH_REQUIRED error response
    expect(result).not.toBeNull();
    expect(result!.error).toBeDefined();
    expect(result!.error.code).toBe(ErrorCodes.AUTH_REQUIRED);
    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.AUTH_REQUIRED);
  });

  it('missing token on non-auth request returns AUTH_REQUIRED', async () => {
    router.handle('workspace.list', async () => {});

    const req = request('workspace.list', {});
    const result = await router.route(conn, req);

    expect(result).not.toBeNull();
    expect(result!.error).toBeDefined();
    expect(result!.error.code).toBe(ErrorCodes.AUTH_REQUIRED);
    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.AUTH_REQUIRED);
  });
});
