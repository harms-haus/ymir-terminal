import {
  ErrorCodes,
  type ErrorCode,
  PROTOCOL_VERSION,
  type EventEnvelope,
  type MessageEnvelope,
  type MessageType,
  type RequestEnvelope,
  type ResponseEnvelope,
} from '@ymir/shared';
import type { ClientConnection } from './connection';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const VALID_TYPES: Set<string> = new Set<MessageType>(['request', 'response', 'event']);

/**
 * Parse a raw JSON string into a validated `MessageEnvelope`.
 *
 * @throws {SyntaxError}  If the input is not valid JSON.
 * @throws {ProtocolError} If the protocol version or message type is invalid.
 */
export function parseMessage(raw: string): MessageEnvelope {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProtocolError('Message must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.v !== PROTOCOL_VERSION) {
    throw new ProtocolError(`Unsupported protocol version: ${obj.v}. Expected ${PROTOCOL_VERSION}`);
  }

  if (typeof obj.type !== 'string' || !VALID_TYPES.has(obj.type)) {
    throw new ProtocolError(
      `Invalid or missing type field: ${obj.type}. Must be one of: ${[...VALID_TYPES].join(', ')}`,
    );
  }

  return parsed as MessageEnvelope;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Create a success response paired to a prior request by `id`.
 */
export function createResponse<T = unknown>(
  request: RequestEnvelope,
  payload: T,
): ResponseEnvelope<T> {
  return {
    v: PROTOCOL_VERSION,
    type: 'response',
    id: request.id,
    channel: request.channel,
    payload,
  };
}

/**
 * Create an error response paired to a prior request by `id`.
 */
export function createError(
  request: Pick<RequestEnvelope, 'id' | 'channel'>,
  code: ErrorCode,
  message: string,
): ResponseEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: 'response',
    id: request.id,
    channel: request.channel,
    payload: null,
    error: { code, message },
  };
}

/**
 * Create a unilateral event envelope.
 */
export function createEvent(channel: string, payload: unknown): EventEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: 'event',
    channel,
    payload,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export type RouteHandler = (conn: ClientConnection, envelope: MessageEnvelope) => Promise<void>;

export class MessageRouter {
  private handlers = new Map<string, RouteHandler>();

  /**
   * Register a handler for a given channel.
   */
  handle(channel: string, handler: RouteHandler): void {
    this.handlers.set(channel, handler);
  }

  /**
   * Dispatch an incoming envelope to the registered handler.
   *
   * @returns An error `ResponseEnvelope` if no handler is registered for the
   *          channel, or `null` when dispatch succeeds.
   */
  async route(conn: ClientConnection, envelope: MessageEnvelope): Promise<ResponseEnvelope | null> {
    const handler = this.handlers.get(envelope.channel ?? '');

    if (!handler) {
      return createError(
        {
          id: envelope.id ?? '',
          channel: envelope.channel,
        },
        'INVALID_MESSAGE',
        `No handler for channel: ${envelope.channel ?? '<missing>'}`,
      );
    }

    try {
      await handler(conn, envelope);
      return null;
    } catch (err) {
      console.error('Handler error:', err);
      const message = err instanceof Error ? err.message : 'Internal error';
      return createError(
        { id: envelope.id ?? '', channel: envelope.channel },
        ErrorCodes.HANDLER_ERROR,
        message,
      );
    }
  }
}
