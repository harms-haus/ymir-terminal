import {
  IS_WINDOWS,
  CONFIG_DIR,
  DB_FILE,
  SERVER_BINARY_NAME,
  YMIR_HOME_DIR_NAME,
  APP_BINARY_NAME,
} from './constants';

// Node.js modules — only available in server/CLI context, not in browser
let _os: typeof import('node:os') | null = null;
let _path: typeof import('node:path') | null = null;

function getOs() {
  if (!_os) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _os = require('node:os');
    } catch {
      return null;
    }
  }
  return _os;
}

function getPath() {
  if (!_path) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _path = require('node:path');
    } catch {
      return null;
    }
  }
  return _path;
}

function getWindowsLocalAppData(): string {
  const os = getOs();
  const path = getPath();
  if (!os || !path) throw new Error('Node.js not available');
  return process.env?.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function toBase64(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function expandTilde(filePath: string): string {
  const os = getOs();
  const path = getPath();
  if (!os || !path) return filePath; // Can't expand in browser
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function getConfigDir(): string {
  const path = getPath();
  if (!path) return '';
  if (IS_WINDOWS) {
    return path.join(getWindowsLocalAppData(), 'ymir');
  }
  return expandTilde(CONFIG_DIR);
}

export function getDbPath(): string {
  const path = getPath();
  if (!path) return '';
  return path.join(getConfigDir(), DB_FILE);
}

export function getYmirHomeDir(): string {
  const os = getOs();
  const path = getPath();
  if (!os || !path) return '';
  if (IS_WINDOWS) {
    return path.join(getWindowsLocalAppData(), 'ymir');
  }
  return path.join(os.homedir(), YMIR_HOME_DIR_NAME);
}

export function getClientDistDir(): string {
  const path = getPath();
  if (!path) return '';
  return path.join(getYmirHomeDir(), 'client-dist');
}

export function getServerBinaryPath(): string {
  const path = getPath();
  if (!path) return '';
  return path.join(getYmirHomeDir(), SERVER_BINARY_NAME);
}

export function getAppBinaryPath(): string {
  const path = getPath();
  if (!path) return '';
  return path.join(getYmirHomeDir(), APP_BINARY_NAME);
}
