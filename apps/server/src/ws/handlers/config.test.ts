import { describe, expect, it, beforeEach } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
import {
  mockConn,
  request,
  createMockPersistentDb,
  createMockSessionDb,
} from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerConfigHandlers } from './config';
import { registerAuthHandlers } from './auth';
import { hashPassword } from '../../auth/password';
import { generateSigningSecret } from '../../auth/jwt';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerConfigHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let persistentDb: ReturnType<typeof createMockPersistentDb>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    persistentDb = createMockPersistentDb();
    registerConfigHandlers(router, { persistentDb });
  });

  // -----------------------------------------------------------------------
  // config.get — existing key
  // -----------------------------------------------------------------------
  it('config.get existing key', async () => {
    persistentDb.run("INSERT INTO server_config (key, value) VALUES ('test-key', 'test-value')");

    const req = request('config.get', { key: 'test-key' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.error).toBeUndefined();
    const payload = resp.payload as Record<string, unknown>;
    expect(payload.key).toBe('test-key');
    expect(payload.value).toBe('test-value');
  });

  // -----------------------------------------------------------------------
  // config.get — missing key
  // -----------------------------------------------------------------------
  it('config.get missing key returns value null', async () => {
    const req = request('config.get', { key: 'nonexistent' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.error).toBeUndefined();
    const payload = resp.payload as Record<string, unknown>;
    expect(payload.key).toBe('nonexistent');
    expect(payload.value).toBeNull();
  });

  // -----------------------------------------------------------------------
  // config.set then config.get — round-trip
  // -----------------------------------------------------------------------
  it('config.set then config.get', async () => {
    const setReq = request('config.set', { key: 'my-key', value: 'my-value' });
    await router.route(conn, setReq);

    expect(conn.sent.length).toBe(1);
    const setResp = conn.sent[0] as Record<string, unknown>;
    expect(setResp.type).toBe('response');
    expect((setResp.payload as Record<string, unknown>).ok).toBe(true);

    conn.sent.length = 0;

    const getReq = request('config.get', { key: 'my-key' });
    await router.route(conn, getReq);

    expect(conn.sent.length).toBe(1);
    const getResp = conn.sent[0] as Record<string, unknown>;
    const payload = getResp.payload as Record<string, unknown>;
    expect(payload.key).toBe('my-key');
    expect(payload.value).toBe('my-value');
  });

  // -----------------------------------------------------------------------
  // config.set overwrite — second value wins
  // -----------------------------------------------------------------------
  it('config.set overwrite', async () => {
    const setReq1 = request('config.set', { key: 'overkey', value: 'first' });
    await router.route(conn, setReq1);
    conn.sent.length = 0;

    const setReq2 = request('config.set', { key: 'overkey', value: 'second' });
    await router.route(conn, setReq2);
    conn.sent.length = 0;

    const getReq = request('config.get', { key: 'overkey' });
    await router.route(conn, getReq);

    const resp = conn.sent[0] as Record<string, unknown>;
    const payload = resp.payload as Record<string, unknown>;
    expect(payload.value).toBe('second');
  });

  // -----------------------------------------------------------------------
  // Missing key field — error response
  // -----------------------------------------------------------------------
  it('Missing key field returns error', async () => {
    const req = request('config.get', {});
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // config.get — protected key jwt_signing_secret returns PERMISSION_DENIED
  // -----------------------------------------------------------------------
  it('config.get returns PERMISSION_DENIED for jwt_signing_secret', async () => {
    const req = request('config.get', { key: 'jwt_signing_secret' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  // -----------------------------------------------------------------------
  // config.set — protected key jwt_signing_secret returns PERMISSION_DENIED
  // -----------------------------------------------------------------------
  it('config.set returns PERMISSION_DENIED for jwt_signing_secret', async () => {
    const req = request('config.set', { key: 'jwt_signing_secret', value: 'malicious' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  // -----------------------------------------------------------------------
  // config.set — value exceeds max length returns INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('config.set returns INVALID_MESSAGE when value exceeds max length', async () => {
    const longValue = 'a'.repeat(4097);
    const req = request('config.set', { key: 'my-key', value: longValue });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    expect((resp.error as Record<string, unknown>).message).toContain('4096');
  });

  // -----------------------------------------------------------------------
  // config.set — value at exactly max length succeeds
  // -----------------------------------------------------------------------
  it('config.set succeeds when value is exactly max length', async () => {
    const maxValue = 'b'.repeat(4096);
    const setReq = request('config.set', { key: 'my-key', value: maxValue });
    await router.route(conn, setReq);

    expect(conn.sent.length).toBe(1);
    const setResp = conn.sent[0] as Record<string, unknown>;
    expect(setResp.error).toBeUndefined();
    expect((setResp.payload as Record<string, unknown>).ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // config.set — invalid key format returns INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('config.set returns INVALID_MESSAGE for invalid key format', async () => {
    const req = request('config.set', { key: 'INVALID KEY!', value: 'test' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    expect((resp.error as Record<string, unknown>).message).toContain('Invalid key format');
  });

  // -----------------------------------------------------------------------
  // config.get — invalid key format returns INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('config.get returns INVALID_MESSAGE for invalid key format', async () => {
    const req = request('config.get', { key: 'INVALID KEY!' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    expect((resp.error as Record<string, unknown>).message).toContain('Invalid key format');
  });

  // -----------------------------------------------------------------------
  // Unauthenticated — AUTH_REQUIRED error
  // -----------------------------------------------------------------------
  it('Unauthenticated returns AUTH_REQUIRED error', async () => {
    // Register auth handlers to activate the auth middleware
    const passwordHash = await hashPassword('test-password');
    const signingSecret = generateSigningSecret();
    const sessionDb = createMockSessionDb();
    registerAuthHandlers(router, { passwordHash, signingSecret, sessionDb });

    const unauthConn = mockConn({ isAuthenticated: false });
    const req = request('config.get', { key: 'some-key' });
    const result = await router.route(unauthConn, req);

    expect(result).not.toBeNull();
    expect(result!.error).toBeDefined();
    expect(result!.error!.code).toBe(ErrorCodes.AUTH_REQUIRED);

    // Also verify the connection received the error
    expect(unauthConn.sent.length).toBe(1);
    const resp = unauthConn.sent[0] as Record<string, unknown>;
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.AUTH_REQUIRED);
  });
});
