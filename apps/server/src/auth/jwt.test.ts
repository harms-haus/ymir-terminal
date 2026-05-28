import { describe, test, expect } from 'bun:test';
import { generateToken, verifyToken, generateSigningSecret } from './jwt';

describe('JWT token management', () => {
  const secret = generateSigningSecret();

  test('generateToken returns a JWT string', async () => {
    const token = await generateToken('session-123', secret);
    expect(typeof token).toBe('string');
    // JWTs have three base64url-encoded parts separated by dots
    const parts = token.split('.');
    expect(parts.length).toBe(3);
  });

  test('verifyToken returns payload with sessionId', async () => {
    const sessionId = 'session-abc-456';
    const token = await generateToken(sessionId, secret);
    const payload = await verifyToken(token, secret);
    expect(payload.sessionId).toBe(sessionId);
  });

  test('verifyToken throws on expired token', async () => {
    // Generate a token with a very short expiry (1 second)
    const token = await generateToken('session-expiring', secret, '1s');
    // Wait 2 seconds so it expires
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(verifyToken(token, secret)).rejects.toThrow();
  });

  test('verifyToken throws on invalid token', async () => {
    expect(verifyToken('this.is.garbage', secret)).rejects.toThrow();
  });

  test('generateSigningSecret returns a 72+ char random string', () => {
    const s = generateSigningSecret();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThanOrEqual(72);
  });
});
