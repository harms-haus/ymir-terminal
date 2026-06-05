import {
  PROTOCOL_VERSION,
  WS_RECONNECT_ATTEMPTS,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
} from '@ymir/shared';
import type { MessageEnvelope, ConnectionStatus } from '@ymir/shared';

export type { ConnectionStatus };

const MAX_PENDING_MESSAGES = 100;

class WSClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: ((envelope: MessageEnvelope) => void)[] = [];
  private statusHandlers: ((status: ConnectionStatus) => void)[] = [];
  private token: string | null = null;
  private status: ConnectionStatus = 'disconnected';
  private intentionalClose = false;
  private pendingMessages: MessageEnvelope[] = [];
  private disconnectEpoch = 0;

  connect(url: string): void {
    this.url = url;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.createConnection();
  }

  send(envelope: MessageEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
        this.pendingMessages.shift();
      }
      this.pendingMessages.push(envelope);
      return;
    }
    const outgoing = this.token ? { ...envelope, token: this.token } : envelope;
    this.ws.send(JSON.stringify(outgoing));
  }

  onMessage(handler: (envelope: MessageEnvelope) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler);
    };
  }

  setToken(token: string): void {
    this.token = token;
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.pendingMessages = [];

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.notifyStatus('disconnected');
  }

  getDisconnectEpoch(): number {
    return this.disconnectEpoch;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getUrl(): string {
    return this.url;
  }

  disconnectAndRejectPending(): void {
    this.disconnectEpoch++;
    this.disconnect();
  }

  private createConnection(): void {
    // Tear down any prior connection before opening a new one.
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.notifyStatus('connecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyStatus('connected');
      this.flushPendingMessages();
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const envelope = JSON.parse(ev.data) as MessageEnvelope;
        if (envelope.v !== PROTOCOL_VERSION) {
          console.warn(`Received message with unsupported protocol version: ${envelope.v}`);
          return;
        }
        for (const handler of this.messageHandlers) {
          handler(envelope);
        }
      } catch (err) {
        // Ignore malformed messages
        console.warn('[ws-client] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      if (this.intentionalClose) {
        this.notifyStatus('disconnected');
        return;
      }

      this.notifyStatus('disconnected');
      this.attemptReconnect();
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= WS_RECONNECT_ATTEMPTS) {
      this.pendingMessages = [];
      return;
    }

    this.reconnectAttempts++;
    this.notifyStatus('reconnecting');

    const delay = Math.min(
      WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      WS_RECONNECT_MAX_DELAY_MS,
    );

    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private flushPendingMessages(): void {
    const pending = this.pendingMessages;
    this.pendingMessages = [];
    for (const envelope of pending) {
      this.send(envelope);
    }
  }

  private notifyStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}

export const wsClient = new WSClient();
