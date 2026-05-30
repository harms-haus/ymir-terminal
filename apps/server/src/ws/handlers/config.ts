import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type ConfigGetRequest,
  type ConfigGetResponse,
  type ConfigSetRequest,
  type ConfigSetResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import type { Database } from 'bun:sqlite';
import { getConfigValue, setConfigValue } from '../../db/persistent';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ConfigDeps {
  persistentDb: Database;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getConfigValue?: typeof getConfigValue;
    setConfigValue?: typeof setConfigValue;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerConfigHandlers(router: MessageRouter, deps: ConfigDeps): void {
  const doGetConfigValue = deps._mocks?.getConfigValue ?? getConfigValue;
  const doSetConfigValue = deps._mocks?.setConfigValue ?? setConfigValue;

  // --- config.get ---------------------------------------------------------
  router.handle('config.get', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<ConfigGetRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.key !== 'string' || payload.key === '') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'config.get' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: key',
      );
      conn.send(err);
      return;
    }

    const result = doGetConfigValue(deps.persistentDb, payload.key);

    const resp: ResponseEnvelope<ConfigGetResponse> = createResponse(req, {
      key: payload.key,
      value: result,
    } satisfies ConfigGetResponse);

    conn.send(resp);
  });

  // --- config.set ---------------------------------------------------------
  router.handle('config.set', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<ConfigSetRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.key !== 'string' ||
      payload.key === '' ||
      typeof payload.value !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'config.set' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: key and value',
      );
      conn.send(err);
      return;
    }

    doSetConfigValue(deps.persistentDb, payload.key, payload.value);

    const resp: ResponseEnvelope<ConfigSetResponse> = createResponse(req, {
      ok: true,
    } satisfies ConfigSetResponse);

    conn.send(resp);
  });
}
