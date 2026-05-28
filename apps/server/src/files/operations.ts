import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { dirname } from 'node:path';

export function readFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${path}`, { cause: err });
  }
}

export function writeFile(path: string, content: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write file: ${path}`, { cause: err });
  }
}

export function deleteFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (err) {
    throw new Error(`Failed to delete file: ${path}`, { cause: err });
  }
}

export function renameFile(oldPath: string, newPath: string): void {
  try {
    if (existsSync(newPath)) {
      throw new Error(`Destination already exists: ${newPath}`);
    }
    renameSync(oldPath, newPath);
  } catch (err) {
    throw new Error(`Failed to rename file: ${oldPath} -> ${newPath}`, { cause: err });
  }
}

export function createFile(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '', 'utf-8');
  } catch (err) {
    throw new Error(`Failed to create file: ${path}`, { cause: err });
  }
}

export function createDirectory(path: string): void {
  try {
    mkdirSync(path, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create directory: ${path}`, { cause: err });
  }
}
