export const VERSION = '0.1.0';
function detectPlatform() {
  if (typeof process !== 'undefined' && process.platform) return process.platform;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || navigator.platform || '';
    if (/Win/.test(ua)) return 'win32';
    if (/Mac/.test(ua)) return 'darwin';
  }
  return 'linux';
}
const _platform = detectPlatform();
export const IS_WINDOWS = _platform === 'win32';
export const IS_MACOS = _platform === 'darwin';
export const CLI_BINARY_NAME = IS_WINDOWS ? 'ymir.exe' : 'ymir';
export const APP_BINARY_NAME = IS_WINDOWS ? 'ymir-app.exe' : 'ymir-app';
export const SERVER_BINARY_NAME = IS_WINDOWS ? 'ymir-server.exe' : 'ymir-server';
export const GITHUB_REPO = 'harms-haus/ymir-terminal';
export const YMIR_HOME_DIR_NAME = '.ymir';
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
export const WS_RECONNECT_ATTEMPTS = 5;
export const WS_RECONNECT_BASE_DELAY_MS = 1000;
export const WS_RECONNECT_MAX_DELAY_MS = 16000;
export const CONFIG_DIR = '~/.config/ymir';
export const DB_FILE = 'ymir.db';
export const MAX_CONNECTIONS = 100;
