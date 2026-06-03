import { IS_WINDOWS, CONFIG_DIR, DB_FILE, YMIR_HOME_DIR_NAME } from './constants';

// Node.js modules — only available in server/CLI context, not in browser
let _os: typeof import('node:os') | null = null; // eslint-disable-line @typescript-eslint/consistent-type-imports
let _path: typeof import('node:path') | null = null; // eslint-disable-line @typescript-eslint/consistent-type-imports

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
  if (typeof Buffer !== 'undefined') {
    if (typeof data === 'string') {
      return Buffer.from(data, 'utf8').toString('base64');
    }
    return Buffer.from(data).toString('base64');
  }
  // Browser fallback
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(data: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'base64');
  }
  // Browser fallback
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

function getConfigDir(): string {
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
