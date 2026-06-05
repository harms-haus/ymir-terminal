import { IS_WINDOWS, CONFIG_DIR, DB_FILE, YMIR_HOME_DIR_NAME } from './constants';
// Node.js modules — only available in server/CLI context, not in browser
let _os = null;
let _path = null;
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
function getWindowsLocalAppData() {
  const os = getOs();
  const path = getPath();
  if (!os || !path) throw new Error('Node.js not available');
  return process.env?.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}
export function generateId() {
  // Try native crypto.randomUUID() first
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: generate v4 UUID using crypto.getRandomValues
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set version nibble (byte 6 high nibble = 4)
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Set variant nibble (byte 8 high bits = 10)
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Fall through to Math.random fallback
  }

  throw new Error(
    'generateId(): No cryptographically secure random number generator available. ' +
      'This environment does not support crypto.randomUUID() or crypto.getRandomValues().',
  );
}
export function toBase64(data) {
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
export function fromBase64(data) {
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
export function expandTilde(filePath) {
  const os = getOs();
  const path = getPath();
  if (!os || !path) return filePath; // Can't expand in browser
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}
function getConfigDir() {
  const os = getOs();
  const path = getPath();
  if (!os || !path) return '';
  if (IS_WINDOWS) {
    return path.join(getWindowsLocalAppData(), 'ymir');
  }
  return expandTilde(CONFIG_DIR);
}
export function getDbPath() {
  const path = getPath();
  if (!path) return '';
  return path.join(getConfigDir(), DB_FILE);
}
export function getYmirHomeDir() {
  const os = getOs();
  const path = getPath();
  if (!os || !path) return '';
  if (IS_WINDOWS) {
    return path.join(getWindowsLocalAppData(), 'ymir');
  }
  return path.join(os.homedir(), YMIR_HOME_DIR_NAME);
}
