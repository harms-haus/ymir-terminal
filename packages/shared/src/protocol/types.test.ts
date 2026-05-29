import { describe, expect, it } from 'bun:test';
import {
  ErrorCodes,
  type ErrorResponse,
  type EventEnvelope,
  isEventEnvelope,
  isRequestEnvelope,
  isResponseEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  PROTOCOL_VERSION,
} from './types';

describe('protocol types', () => {
  describe('PROTOCOL_VERSION', () => {
    it('is 1', () => {
      expect(PROTOCOL_VERSION).toBe(1);
    });
  });

  describe('ErrorCodes', () => {
    it('contains all required error codes', () => {
      expect(ErrorCodes.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ErrorCodes.AUTH_FAILED).toBe('AUTH_FAILED');
      expect(ErrorCodes.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
      expect(ErrorCodes.WORKSPACE_NOT_FOUND).toBe('WORKSPACE_NOT_FOUND');
      expect(ErrorCodes.TERMINAL_NOT_FOUND).toBe('TERMINAL_NOT_FOUND');
      expect(ErrorCodes.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCodes.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.HANDLER_ERROR).toBe('HANDLER_ERROR');
    });

    it('has exactly 9 codes', () => {
      expect(Object.keys(ErrorCodes)).toHaveLength(9);
    });
  });

  describe('ErrorResponse', () => {
    it('can be constructed with code and message', () => {
      const err: ErrorResponse = {
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication is required',
      };
      expect(err.code).toBe('AUTH_REQUIRED');
      expect(err.message).toBe('Authentication is required');
      expect(err.details).toBeUndefined();
    });

    it('can be constructed with code, message, and details', () => {
      const details = { field: 'token', reason: 'expired' };
      const err: ErrorResponse = {
        code: ErrorCodes.AUTH_FAILED,
        message: 'Token expired',
        details,
      };
      expect(err.details).toEqual(details);
    });
  });

  describe('isRequestEnvelope', () => {
    it('returns true for valid request envelope', () => {
      const env: RequestEnvelope<{ cmd: string }> = {
        v: PROTOCOL_VERSION,
        type: 'request',
        id: 'req-1',
        payload: { cmd: 'ls' },
      };
      expect(isRequestEnvelope(env)).toBe(true);
    });

    it('returns true with optional channel and token', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'request',
        id: 'req-2',
        channel: 'terminal',
        token: 'abc123',
        payload: { cmd: 'ls' },
      };
      expect(isRequestEnvelope(env)).toBe(true);
    });

    it('returns false for response type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'res-1',
        payload: null,
      };
      expect(isRequestEnvelope(env)).toBe(false);
    });

    it('returns false for event type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'event',
        payload: { data: 'output' },
      };
      expect(isRequestEnvelope(env)).toBe(false);
    });

    it('returns false when id is missing', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'request',
        payload: { cmd: 'ls' },
      };
      expect(isRequestEnvelope(env)).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(isRequestEnvelope(null)).toBe(false);
      expect(isRequestEnvelope(undefined)).toBe(false);
      expect(isRequestEnvelope('string')).toBe(false);
      expect(isRequestEnvelope(42)).toBe(false);
    });
  });

  describe('isResponseEnvelope', () => {
    it('returns true for valid response envelope with payload', () => {
      const env: ResponseEnvelope<{ result: string }> = {
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'res-1',
        payload: { result: 'ok' },
      };
      expect(isResponseEnvelope(env)).toBe(true);
    });

    it('returns true for response envelope with null payload', () => {
      const env: ResponseEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'res-2',
        payload: null,
      };
      expect(isResponseEnvelope(env)).toBe(true);
    });

    it('returns true for response envelope with error', () => {
      const env: ResponseEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'res-3',
        payload: null,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Something went wrong',
        },
      };
      expect(isResponseEnvelope(env)).toBe(true);
    });

    it('returns false for request type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'request',
        id: 'req-1',
        payload: { cmd: 'ls' },
      };
      expect(isResponseEnvelope(env)).toBe(false);
    });

    it('returns false for event type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'event',
        payload: { data: 'output' },
      };
      expect(isResponseEnvelope(env)).toBe(false);
    });

    it('returns false when id is missing', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'response',
        payload: null,
      };
      expect(isResponseEnvelope(env)).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(isResponseEnvelope(null)).toBe(false);
      expect(isResponseEnvelope(undefined)).toBe(false);
    });
  });

  describe('isEventEnvelope', () => {
    it('returns true for valid event envelope', () => {
      const env: EventEnvelope<{ output: string }> = {
        v: PROTOCOL_VERSION,
        type: 'event',
        payload: { output: 'hello' },
      };
      expect(isEventEnvelope(env)).toBe(true);
    });

    it('returns true with optional channel', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal:1',
        payload: { output: 'hello' },
      };
      expect(isEventEnvelope(env)).toBe(true);
    });

    it('returns false for request type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'request',
        id: 'req-1',
        payload: { cmd: 'ls' },
      };
      expect(isEventEnvelope(env)).toBe(false);
    });

    it('returns false for response type', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'res-1',
        payload: null,
      };
      expect(isEventEnvelope(env)).toBe(false);
    });

    it('returns false when payload is missing', () => {
      const env = {
        v: PROTOCOL_VERSION,
        type: 'event',
      };
      expect(isEventEnvelope(env)).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(isEventEnvelope(null)).toBe(false);
      expect(isEventEnvelope(undefined)).toBe(false);
    });
  });
});
