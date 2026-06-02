import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  stageFiles,
  unstageFiles,
  discardChanges,
  commitChanges,
  stageAllFiles,
  unstageAllFiles,
  discardAllChanges,
  commitAmend,
  commitAll,
  resetSoft,
} from './operations';

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

  describe('stageAllFiles', () => {
    it('stages all changes including new files', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'hello');
      writeFileSync(join(testDir, 'README.md'), '# modified');

      await stageAllFiles(testDir);

      const lines = getPorcelain(testDir);
      // All files should be staged (index status is not space)
      for (const line of lines) {
        expect(line[0]).not.toBe(' ');
      }
      expect(lines.some((l) => l.endsWith('new.txt'))).toBe(true);
      expect(lines.some((l) => l.endsWith('README.md'))).toBe(true);
    });
  });

  describe('unstageAllFiles', () => {
    it('unstages all staged changes', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'hello');
      run('git add .', testDir);

      // Verify something is staged
      const before = getPorcelain(testDir);
      expect(before.some((l) => l[0] === 'A')).toBe(true);

      await unstageAllFiles(testDir);

      const after = getPorcelain(testDir);
      // new.txt should now show as untracked (??) instead of staged (A)
      const entry = after.find((l) => l.endsWith('new.txt'));
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('?');
      expect(entry![1]).toBe('?');
    });
  });

  describe('discardAllChanges', () => {
    it('restores all tracked files to HEAD state', async () => {
      initRepo(testDir);
      // Modify a tracked file
      writeFileSync(join(testDir, 'README.md'), '# modified');
      expect(getPorcelain(testDir).length).toBeGreaterThan(0);

      await discardAllChanges(testDir);

      expect(readFileSync(join(testDir, 'README.md'), 'utf-8')).toBe('# test');
    });
  });

  describe('commitAmend', () => {
    it('amends the last commit with --no-edit by default', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'extra.txt'), 'content');
      run('git add .', testDir);

      const originalHash = execSync('git rev-parse HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      const newHash = await commitAmend(testDir);

      expect(newHash).toMatch(/^[0-9a-f]{40}$/);
      // Hash should change since the tree changed
      expect(newHash).not.toBe(originalHash);

      // Original commit message should be preserved
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('initial commit');
    });

    it('amends the last commit with a new message', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'extra.txt'), 'content');
      run('git add .', testDir);

      const hash = await commitAmend(testDir, { message: 'amended msg' });

      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('amended msg');
    });

    it('amends with noEdit flag explicitly set', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'extra.txt'), 'content');
      run('git add .', testDir);

      const hash = await commitAmend(testDir, { noEdit: true });

      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('initial commit');
    });
  });

  describe('commitAll', () => {
    it('commits tracked modifications (no includeUntracked)', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'README.md'), '# modified');
      // Also create an untracked file — it should NOT be committed
      writeFileSync(join(testDir, 'untracked.txt'), 'new');

      const hash = await commitAll(testDir, 'commit tracked');

      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('commit tracked');

      // Untracked file should still be untracked
      const lines = getPorcelain(testDir);
      const untracked = lines.find((l) => l.endsWith('untracked.txt'));
      expect(untracked).toBeDefined();
      expect(untracked![0]).toBe('?');
    });

    it('commits all files including untracked when includeUntracked is true', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'new.txt'), 'hello');

      const hash = await commitAll(testDir, 'commit all', {
        includeUntracked: true,
      });

      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      // Working tree should be clean
      expect(getPorcelain(testDir).length).toBe(0);
    });

    it('amends the previous commit when amend is true', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file1.txt'), 'v1');
      run('git add .', testDir);
      run('git commit -m "first"', testDir);

      writeFileSync(join(testDir, 'file2.txt'), 'v2');

      const hash = await commitAll(testDir, 'amended', {
        includeUntracked: true,
        amend: true,
      });

      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      // Should have only 2 total commits (initial + amended)
      const count = execSync('git rev-list --count HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(parseInt(count, 10)).toBe(2);

      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('amended');
    });
  });

  describe('resetSoft', () => {
    it('resets to HEAD~1 by default (soft reset)', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "second commit"', testDir);

      await resetSoft(testDir);

      // The file should still be staged (soft reset preserves index)
      const lines = getPorcelain(testDir);
      const entry = lines.find((l) => l.endsWith('file.txt'));
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('A');

      // HEAD should now be the initial commit
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('initial commit');
    });

    it('resets to a specified ref', async () => {
      initRepo(testDir);
      writeFileSync(join(testDir, 'file1.txt'), 'v1');
      run('git add .', testDir);
      run('git commit -m "second"', testDir);
      const firstCommit = execSync('git rev-parse HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      writeFileSync(join(testDir, 'file2.txt'), 'v2');
      run('git add .', testDir);
      run('git commit -m "third"', testDir);

      await resetSoft(testDir, firstCommit);

      // HEAD should be the second commit
      const log = execSync('git log --oneline -1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(log).toContain('second');

      // file2.txt should be staged
      const lines = getPorcelain(testDir);
      const entry = lines.find((l) => l.endsWith('file2.txt'));
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('A');
    });
  });
});
