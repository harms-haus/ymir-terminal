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
  fileExists,
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
  test('returns file content as string', () => {
    const filePath = join(tempDir, 'hello.txt');
    writeFileSync(filePath, 'hello world');
    expect(readFile(filePath)).toBe('hello world');
  });

  test('throws with descriptive message for nonexistent file', () => {
    const filePath = join(tempDir, 'nope.txt');
    expect(() => readFile(filePath)).toThrow(/failed to read file/i);
  });
});

// ── writeFile ─────────────────────────────────────────────────────────────────

describe('writeFile', () => {
  test('creates a new file with the given content', () => {
    const filePath = join(tempDir, 'new.txt');
    writeFile(filePath, 'created');
    expect(readFileSync(filePath, 'utf-8')).toBe('created');
  });

  test('overwrites an existing file', () => {
    const filePath = join(tempDir, 'overwrite.txt');
    writeFileSync(filePath, 'old');
    writeFile(filePath, 'new');
    expect(readFileSync(filePath, 'utf-8')).toBe('new');
  });

  test('creates parent directories if they do not exist', () => {
    const filePath = join(tempDir, 'a', 'b', 'deep.txt');
    writeFile(filePath, 'nested');
    expect(readFileSync(filePath, 'utf-8')).toBe('nested');
  });
});

// ── deleteFile ────────────────────────────────────────────────────────────────

describe('deleteFile', () => {
  test('removes an existing file', () => {
    const filePath = join(tempDir, 'gone.txt');
    writeFileSync(filePath, 'bye');
    deleteFile(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  test('throws with descriptive message for nonexistent file', () => {
    const filePath = join(tempDir, 'ghost.txt');
    expect(() => deleteFile(filePath)).toThrow(/failed to delete file/i);
  });
});

// ── renameFile ────────────────────────────────────────────────────────────────

describe('renameFile', () => {
  test('renames a file to a new path', () => {
    const oldPath = join(tempDir, 'old.txt');
    const newPath = join(tempDir, 'new.txt');
    writeFileSync(oldPath, 'moved');
    renameFile(oldPath, newPath);
    expect(existsSync(oldPath)).toBe(false);
    expect(readFileSync(newPath, 'utf-8')).toBe('moved');
  });

  test('throws with descriptive message when destination already exists', () => {
    const oldPath = join(tempDir, 'src.txt');
    const newPath = join(tempDir, 'dst.txt');
    writeFileSync(oldPath, 'a');
    writeFileSync(newPath, 'b');
    expect(() => renameFile(oldPath, newPath)).toThrow(/failed to rename file/i);
  });

  test('throws with descriptive message for nonexistent source', () => {
    const oldPath = join(tempDir, 'missing.txt');
    const newPath = join(tempDir, 'target.txt');
    expect(() => renameFile(oldPath, newPath)).toThrow(/failed to rename file/i);
  });
});

// ── createFile ────────────────────────────────────────────────────────────────

describe('createFile', () => {
  test('creates an empty file', () => {
    const filePath = join(tempDir, 'empty.txt');
    createFile(filePath);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('');
  });

  test('creates parent directories', () => {
    const filePath = join(tempDir, 'x', 'y', 'z', 'file.txt');
    createFile(filePath);
    expect(existsSync(filePath)).toBe(true);
  });
});

// ── createDirectory ───────────────────────────────────────────────────────────

describe('createDirectory', () => {
  test('creates a directory', () => {
    const dirPath = join(tempDir, 'mydir');
    createDirectory(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });

  test('creates parent directories', () => {
    const dirPath = join(tempDir, 'a', 'b', 'c');
    createDirectory(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });

  test('does not throw if directory already exists', () => {
    const dirPath = join(tempDir, 'exists');
    createDirectory(dirPath);
    expect(() => createDirectory(dirPath)).not.toThrow();
  });
});

// ── fileExists ────────────────────────────────────────────────────────────────

describe('fileExists', () => {
  test('returns true for an existing file', () => {
    const filePath = join(tempDir, 'real.txt');
    writeFileSync(filePath, 'yes');
    expect(fileExists(filePath)).toBe(true);
  });

  test('returns false for a nonexistent file', () => {
    const filePath = join(tempDir, 'phantom.txt');
    expect(fileExists(filePath)).toBe(false);
  });
});
