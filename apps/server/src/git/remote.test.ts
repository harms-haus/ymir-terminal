import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pushBranch, fetchRemote } from './remote';

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

describe('git remote', () => {
  let testDir: string;
  let remoteDir: string;

  beforeEach(() => {
    const id = `ymir-git-remote-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testDir = join(tmpdir(), id);
    remoteDir = join(tmpdir(), `${id}-bare`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
  });

  describe('pushBranch', () => {
    it('pushes a branch to the remote', async () => {
      // Set up bare remote
      run('git init --bare', remoteDir);

      // Set up working repo cloned from the bare remote
      run(`git clone ${remoteDir} ${testDir}`);
      run('git config user.email "test@test.com"', testDir);
      run('git config user.name "Test"', testDir);

      // Make a commit and push
      writeFileSync(join(testDir, 'file.txt'), 'content');
      run('git add .', testDir);
      run('git commit -m "add file"', testDir);

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      await pushBranch(testDir, branch);

      // Verify the remote has the commit
      const remoteHead = execSync('git rev-parse HEAD', {
        cwd: remoteDir,
        encoding: 'utf-8',
      }).trim();
      const localHead = execSync('git rev-parse HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();
      expect(remoteHead).toBe(localHead);
    });

    it('throws on push failure (no remote configured)', async () => {
      initRepo(testDir);
      await expect(pushBranch(testDir, 'main')).rejects.toThrow('Push failed:');
    });

    it('throws on push failure (non-existent remote URL)', async () => {
      initRepo(testDir);
      run('git remote add origin /non/existent/path.git', testDir);
      await expect(pushBranch(testDir, 'main')).rejects.toThrow('Push failed:');
    });
  });

  describe('fetchRemote', () => {
    it('fetches from the remote and updates tracking info', async () => {
      // Set up bare remote
      run('git init --bare', remoteDir);

      // Clone to create working repo
      const workerDir = testDir;
      run(`git clone ${remoteDir} ${workerDir}`);
      run('git config user.email "test@test.com"', workerDir);
      run('git config user.name "Test"', workerDir);

      // Push initial content so remote has a branch
      writeFileSync(join(workerDir, 'initial.txt'), 'hello');
      run('git add .', workerDir);
      run('git commit -m "initial"', workerDir);
      run('git push -u origin HEAD', workerDir);

      // Create a second clone, add a commit, and push it
      const otherDir = join(tmpdir(), `ymir-other-${Date.now()}`);
      mkdirSync(otherDir, { recursive: true });
      try {
        run(`git clone ${remoteDir} ${otherDir}`);
        run('git config user.email "test@test.com"', otherDir);
        run('git config user.name "Test"', otherDir);
        writeFileSync(join(otherDir, 'extra.txt'), 'extra content');
        run('git add .', otherDir);
        run('git commit -m "extra commit"', otherDir);
        run('git push origin HEAD', otherDir);

        // Fetch from the worker repo
        await fetchRemote(workerDir);

        // Verify the remote-tracking branch was updated
        const localHead = execSync('git rev-parse HEAD', {
          cwd: workerDir,
          encoding: 'utf-8',
        }).trim();
        const remoteHead = execSync('git rev-parse @{u}', {
          cwd: workerDir,
          encoding: 'utf-8',
        }).trim();
        expect(remoteHead).not.toBe(localHead);

        // Verify the fetched commit is the one from otherDir
        const otherHead = execSync('git rev-parse HEAD', {
          cwd: otherDir,
          encoding: 'utf-8',
        }).trim();
        expect(remoteHead).toBe(otherHead);
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it('throws on fetch failure (non-existent remote URL)', async () => {
      initRepo(testDir);
      run('git remote add origin /non/existent/path.git', testDir);
      await expect(fetchRemote(testDir)).rejects.toThrow('Fetch failed:');
    });
  });
});
