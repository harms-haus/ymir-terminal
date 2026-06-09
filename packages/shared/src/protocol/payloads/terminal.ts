export interface TerminalCreateRequest {
  workspaceId: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  command?: string;
}

export interface TerminalCreateResponse {
  terminalId: string;
}

export interface TerminalInputRequest {
  terminalId: string;
  /** Base64-encoded input data. */
  data: string;
}

export interface TerminalResizeRequest {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface TerminalOutputEvent {
  terminalId: string;
  /** Base64-encoded output data. */
  data: string;
}

export interface TerminalCloseRequest {
  terminalId: string;
}

export interface TerminalExitEvent {
  terminalId: string;
  exitCode: number;
}

export interface TerminalStateRequest {
  terminalId: string;
}

export interface TerminalStateResponse {
  terminalId: string;
  /** Base64-encoded raw VT byte buffer. */
  data: string;
  cols: number;
  rows: number;
}
