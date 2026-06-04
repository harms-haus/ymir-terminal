import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  copyFile as fsCopyFile,
  mkdir,
  unlink,
  rename,
  access,
  cp,
  constants,
} from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

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
    const exists = await access(newPath)
      .then(() => true)
      .catch(() => false);
    if (exists) throw new Error(`Destination already exists: ${newPath}`);
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

export async function copyFile(srcPath: string, destPath: string): Promise<void> {
  try {
    await mkdir(dirname(destPath), { recursive: true });
    await fsCopyFile(srcPath, destPath, constants.COPYFILE_EXCL);
  } catch (err) {
    throw new Error(`Failed to copy file: ${srcPath} -> ${destPath}`, { cause: err });
  }
}

export async function findAvailableName(dirPath: string, baseName: string): Promise<string> {
  const fullPath = join(dirPath, baseName);
  try {
    await access(fullPath, constants.F_OK);
  } catch {
    return baseName;
  }

  const ext = extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;

  const copyName = `${stem} copy${ext}`;
  try {
    await access(join(dirPath, copyName), constants.F_OK);
  } catch {
    return copyName;
  }

  const MAX_COPIES = 1000;
  for (let i = 2; i < MAX_COPIES; i++) {
    const candidate = `${stem} copy ${i}${ext}`;
    try {
      await access(join(dirPath, candidate), constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error(`Too many copies exist for "${baseName}" in "${dirPath}"`);
}

export async function copyDirectory(srcPath: string, destPath: string): Promise<void> {
  try {
    await cp(srcPath, destPath, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to copy directory: ${srcPath} -> ${destPath}`, { cause: err });
  }
}
