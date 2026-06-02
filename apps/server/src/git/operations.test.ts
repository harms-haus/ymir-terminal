import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageFiles, unstageFiles, discardChanges, commitChanges } from './operations';

function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, encoding: 'utf-8' });
}

/** Helper to fully initialize a repo with an initial commit. */
function initRepo(dir: string) {
  run('git init', dir);
  run('git config user.email "test@test.com"', dir);
  run('git config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test');
  run('git add .', dir);
  run('git commit -m "initial commit"', dir);
}

/** Return porcelain status lines from git. */
function getPorcelain(dir: string): string[] {
  return execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);
}

describe('git operations', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `ymir-git-ops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('stageFiles', () => {
    it('stages specified new files', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'hello');

      await stageFiles(testDir, ['new.txt']);

      const lines = getPorcelain(testDir);
      const entry = lines.find((l) => l.endsWith('new.txt'));
      expect(entry).toBeDefined();
      // Staged new file: index status is 'A'
      expect(entry![0]).toBe('A');
    });

    it('throws when no files specified', async () => {
      initRepo(testDir);
      await expect(stageFiles(testDir, [])).rejects.toThrow('No files specified');
    });
  });

  describe('unstageFiles', () => {
    it('unstages specified files', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file.txt'), 'original');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      // Modify and stage
      writeFileSync(join(testDir, 'file.txt'), 'modified');
      run('git add .', testDir);

      await unstageFiles(testDir, ['file.txt']);

      const lines = getPorcelain(testDir);
      const entry = lines.find((l) => l.endsWith('file.txt'));
      expect(entry).toBeDefined();
      // Staged modification unstaged: index is ' ', work tree is 'M'
      expect(entry![0]).toBe(' ');
      expect(entry![1]).toBe('M');
    });

    it('throws when no files specified', async () => {
      initRepo(testDir);
      await expect(unstageFiles(testDir, [])).rejects.toThrow('No files specified');
    });
  });

  describe('discardChanges', () => {
    it('restores modified tracked files to HEAD state', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file.txt'), 'original');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      // Modify the file
      writeFileSync(join(testDir, 'file.txt'), 'modified');

      await discardChanges(testDir, ['file.txt']);

      expect(readFileSync(join(testDir, 'file.txt'), 'utf-8')).toBe('original');
      // Working tree should be clean
      expect(getPorcelain(testDir).length).toBe(0);
    });

    it('throws when no files specified', async () => {
      initRepo(testDir);
      await expect(discardChanges(testDir, [])).rejects.toThrow('No files specified');
    });
  });

  describe('commitChanges', () => {
    it('commits staged changes and returns the commit hash', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'content');
      run('git add .', testDir);

      const hash = await commitChanges(testDir, 'test commit');

      // Hash should be a non-empty hex string
      expect(hash).toMatch(/^[0-9a-f]{40}$/);

      // Verify commit exists in log
      const log = execSync('git log --oneline -1', { cwd: testDir, encoding: 'utf-8' }).trim();
      expect(log).toContain('test commit');
    });

    it('throws when commit message is empty', async () => {
      initRepo(testDir);
      await expect(commitChanges(testDir, '')).rejects.toThrow('Commit message cannot be empty');
      await expect(commitChanges(testDir, '   ')).rejects.toThrow('Commit message cannot be empty');
    });
  });
});
