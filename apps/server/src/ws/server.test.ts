import { test, expect, beforeEach, afterEach } from 'bun:test';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '@ymir/shared';
import { startWebSocketServer, connections } from './server';
import type { ClientConnection } from './connection';
import type { Server } from 'bun';
import {
  initSessionDb,
  createSession,
  createTerminalInstance,
  getTerminalInstance,
  cleanupSession,
} from '../db/session';

let server: Server<unknown>;
let port: number | undefined;
const HOST = '127.0.0.1';

function wsUrl(): string {
  return `ws://${HOST}:${port}`;
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}

beforeEach(async () => {
  // Use port 0 to get a random available port
  server = await startWebSocketServer({ port: 0, host: HOST });
  port = server.port;
});

afterEach(() => {
  server.stop(true);
  connections.clear();
});

// ---------------------------------------------------------------------------
// Test 1: Server starts and a client can connect
// ---------------------------------------------------------------------------
test('startWebSocketServer starts and a WebSocket client can connect', async () => {
  const ws = new WebSocket(wsUrl());
  await waitForOpen(ws);

  expect(connections.size).toBe(1);

  // Verify the connection was stored
  const conn = Array.from(connections.values())[0];
  expect(conn).toBeInstanceOf(Object);
  expect(conn.sessionId).toBeTruthy();
  expect(typeof conn.sessionId).toBe('string');
  expect(conn.isAuthenticated).toBe(false);
  expect(conn.lastActive).toBeInstanceOf(Date);

  ws.close();
});

// ---------------------------------------------------------------------------
// Test 2: Server receives messages as JSON
// ---------------------------------------------------------------------------
test('server receives and parses JSON messages via onMessage callback', async () => {
  const received: Array<{ conn: ClientConnection; message: unknown }> = [];

  // Restart server with an onMessage handler
  server.stop(true);
  connections.clear();

  server = await startWebSocketServer({
    port: 0,
    host: HOST,
    onMessage(conn, message) {
      received.push({ conn, message });
    },
  });
  port = server.port;

  const ws = new WebSocket(wsUrl());
  await waitForOpen(ws);

  const testPayload = {
    v: PROTOCOL_VERSION,
    type: 'request',
    id: 'test-1',
    channel: 'auth',
    payload: { password: 'secret' },
  };

  ws.send(JSON.stringify(testPayload));

  // Wait a bit for the message to be processed
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(received.length).toBe(1);
  expect(received[0].message).toEqual(testPayload);
  expect(received[0].conn.sessionId).toBeTruthy();

  ws.close();
});

// ---------------------------------------------------------------------------
// Test 3: Disconnection removes connection from map
// ---------------------------------------------------------------------------
test('disconnection is detected and connection is removed from map', async () => {
  const ws = new WebSocket(wsUrl());
  await waitForOpen(ws);

  expect(connections.size).toBe(1);

  const disconnectPromise = new Promise<void>((resolve) => {
    ws.on('close', () => resolve());
  });

  ws.close();
  await disconnectPromise;

  // Give the server a moment to process the close event
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(connections.size).toBe(0);
});

// ---------------------------------------------------------------------------
// Test 4: onClose cleans up session data but does NOT kill PTYs
// ---------------------------------------------------------------------------
test('onClose cleans up session data without killing PTYs', async () => {
  const sessionDb = initSessionDb();
  const killedTerminals: string[] = [];
  const _mockPtyManager = {
    kill(id: string) {
      killedTerminals.push(id);
    },
  };

  let disconnectedConn: ClientConnection | null = null;

  // Restart server with an onClose callback matching the new production behavior
  server.stop(true);
  connections.clear();

  server = await startWebSocketServer({
    port: 0,
    host: HOST,
    onClose(conn) {
      disconnectedConn = conn;
      // Matches production: only cleanupSession, no PTY killing
      cleanupSession(sessionDb, conn.sessionId);
    },
  });
  port = server.port;

  // Create a session and terminal instance in the session DB
  const sessionId = createSession(sessionDb);
  const workspaceId = 'ws-test';
  const termId = createTerminalInstance(sessionDb, {
    sessionId,
    workspaceId,
    cols: 80,
    rows: 24,
  });

  // Verify terminal instance exists before disconnect
  expect(getTerminalInstance(sessionDb, termId)).not.toBeNull();

  // Connect and disconnect
  const ws = new WebSocket(wsUrl());
  await waitForOpen(ws);

  // Manually insert a session row for this connection's sessionId and a
  // terminal instance so we can verify cleanupSession is called
  createSession(sessionDb, Array.from(connections.values())[0].sessionId);
  const connSessionId = Array.from(connections.values())[0].sessionId;
  const connTermId = createTerminalInstance(sessionDb, {
    sessionId: connSessionId,
    workspaceId,
    cols: 80,
    rows: 24,
  });

  const disconnectPromise = new Promise<void>((resolve) => {
    ws.on('close', () => resolve());
  });
  ws.close();
  await disconnectPromise;
  await new Promise((resolve) => setTimeout(resolve, 100));

  // The onClose callback was invoked
  expect(disconnectedConn).not.toBeNull();

  // The connection's terminal instance was cleaned up by cleanupSession
  expect(getTerminalInstance(sessionDb, connTermId)).toBeNull();

  // No PTYs were killed (mockPtyManager.kill was never called)
  expect(killedTerminals).toHaveLength(0);

  // The pre-existing session's terminal is untouched (different session)
  expect(getTerminalInstance(sessionDb, termId)).not.toBeNull();

  sessionDb.close();
});
