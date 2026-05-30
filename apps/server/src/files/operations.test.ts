import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  createFile,
  createDirectory,
} from './operations';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ymir-file-ops-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ── readFile ──────────────────────────────────────────────────────────────────

describe('readFile', () => {
  test('returns file content as string', async () => {
    const filePath = join(tempDir, 'hello.txt');
    writeFileSync(filePath, 'hello world');
    expect(await readFile(filePath)).toBe('hello world');
  });

  test('throws with descriptive message for nonexistent file', async () => {
    const filePath = join(tempDir, 'nope.txt');
    expect(readFile(filePath)).rejects.toThrow(/failed to read file/i);
  });
});

// ── writeFile ─────────────────────────────────────────────────────────────────

describe('writeFile', () => {
  test('creates a new file with the given content', async () => {
    const filePath = join(tempDir, 'new.txt');
    await writeFile(filePath, 'created');
    expect(readFileSync(filePath, 'utf-8')).toBe('created');
  });

  test('overwrites an existing file', async () => {
    const filePath = join(tempDir, 'overwrite.txt');
    writeFileSync(filePath, 'old');
    await writeFile(filePath, 'new');
    expect(readFileSync(filePath, 'utf-8')).toBe('new');
  });

  test('creates parent directories if they do not exist', async () => {
    const filePath = join(tempDir, 'a', 'b', 'deep.txt');
    await writeFile(filePath, 'nested');
    expect(readFileSync(filePath, 'utf-8')).toBe('nested');
  });
});

// ── deleteFile ────────────────────────────────────────────────────────────────

describe('deleteFile', () => {
  test('removes an existing file', async () => {
    const filePath = join(tempDir, 'gone.txt');
    writeFileSync(filePath, 'bye');
    await deleteFile(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  test('throws with descriptive message for nonexistent file', async () => {
    const filePath = join(tempDir, 'ghost.txt');
    expect(deleteFile(filePath)).rejects.toThrow(/failed to delete file/i);
  });
});

// ── renameFile ────────────────────────────────────────────────────────────────

describe('renameFile', () => {
  test('renames a file to a new path', async () => {
    const oldPath = join(tempDir, 'old.txt');
    const newPath = join(tempDir, 'new.txt');
    writeFileSync(oldPath, 'moved');
    await renameFile(oldPath, newPath);
    expect(existsSync(oldPath)).toBe(false);
    expect(readFileSync(newPath, 'utf-8')).toBe('moved');
  });

  test('throws with descriptive message when destination already exists', async () => {
    const oldPath = join(tempDir, 'src.txt');
    const newPath = join(tempDir, 'dst.txt');
    writeFileSync(oldPath, 'a');
    writeFileSync(newPath, 'b');
    expect(renameFile(oldPath, newPath)).rejects.toThrow(/failed to rename file/i);
  });

  test('throws with descriptive message for nonexistent source', async () => {
    const oldPath = join(tempDir, 'missing.txt');
    const newPath = join(tempDir, 'target.txt');
    expect(renameFile(oldPath, newPath)).rejects.toThrow(/failed to rename file/i);
  });
});

// ── createFile ────────────────────────────────────────────────────────────────

describe('createFile', () => {
  test('creates an empty file', async () => {
    const filePath = join(tempDir, 'empty.txt');
    await createFile(filePath);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('');
  });

  test('creates parent directories', async () => {
    const filePath = join(tempDir, 'x', 'y', 'z', 'file.txt');
    await createFile(filePath);
    expect(existsSync(filePath)).toBe(true);
  });
});

// ── createDirectory ───────────────────────────────────────────────────────────

describe('createDirectory', () => {
  test('creates a directory', async () => {
    const dirPath = join(tempDir, 'mydir');
    await createDirectory(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });

  test('creates parent directories', async () => {
    const dirPath = join(tempDir, 'a', 'b', 'c');
    await createDirectory(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });

  test('does not throw if directory already exists', async () => {
    const dirPath = join(tempDir, 'exists');
    await createDirectory(dirPath);
    expect(createDirectory(dirPath)).resolves.toBeUndefined();
  });
});
