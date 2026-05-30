import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getGitStatus, isGitRepo, getCurrentBranch, type GitStatusResponse } from './status';
function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, encoding: 'utf-8' });
}

describe('git status', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ymir-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    it('returns true for a git repo', () => {
      run('git init', testDir);
      expect(isGitRepo(testDir)).toBe(true);
    });

    it('returns false for a non-git directory', () => {
      expect(isGitRepo(testDir)).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns the current branch name', async () => {
      run('git init', testDir);
      run('git config user.email "test@test.com"', testDir);
      run('git config user.name "Test"', testDir);
      writeFileSync(join(testDir, 'a.txt'), 'hello');
      run('git add .', testDir);
      run('git commit -m "initial"', testDir);
      const branch = await getCurrentBranch(testDir);
      expect(branch === 'master' || branch === 'main').toBe(true);
    });

    it('returns null for a non-git directory', async () => {
      expect(await getCurrentBranch(testDir)).toBeNull();
    });
  });

  describe('getGitStatus', () => {
    it('returns null for a non-git directory', async () => {
      expect(await getGitRepoStatus(testDir)).toBeNull();
    });

    it('returns branch name in result', async () => {
      initRepo(testDir);
      const result = (await getGitRepoStatus(testDir))!;
      expect(result.branch === 'master' || result.branch === 'main').toBe(true);
    });

    it('detects untracked files in changes', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'content');
      const result = (await getGitRepoStatus(testDir))!;
      expect(result.changes.length).toBeGreaterThanOrEqual(1);
      const untracked = result.changes.find(
        (c: { path: string; status: string }) => c.path === 'new.txt',
      );
      expect(untracked).toBeDefined();
      expect(untracked!.status).toBe('??');
    });

    it('detects modified files in changes', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'existing.txt'), 'original');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      // Modify the file (unstaged)
      appendFileSync(join(testDir, 'existing.txt'), ' modified');
      const result = (await getGitRepoStatus(testDir))!;
      const modified = result.changes.find(
        (c: { path: string; status: string }) => c.path === 'existing.txt',
      );
      expect(modified).toBeDefined();
      expect(modified!.status).toBe('M');
    });

    it('detects staged files in staged', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'staged.txt'), 'staged content');
      run('git add .', testDir);
      const result = (await getGitRepoStatus(testDir))!;
      const staged = result.staged.find(
        (c: { path: string; status: string }) => c.path === 'staged.txt',
      );
      expect(staged).toBeDefined();
      expect(staged!.status).toBe('A');
    });

    it('detects staged modifications separately from unstaged changes', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file.txt'), 'v1');
      run('git add .', testDir);
      run('git commit -m "initial"', testDir);

      // Stage a modification
      writeFileSync(join(testDir, 'file.txt'), 'v2');
      run('git add .', testDir);

      // Then make another unstaged modification
      writeFileSync(join(testDir, 'file.txt'), 'v3');

      const result = (await getGitRepoStatus(testDir))!;
      const staged = result.staged.find(
        (c: { path: string; status: string }) => c.path === 'file.txt',
      );
      const changes = result.changes.find(
        (c: { path: string; status: string }) => c.path === 'file.txt',
      );
      expect(staged).toBeDefined();
      expect(staged!.status).toBe('M');
      expect(changes).toBeDefined();
      expect(changes!.status).toBe('M');
    });

    it('detects deleted files', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'to-delete.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      // Delete the file (unstaged deletion)
      run('rm to-delete.txt', testDir);
      const result = (await getGitRepoStatus(testDir))!;
      const deleted = result.changes.find(
        (c: { path: string; status: string }) => c.path === 'to-delete.txt',
      );
      expect(deleted).toBeDefined();
      expect(deleted!.status).toBe('D');
    });

    it('returns empty arrays when working tree is clean', async () => {
      initRepo(testDir);
      const result = (await getGitRepoStatus(testDir))!;
      expect(result.changes).toEqual([]);
      expect(result.staged).toEqual([]);
    });

    it('handles renamed files', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'original.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      run('git mv original.txt renamed.txt', testDir);
      const result = (await getGitRepoStatus(testDir))!;
      const staged = result.staged.find(
        (c: { path: string; status: string }) => c.path === 'renamed.txt',
      );
      expect(staged).toBeDefined();
    });
  });
});

/** Helper to fully initialize a repo with an initial commit on master. */
function initRepo(dir: string) {
  run('git init', dir);
  run('git config user.email "test@test.com"', dir);
  run('git config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test');
  run('git add .', dir);
  run('git commit -m "initial commit"', dir);
}

/**
 * Wrapper to avoid name clash with the `getGitStatus` import used by
 * the `null` test (which needs the raw function to test non-git dirs).
 */
async function getGitRepoStatus(dirPath: string): Promise<GitStatusResponse | null> {
  return getGitStatus(dirPath);
}
