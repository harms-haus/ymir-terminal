import { describe, expect, it } from "bun:test";
import { describe, expect, it } from "bun:test";
import {
  type MessageEnvelope,
  type RequestEnvelope,
  PROTOCOL_VERSION,
} from "@ymir/shared";
import {
  createError,
  createEvent,
  createResponse,
  MessageRouter,
  parseMessage,
} from "./router";

// ---------------------------------------------------------------------------
// parseMessage
// ---------------------------------------------------------------------------
describe("parseMessage", () => {
  it("returns typed MessageEnvelope for valid JSON with correct version", () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-1",
      channel: "terminal.create",
      payload: { workspaceId: "ws-1" },
    });

    const envelope = parseMessage(raw);

    expect(envelope.v).toBe(PROTOCOL_VERSION);
    expect(envelope.type).toBe("request");
    expect(envelope.id).toBe("req-1");
    expect(envelope.channel).toBe("terminal.create");
    expect(envelope.payload).toEqual({ workspaceId: "ws-1" });
  });

  it("accepts a valid event envelope", () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: "event",
      channel: "terminal.output",
      payload: { terminalId: "t-1", data: "aGVsbG8=" },
    });

    const envelope = parseMessage(raw);

    expect(envelope.type).toBe("event");
    expect(envelope.channel).toBe("terminal.output");
  });

  it("accepts a valid response envelope", () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: "response",
      id: "res-1",
      payload: { terminalId: "t-1" },
    });

    const envelope = parseMessage(raw);
    expect(envelope.type).toBe("response");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMessage("{not valid json")).toThrow();
  });

  it("throws on wrong protocol version", () => {
    const raw = JSON.stringify({
      v: 999,
      type: "request",
      id: "req-1",
      payload: {},
    });

    expect(() => parseMessage(raw)).toThrow(/version/i);
  });

  it("throws on missing type field", () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      id: "req-1",
      payload: {},
    });

    expect(() => parseMessage(raw)).toThrow(/type/i);
  });

  it("throws on invalid type value", () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: "unknown",
      id: "req-1",
      payload: {},
    });

    expect(() => parseMessage(raw)).toThrow(/type/i);
  });
});

// ---------------------------------------------------------------------------
// createResponse
// ---------------------------------------------------------------------------
describe("createResponse", () => {
  it("creates response with matching id and correct version/type", () => {
    const request: RequestEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-42",
      channel: "terminal.create",
      payload: {},
    };

    const payload = { terminalId: "t-new" };
    const response = createResponse(request, payload);

    expect(response.v).toBe(PROTOCOL_VERSION);
    expect(response.type).toBe("response");
    expect(response.id).toBe("req-42");
    expect(response.payload).toEqual({ terminalId: "t-new" });
    expect(response.error).toBeUndefined();
  });

  it("carries over channel from request", () => {
    const request: RequestEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-99",
      channel: "workspace.list",
      payload: {},
    };

    const response = createResponse(request, { workspaces: [] });
    expect(response.channel).toBe("workspace.list");
  });
});

// ---------------------------------------------------------------------------
// createError
// ---------------------------------------------------------------------------
describe("createError", () => {
  it("creates error response with error field", () => {
    const request: RequestEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-err",
      channel: "file.read",
      payload: {},
    };

    const response = createError(request, "FILE_NOT_FOUND", "No such file");

    expect(response.v).toBe(PROTOCOL_VERSION);
    expect(response.type).toBe("response");
    expect(response.id).toBe("req-err");
    expect(response.payload).toBeNull();
    expect(response.error).toEqual({
      code: "FILE_NOT_FOUND",
      message: "No such file",
    });
  });
});

// ---------------------------------------------------------------------------
// createEvent
// ---------------------------------------------------------------------------
describe("createEvent", () => {
  it("creates event envelope with correct type", () => {
    const event = createEvent("terminal.output", {
      terminalId: "t-1",
      data: "aGVsbG8=",
    });

    expect(event.v).toBe(PROTOCOL_VERSION);
    expect(event.type).toBe("event");
    expect(event.channel).toBe("terminal.output");
    expect(event.payload).toEqual({ terminalId: "t-1", data: "aGVsbG8=" });
  });
});

// ---------------------------------------------------------------------------
// MessageRouter
// ---------------------------------------------------------------------------
describe("MessageRouter", () => {
  it("dispatches to correct handler by envelope.channel", async () => {
    const router = new MessageRouter();
    let received: MessageEnvelope | null = null;

    router.handle("terminal.create", async (_conn, envelope) => {
      received = envelope as MessageEnvelope;
    });

    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-1",
      channel: "terminal.create",
      payload: { workspaceId: "ws-1" },
    };

    const conn: unknown = {};
    await router.route(conn, envelope);

    expect(received).not.toBeNull();
    expect(received!.payload).toEqual({ workspaceId: "ws-1" });
  });

  it("returns error response for unknown channel", async () => {
    const router = new MessageRouter();

    // No handlers registered
    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-missing",
      channel: "nonexistent.channel",
      payload: {},
    };

    const conn: unknown = {};
    const result = await router.route(conn, envelope);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("response");
    expect(result!.id).toBe("req-missing");
    expect(result!.error).toBeDefined();
    expect(result!.error!.code).toBe("INVALID_MESSAGE");
  });

  it("passes connection to handler", async () => {
    const router = new MessageRouter();
    let receivedConn: unknown = null;

    router.handle("test.channel", async (conn) => {
      receivedConn = conn;
    });

    const fakeConn = { id: "conn-1" };
    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-1",
      channel: "test.channel",
      payload: {},
    };

    await router.route(fakeConn, envelope);
    expect(receivedConn).toBe(fakeConn);
  });

  it("supports multiple handlers on different channels", async () => {
    const router = new MessageRouter();
    const called: string[] = [];

    router.handle("channel.a", async () => {
      called.push("a");
    });
    router.handle("channel.b", async () => {
      called.push("b");
    });

    const envelopeA: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-a",
      channel: "channel.a",
      payload: {},
    };

    const conn: unknown = {};
    await router.route(conn, envelopeA);
    expect(called).toEqual(["a"]);

    const envelopeB: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: "request",
      id: "req-b",
      channel: "channel.b",
      payload: {},
    };

    await router.route(conn, envelopeB);
    expect(called).toEqual(["a", "b"]);
  });
});
