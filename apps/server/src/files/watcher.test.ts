import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startWatcher, stopWatcher, stopAllWatchers } from './watcher';

const TEST_DIR = join(tmpdir(), 'ymir-watcher-test');

describe('File watcher', () => {
  afterEach(() => {
    stopAllWatchers();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('startWatcher returns a watcher object with a close() method', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const managed = startWatcher(TEST_DIR, () => {});

    expect(managed).toBeDefined();
    expect(typeof managed.close).toBe('function');
    expect(typeof managed.dirPath).toBe('string');
    expect(managed.dirPath).toBe(TEST_DIR);
    expect(managed.watcher).toBeDefined();
  });

  test('startWatcher accepts a callback function', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const callback = () => {};
    const managed = startWatcher(TEST_DIR, callback);

    expect(managed).toBeDefined();
  });

  test('stopWatcher closes the watcher for a given directory', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const managed = startWatcher(TEST_DIR, () => {});

    // Should not throw
    stopWatcher(TEST_DIR);

    // Calling close again on the raw watcher should be safe (idempotent)
    expect(() => managed.watcher.close()).not.toThrow();
  });

  test('stopWatcher is a no-op for a non-watched directory', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    startWatcher(TEST_DIR, () => {});

    // Should not throw
    expect(() => stopWatcher('/nonexistent/path')).not.toThrow();
  });

  test('stopAllWatchers closes all active watchers', () => {
    const dir1 = join(TEST_DIR, 'dir1');
    const dir2 = join(TEST_DIR, 'dir2');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });

    const managed1 = startWatcher(dir1, () => {});
    const managed2 = startWatcher(dir2, () => {});

    stopAllWatchers();

    // Both watchers should be closed (close is idempotent, won't throw)
    expect(() => managed1.watcher.close()).not.toThrow();
    expect(() => managed2.watcher.close()).not.toThrow();
  });

  test('stopAllWatchers is safe when no watchers are active', () => {
    expect(() => stopAllWatchers()).not.toThrow();
  });

  test('multiple watchers can coexist on different directories', () => {
    const dir1 = join(TEST_DIR, 'dir1');
    const dir2 = join(TEST_DIR, 'dir2');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });

    const m1 = startWatcher(dir1, () => {});
    const m2 = startWatcher(dir2, () => {});

    expect(m1.dirPath).toBe(dir1);
    expect(m2.dirPath).toBe(dir2);
  });

  test('chokidar events map to correct FileChangeEvent kinds', async () => {
    const dirPath = join(TEST_DIR, 'event-map-test');
    mkdirSync(dirPath, { recursive: true });

    const events: Array<{ kind: string; path: string }> = [];

    const watcherReady = new Promise<void>((resolve) => {
      const managed = startWatcher(dirPath, (event) => {
        events.push({ kind: event.kind, path: event.path });
      });
      managed.watcher.on('ready', () => resolve());
    });

    // Wait for chokidar to finish initial scanning
    await watcherReady;

    const testFile = join(dirPath, 'test.txt');

    // Create a file
    writeFileSync(testFile, 'hello');
    await Bun.sleep(300);

    // Modify the file
    writeFileSync(testFile, 'world');
    await Bun.sleep(300);

    // Delete the file
    rmSync(testFile);
    await Bun.sleep(300);

    const createEvents = events.filter((e) => e.kind === 'create' && e.path === testFile);
    const modifyEvents = events.filter((e) => e.kind === 'modify' && e.path === testFile);
    const deleteEvents = events.filter((e) => e.kind === 'delete' && e.path === testFile);

    expect(createEvents.length).toBe(1);
    expect(modifyEvents.length).toBe(1);
    expect(deleteEvents.length).toBe(1);
  });
});
