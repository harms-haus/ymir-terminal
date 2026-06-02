import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listBranches,
  createBranch,
  checkoutBranch,
  renameBranch,
  deleteBranch,
  deleteRemoteBranch,
  publishBranch,
  listRemoteBranches,
  createBranchFrom,
} from './branches';

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

  describe('renameBranch', () => {
    it('renames an existing branch', async () => {
      initRepo(testDir);
      run('git branch old-name', testDir);

      await renameBranch(testDir, 'old-name', 'new-name');

      const names = (await listBranches(testDir)).branches.map((b) => b.name);
      expect(names).not.toContain('old-name');
      expect(names).toContain('new-name');
    });

    it('throws for invalid old branch name', async () => {
      initRepo(testDir);
      await expect(renameBranch(testDir, 'bad!', 'new-name')).rejects.toThrow(
        'Invalid branch name',
      );
    });

    it('throws for invalid new branch name', async () => {
      initRepo(testDir);
      await expect(renameBranch(testDir, 'main', 'bad!')).rejects.toThrow('Invalid branch name');
    });
  });

  describe('deleteBranch', () => {
    it('deletes a merged branch (non-forced)', async () => {
      initRepo(testDir);
      run('git branch to-delete', testDir);

      await deleteBranch(testDir, 'to-delete');

      const names = (await listBranches(testDir)).branches.map((b) => b.name);
      expect(names).not.toContain('to-delete');
    });

    it('force-deletes a branch', async () => {
      initRepo(testDir);
      // Create a branch with a divergent commit so -d would fail
      run('git checkout -b diverged', testDir);
      writeFileSync(join(testDir, 'diverged.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "diverged commit"', testDir);
      // Go back to the initial branch
      const initialBranch = (await listBranches(testDir)).branches.find(
        (b) => b.name !== 'diverged',
      )!.name;
      run(`git checkout ${initialBranch}`, testDir);

      await deleteBranch(testDir, 'diverged', true);

      const names = (await listBranches(testDir)).branches.map((b) => b.name);
      expect(names).not.toContain('diverged');
    });

    it('throws for invalid branch name', async () => {
      initRepo(testDir);
      await expect(deleteBranch(testDir, 'bad!')).rejects.toThrow('Invalid branch name');
    });
  });

  describe('deleteRemoteBranch', () => {
    it('throws for invalid remote name', async () => {
      initRepo(testDir);
      await expect(deleteRemoteBranch(testDir, 'bad!', 'main')).rejects.toThrow('Invalid name');
    });

    it('throws for invalid branch name', async () => {
      initRepo(testDir);
      await expect(deleteRemoteBranch(testDir, 'origin', 'bad!')).rejects.toThrow(
        'Invalid branch name',
      );
    });

    it('deletes a remote branch', async () => {
      const remoteDir = join(
        tmpdir(),
        `ymir-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(remoteDir, { recursive: true });
      try {
        run('git init --bare', remoteDir);

        initRepo(testDir);
        run(`git remote add origin ${remoteDir}`, testDir);

        // Create and push a branch
        run('git checkout -b feature', testDir);
        writeFileSync(join(testDir, 'feat.txt'), 'content');
        run('git add .', testDir);
        run('git commit -m "feature"', testDir);
        run('git push -u origin feature', testDir);

        // Switch back to initial branch
        const initialBranch = (await listBranches(testDir)).branches.find(
          (b) => !b.name.startsWith('feature'),
        )!.name;
        run(`git checkout ${initialBranch}`, testDir);

        await deleteRemoteBranch(testDir, 'origin', 'feature');

        // Verify the remote branch is gone
        const remoteBranches = await listRemoteBranches(testDir);
        const names = remoteBranches.branches.map((b) => b.name);
        expect(names.some((n) => n === 'origin/feature')).toBe(false);
      } finally {
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });
  });

  describe('publishBranch', () => {
    it('pushes and sets upstream to origin by default', async () => {
      const remoteDir = join(
        tmpdir(),
        `ymir-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(remoteDir, { recursive: true });
      try {
        run('git init --bare', remoteDir);

        initRepo(testDir);
        run(`git remote add origin ${remoteDir}`, testDir);

        await publishBranch(testDir);

        // Verify the branch was pushed
        const localHead = execSync('git rev-parse HEAD', {
          cwd: testDir,
          encoding: 'utf-8',
        }).trim();
        const remoteHead = execSync('git rev-parse HEAD', {
          cwd: remoteDir,
          encoding: 'utf-8',
        }).trim();
        expect(remoteHead).toBe(localHead);

        // Verify tracking is set
        const tracking = execSync('git rev-parse --abbrev-ref @{u}', {
          cwd: testDir,
          encoding: 'utf-8',
        }).trim();
        expect(tracking).toContain('origin/');
      } finally {
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });

    it('pushes to a custom remote', async () => {
      const remoteDir = join(
        tmpdir(),
        `ymir-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(remoteDir, { recursive: true });
      try {
        run('git init --bare', remoteDir);

        initRepo(testDir);
        run(`git remote add upstream ${remoteDir}`, testDir);

        await publishBranch(testDir, 'upstream');

        const localHead = execSync('git rev-parse HEAD', {
          cwd: testDir,
          encoding: 'utf-8',
        }).trim();
        const remoteHead = execSync('git rev-parse HEAD', {
          cwd: remoteDir,
          encoding: 'utf-8',
        }).trim();
        expect(remoteHead).toBe(localHead);
      } finally {
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });
  });

  describe('listRemoteBranches', () => {
    it('returns empty array when no remotes are configured', async () => {
      initRepo(testDir);

      const result = await listRemoteBranches(testDir);

      expect(result.branches).toEqual([]);
      expect(result.current).toBeNull();
    });

    it('lists remote branches from a configured remote', async () => {
      const remoteDir = join(
        tmpdir(),
        `ymir-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(remoteDir, { recursive: true });
      try {
        run('git init --bare', remoteDir);

        initRepo(testDir);
        run(`git remote add origin ${remoteDir}`, testDir);
        run('git push -u origin HEAD', testDir);

        // Fetch to get remote refs
        run('git fetch', testDir);

        const result = await listRemoteBranches(testDir);

        expect(result.current).toBeNull();
        expect(result.branches.length).toBeGreaterThanOrEqual(1);
        for (const b of result.branches) {
          expect(b.isRemote).toBe(true);
          expect(b.isCurrent).toBe(false);
          expect(b.name).toContain('origin/');
        }
      } finally {
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });

    it('skips HEAD symlink lines (->)', async () => {
      const remoteDir = join(
        tmpdir(),
        `ymir-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(remoteDir, { recursive: true });
      try {
        run('git init --bare', remoteDir);

        initRepo(testDir);
        run(`git remote add origin ${remoteDir}`, testDir);
        run('git push -u origin HEAD', testDir);
        run('git fetch', testDir);

        const result = await listRemoteBranches(testDir);

        // Should not contain any entries with '->'
        for (const b of result.branches) {
          expect(b.name).not.toContain('->');
        }
      } finally {
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });
  });

  describe('createBranchFrom', () => {
    it('creates a new branch from a specified start point', async () => {
      initRepo(testDir);
      // Create a second commit
      writeFileSync(join(testDir, 'file.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "second commit"', testDir);

      // Get the first commit hash as start point
      const firstCommit = execSync('git rev-parse HEAD~1', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      await createBranchFrom(testDir, 'from-first', firstCommit);

      const { branches, current } = await listBranches(testDir);
      expect(branches.map((b) => b.name)).toContain('from-first');
      expect(current).toBe('from-first');

      // The new branch should point to the first commit
      const head = execSync('git rev-parse HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(head).toBe(firstCommit);
    });

    it('throws for invalid branch name', async () => {
      initRepo(testDir);
      await expect(createBranchFrom(testDir, 'bad!', 'HEAD')).rejects.toThrow(
        'Invalid branch name',
      );
    });

    it('throws for invalid start point', async () => {
      initRepo(testDir);
      await expect(createBranchFrom(testDir, 'my-branch', 'bad;point')).rejects.toThrow(
        'Invalid start point',
      );
    });
  });
});
