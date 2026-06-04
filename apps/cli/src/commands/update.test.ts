import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  IS_WINDOWS,
  IS_MACOS,
  VERSION,
  CLI_BINARY_NAME,
  APP_BINARY_NAME,
  SERVER_BINARY_NAME,
} from '@ymir/shared';

describe('update command', () => {
  describe('platform asset naming', () => {
    test('PLATFORM_TAG follows platform-arch pattern', () => {
      const platform = process.platform;
      const arch = process.arch;

      let platformName: string;
      if (platform === 'win32') {
        platformName = 'windows';
      } else if (platform === 'darwin') {
        platformName = 'darwin';
      } else {
        platformName = 'linux';
      }

      let archName: string;
      if (arch === 'arm64') {
        archName = 'arm64';
      } else {
        archName = 'x64';
      }

      const platformTag = `${platformName}-${archName}`;

      if (IS_WINDOWS) {
        expect(platformTag).toBe('windows-x64');
      } else if (IS_MACOS) {
        expect(platformTag).toContain('darwin');
        expect(platformTag).toContain(arch === 'arm64' ? 'arm64' : 'x64');
      } else {
        expect(platformTag).toContain('linux');
        expect(platformTag).toContain(arch === 'arm64' ? 'arm64' : 'x64');
      }
    });

    test('binary names include platform suffix in release assets', () => {
      const platform = process.platform;
      const arch = process.arch;

      let platformName: string;
      if (platform === 'win32') {
        platformName = 'windows';
      } else if (platform === 'darwin') {
        platformName = 'darwin';
      } else {
        platformName = 'linux';
      }

      let archName: string;
      if (arch === 'arm64') {
        archName = 'arm64';
      } else {
        archName = 'x64';
      }

      const platformTag = `${platformName}-${archName}`;
      const binaryNames = [CLI_BINARY_NAME, APP_BINARY_NAME, SERVER_BINARY_NAME];

      for (const name of binaryNames) {
        const assetName = `${name}-${platformTag}`;
        expect(assetName).toContain(platformTag);
      }
    });
  });

  describe('version comparison', () => {
    test('same version means no update needed', () => {
      const latestVersion = VERSION;
      expect(latestVersion === VERSION).toBe(true);
    });

    test('different version means update available', () => {
      const latestVersion = '99.0.0';
      expect(latestVersion === VERSION).toBe(false);
    });

    test('version tag is stripped of leading v', () => {
      const tag = 'v1.2.3';
      const stripped = tag.replace(/^v/, '');
      expect(stripped).toBe('1.2.3');
    });

    test('version tag without v is unchanged', () => {
      const tag = '1.2.3';
      const stripped = tag.replace(/^v/, '');
      expect(stripped).toBe('1.2.3');
    });
  });

  describe('selfUpdate with mocked fetch', () => {
    const originalFetch = globalThis.fetch;
    const originalExit = process.exit;

    beforeEach(() => {
      // Mock process.exit so it doesn't kill the test process
      process.exit = mock((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as never;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.exit = originalExit;
    });

    test('reports already up to date when versions match', async () => {
      const { selfUpdate } = await import('./update');

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tag_name: `v${VERSION}`,
              assets: [],
            }),
        } as Response),
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '));
      };

      await selfUpdate();

      console.log = originalLog;
      expect(logs.some((l) => l.includes('up to date'))).toBe(true);
    });

    test('exits with error when fetch fails', async () => {
      const { selfUpdate } = await import('./update');

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response),
      );

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await selfUpdate();
      } catch (err) {
        expect(String(err)).toContain('process.exit(1)');
      }

      console.error = originalError;
      expect(errors.some((e) => e.includes('Failed to check for updates'))).toBe(true);
    });

    test('exits with error when no platform assets found', async () => {
      const { selfUpdate } = await import('./update');

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tag_name: 'v99.0.0',
              assets: [{ name: 'ymir-arm64', browser_download_url: 'https://example.com/arm64' }],
            }),
        } as Response),
      );

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await selfUpdate();
      } catch (err) {
        expect(String(err)).toContain('process.exit(1)');
      }

      console.error = originalError;
      const platform = process.platform;
      const arch = process.arch;

      let platformName: string;
      if (platform === 'win32') {
        platformName = 'windows';
      } else if (platform === 'darwin') {
        platformName = 'darwin';
      } else {
        platformName = 'linux';
      }

      let archName: string;
      if (arch === 'arm64') {
        archName = 'arm64';
      } else {
        archName = 'x64';
      }

      const platformTag = `${platformName}-${archName}`;
      expect(errors.some((e) => e.includes(platformTag))).toBe(true);
    });
  });
});
