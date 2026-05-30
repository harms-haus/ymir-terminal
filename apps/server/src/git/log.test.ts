import { describe, expect, it, afterAll } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtemp, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { getGitLog } from './log';

const mkdtempAsync = promisify(mkdtemp);

function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, encoding: 'utf-8' });
}

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtempAsync(join(tmpdir(), 'ymir-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Helper: fully initialize a repo with an initial commit. */
function initRepo(dir: string) {
  run('git init', dir);
  run('git config user.email "test@test.com"', dir);
  run('git config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test');
  run('git add .', dir);
  run('git commit -m "initial commit"', dir);
}

/** Create a single commit with a file named after the message. */
function makeCommit(dir: string, message: string) {
  const slug = message.replace(/\s+/g, '-').toLowerCase();
  writeFileSync(join(dir, `${slug}.txt`), slug);
  run('git add .', dir);
  run('git commit -m ' + JSON.stringify(message), dir);
}

describe('getGitLog', () => {
  it('returns commits with expected messages (happy path)', async () => {
    const tmpDir = await makeTmpDir();
    initRepo(tmpDir);
    makeCommit(tmpDir, 'second commit');

    const commits = await getGitLog(tmpDir, 0, 10);

    expect(commits.length).toBeGreaterThanOrEqual(2);
    // Most recent commit first (topo-order)
    expect(commits[0].message).toBe('second commit');
    expect(commits[1].message).toBe('initial commit');
    // Verify fields are populated
    expect(commits[0].id).toMatch(/^[0-9a-f]{40}$/);
    expect(commits[0].author).toBe('Test');
    expect(commits[0].date).toBeGreaterThan(0);
  });

  it('returns empty array for a repo with no commits', async () => {
    const tmpDir = await makeTmpDir();
    run('git init', tmpDir);
    // No commits — .git exists but git log will fail

    const commits = await getGitLog(tmpDir, 0, 10);

    expect(commits).toEqual([]);
  });

  it('paginates with skip and limit', async () => {
    const tmpDir = await makeTmpDir();
    initRepo(tmpDir);
    // Create 5 more commits (6 total including initial)
    for (let i = 1; i <= 5; i++) {
      makeCommit(tmpDir, `commit ${i}`);
    }

    // Total 6 commits. Request first 2 (skip 0, limit 2).
    const page = await getGitLog(tmpDir, 0, 2);
    expect(page.length).toBe(2);
    expect(page[0].message).toBe('commit 5');
    expect(page[1].message).toBe('commit 4');

    // We know there are 6 total, so hasMore = true when skip + limit < total.
    // getGitLog doesn't return hasMore, but we can verify pagination works
    // by fetching the next page.
    const page2 = await getGitLog(tmpDir, 2, 2);
    expect(page2.length).toBe(2);
    expect(page2[0].message).toBe('commit 3');
    expect(page2[1].message).toBe('commit 2');

    // Verify that skip=4, limit=2 returns the last 2 commits
    const page3 = await getGitLog(tmpDir, 4, 2);
    expect(page3.length).toBe(2);
    expect(page3[0].message).toBe('commit 1');
    expect(page3[1].message).toBe('initial commit');
  });

  it('returns empty array for a non-existent directory', async () => {
    const commits = await getGitLog('/non/existent/path/ymir-test-xyz', 0, 10);

    expect(commits).toEqual([]);
  });
});
