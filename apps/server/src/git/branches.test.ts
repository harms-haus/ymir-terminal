import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listBranches, createBranch, checkoutBranch } from './branches';

function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, encoding: 'utf-8' });
}

/** Helper to fully initialize a repo with an initial commit on master. */
function initRepo(dir: string) {
  run('git init', dir);
  run('git config user.email "test@test.com"', dir);
  run('git config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test');
  run('git add .', dir);
  run('git commit -m "initial commit"', dir);
}

describe('git branches', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ymir-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('listBranches', () => {
    it('lists branches with correct names and isCurrent flags', async () => {
      initRepo(testDir);
      run('git branch feature-a', testDir);
      run('git branch feature-b', testDir);

      const { branches, current } = await listBranches(testDir);

      expect(current).not.toBeNull();
      const names = branches.map((b) => b.name);
      // Initial branch (main or master) plus the two created
      expect(names).toContain('feature-a');
      expect(names).toContain('feature-b');

      const currentBranch = branches.find((b) => b.isCurrent);
      expect(currentBranch).toBeDefined();
      expect(currentBranch!.name).toBe(current!);
      expect(branches.filter((b) => b.isCurrent).length).toBe(1);
    });

    it('returns a single branch for a repo with only the initial branch', async () => {
      initRepo(testDir);

      const { branches, current } = await listBranches(testDir);

      expect(branches.length).toBe(1);
      expect(branches[0].isCurrent).toBe(true);
      expect(current).toBe(branches[0].name);
    });
  });

  describe('createBranch', () => {
    it('creates a new branch and checks it out', async () => {
      initRepo(testDir);

      await createBranch(testDir, 'my-feature');

      const { branches, current } = await listBranches(testDir);
      const names = branches.map((b) => b.name);
      expect(names).toContain('my-feature');
      expect(current).toBe('my-feature');
      const created = branches.find((b) => b.name === 'my-feature');
      expect(created!.isCurrent).toBe(true);
    });

    it('throws an error for an invalid branch name', async () => {
      initRepo(testDir);

      expect(createBranch(testDir, 'bad name!')).rejects.toThrow('Invalid branch name');
    });
  });

  describe('checkoutBranch', () => {
    it('switches to an existing branch', async () => {
      initRepo(testDir);
      // Create a second branch but stay on the initial one
      const initialBranch = (await listBranches(testDir)).current!;
      run('git branch other-branch', testDir);

      // Verify we're on the initial branch
      let { current } = await listBranches(testDir);
      expect(current).toBe(initialBranch);

      // Switch to the other branch
      await checkoutBranch(testDir, 'other-branch');

      ({ current } = await listBranches(testDir));
      expect(current).toBe('other-branch');
    });
  });
});
