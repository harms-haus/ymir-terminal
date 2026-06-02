import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  createFile,
  createDirectory,
  findAvailableName,
  copyDirectory,
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

// ── findAvailableName ─────────────────────────────────────────────────────────

describe('findAvailableName', () => {
  test('returns baseName when no conflict', async () => {
    const result = await findAvailableName(tempDir, 'foo.txt');
    expect(result).toBe('foo.txt');
  });

  test('appends " copy" on conflict (preserving extension)', async () => {
    writeFileSync(join(tempDir, 'foo.ts'), '');
    const result = await findAvailableName(tempDir, 'foo.ts');
    expect(result).toBe('foo copy.ts');
  });

  test('appends " copy 2" when " copy" also exists', async () => {
    writeFileSync(join(tempDir, 'bar.txt'), '');
    writeFileSync(join(tempDir, 'bar copy.txt'), '');
    const result = await findAvailableName(tempDir, 'bar.txt');
    expect(result).toBe('bar copy 2.txt');
  });

  test('works with no extension (e.g., "Makefile")', async () => {
    writeFileSync(join(tempDir, 'Makefile'), '');
    const result = await findAvailableName(tempDir, 'Makefile');
    expect(result).toBe('Makefile copy');
  });
});

// ── copyDirectory ─────────────────────────────────────────────────────────────

describe('copyDirectory', () => {
  test('copies a directory with files recursively', async () => {
    const srcDir = join(tempDir, 'src');
    const destDir = join(tempDir, 'dest');
    mkdirSync(join(srcDir, 'sub'), { recursive: true });
    writeFileSync(join(srcDir, 'a.txt'), 'aaa');
    writeFileSync(join(srcDir, 'sub', 'b.txt'), 'bbb');

    await copyDirectory(srcDir, destDir);

    expect(existsSync(join(destDir, 'a.txt'))).toBe(true);
    expect(existsSync(join(destDir, 'sub', 'b.txt'))).toBe(true);
  });

  test('preserves file contents', async () => {
    const srcDir = join(tempDir, 'src');
    const destDir = join(tempDir, 'dest');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'data.txt'), 'hello world');

    await copyDirectory(srcDir, destDir);

    expect(readFileSync(join(destDir, 'data.txt'), 'utf-8')).toBe('hello world');
  });
});
