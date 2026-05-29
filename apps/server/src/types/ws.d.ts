declare module 'ws' {
  class WebSocket {
    static CONNECTING: 0;
    static OPEN: 1;
    static CLOSING: 2;
    static CLOSED: 3;
    readonly readyState: number;
    readonly url: string;
    constructor(url: string, protocols?: string | string[]);
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code?: number, reason?: string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: unknown) => void): this;
    send(data: string | Buffer | ArrayBuffer | Buffer[], cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
  }
  export = WebSocket;
}
