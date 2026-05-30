import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, unlink, rename, access } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readFile(path: string): Promise<string> {
  try {
    return await fsReadFile(path, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${path}`, { cause: err });
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, content, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write file: ${path}`, { cause: err });
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    throw new Error(`Failed to delete file: ${path}`, { cause: err });
  }
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  try {
    try {
      await access(newPath);
      throw new Error(`Destination already exists: ${newPath}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Destination already exists')) {
        throw err;
      }
      // access threw because file doesn't exist — proceed
    }
    await rename(oldPath, newPath);
  } catch (err) {
    throw new Error(`Failed to rename file: ${oldPath} -> ${newPath}`, { cause: err });
  }
}

export async function createFile(path: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, '', 'utf-8');
  } catch (err) {
    throw new Error(`Failed to create file: ${path}`, { cause: err });
  }
}

export async function createDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create directory: ${path}`, { cause: err });
  }
}
