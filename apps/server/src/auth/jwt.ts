import { SignJWT, jwtVerify } from 'jose';

/**
 * Generate a random signing secret (72+ characters).
 * Uses two concatenated UUIDv4 strings.
 */
export function generateSigningSecret(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

/**
 * Generate a JWT with the given session ID and secret.
 * Uses HS256 algorithm with a default 7-day expiry.
 */
export async function generateToken(
  sessionId: string,
  secret: string,
  expiresIn: string = '7d'
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

/**
 * Verify a JWT and return the payload containing the session ID.
 * Throws if the token is invalid or expired.
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<{ sessionId: string }> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify<{ sessionId: string }>(token, key);
  return { sessionId: payload.sessionId };
}
