// ---------------------------------------------------------------------------
// WebSocket message envelope types
// ---------------------------------------------------------------------------

/** Wire-protocol version – bump when breaking changes are introduced. */
export const PROTOCOL_VERSION = 1 as const;

/** Discriminator for the three envelope kinds. */
export type MessageType = "request" | "response" | "event";

// ---------------------------------------------------------------------------
// Base envelope
// ---------------------------------------------------------------------------

/**
 * Every message flowing over the WebSocket shares these fields.
 * `id`, `channel`, and `token` are optional at the base level and refined by
 * the concrete subtypes.
 */
export interface MessageEnvelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: MessageType;
  id?: string;
  channel?: string;
  token?: string;
  payload: T;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_FAILED: "AUTH_FAILED",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  TERMINAL_NOT_FOUND: "TERMINAL_NOT_FOUND",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Concrete envelopes
// ---------------------------------------------------------------------------

/** A client → server request that expects a matching response. */
export interface RequestEnvelope<T = unknown>
  extends Omit<MessageEnvelope<T>, "type" | "id"> {
  type: "request";
  id: string;
  payload: T;
}

/** A server → client response, paired by `id` to a prior request. */
export interface ResponseEnvelope<T = unknown>
  extends Omit<MessageEnvelope<T | null>, "type" | "id"> {
  type: "response";
  id: string;
  payload: T | null;
  error?: ErrorResponse;
}

/** A server → client unilateral event (no matching request). */
export interface EventEnvelope<T = unknown>
  extends Omit<MessageEnvelope<T>, "type"> {
  type: "event";
  payload: T;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRequestEnvelope(
  value: unknown,
): value is RequestEnvelope<unknown> {
  if (!isObject(value)) return false;
  return value.type === "request" && typeof value.id === "string";
}

export function isResponseEnvelope(
  value: unknown,
): value is ResponseEnvelope<unknown> {
  if (!isObject(value)) return false;
  return value.type === "response" && typeof value.id === "string";
}

export function isEventEnvelope(
  value: unknown,
): value is EventEnvelope<unknown> {
  if (!isObject(value)) return false;
  if (value.type !== "event") return false;
  return "payload" in value;
}
