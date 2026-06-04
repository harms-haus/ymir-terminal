import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverRepos } from './discovery';

function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, encoding: 'utf-8' });
}

/** Helper to fully initialize a repo with an initial commit. */
function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  run('git init', dir);
  run('git config user.email "test@test.com"', dir);
  run('git config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test');
  run('git add .', dir);
  run('git commit -m "initial commit"', dir);
}

describe('discoverRepos', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `ymir-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds a single repo at root with path "."', async () => {
    initRepo(testDir);
    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('.');
    expect(repos[0].branch === 'master' || repos[0].branch === 'main').toBe(true);
    expect(repos[0].hasRemote).toBe(false);
    expect(typeof repos[0].ahead).toBe('number');
    expect(typeof repos[0].behind).toBe('number');
  });

  it('finds nested repos at subdirectory paths', async () => {
    const projA = join(testDir, 'projects', 'proj-a');
    const projB = join(testDir, 'projects', 'proj-b');
    initRepo(projA);
    initRepo(projB);

    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(2);

    const paths = repos.map((r) => r.path).sort();
    expect(paths).toEqual([`projects${sep}proj-a`, `projects${sep}proj-b`]);
  });

  it('skips ignored directories like node_modules', async () => {
    initRepo(join(testDir, 'visible'));
    const hidden = join(testDir, 'node_modules', 'hidden-pkg');
    initRepo(hidden);

    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('visible');
  });

  it('skips hidden directories', async () => {
    initRepo(join(testDir, 'visible'));
    const hidden = join(testDir, '.hidden', 'deep');
    initRepo(hidden);

    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('visible');
  });

  it('respects max depth boundary', async () => {
    // depth 0: testDir (not a repo)
    // depth 1: level1 (not a repo)
    // depth 2: level2 → this is the repo
    const deep = join(testDir, 'level1', 'level2');
    initRepo(deep);

    // maxDepth=1 should NOT reach level2 (needs depth 2)
    const shallow = await discoverRepos(testDir, 1);
    expect(shallow).toHaveLength(0);

    // maxDepth=2 should reach level2
    const found = await discoverRepos(testDir, 2);
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe(`level1${sep}level2`);
  });

  it('returns empty array for empty directory', async () => {
    const repos = await discoverRepos(testDir);
    expect(repos).toEqual([]);
  });

  it('discovers nested repos inside a parent repo', async () => {
    // Outer repo at workspace root
    initRepo(testDir);

    // Inner repo inside outer repo
    const inner = join(testDir, 'nested-inner');
    initRepo(inner);

    const repos = await discoverRepos(testDir);
    // Should find both the outer and inner repos
    expect(repos).toHaveLength(2);
    const paths = repos.map((r) => r.path).sort();
    expect(paths).toEqual(['.', 'nested-inner']);
  });

  it('populates hasRemote when a remote is configured', async () => {
    initRepo(testDir);
    run('git remote add origin https://example.com/repo.git', testDir);

    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(1);
    expect(repos[0].hasRemote).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // BFS / onDepthComplete callback tests
  // ---------------------------------------------------------------------------

  it('delivers repos in BFS depth order via onDepthComplete callback', async () => {
    // Repos at depths 0, 1, and 2
    initRepo(testDir); // depth 0
    const depth1 = join(testDir, 'level-one');
    initRepo(depth1); // depth 1
    const depth2 = join(depth1, 'level-two');
    initRepo(depth2); // depth 2

    const calls: { depth: number; paths: string[] }[] = [];

    await discoverRepos(testDir, 5, (repos, depth) => {
      calls.push({
        depth,
        paths: repos.map((r) => r.path).sort(),
      });
    });

    expect(calls).toHaveLength(3);
    // Depth 0 repos arrive first
    expect(calls[0].depth).toBe(0);
    expect(calls[0].paths).toEqual(['.']);
    // Depth 1 repos arrive second
    expect(calls[1].depth).toBe(1);
    expect(calls[1].paths).toEqual(['level-one']);
    // Depth 2 repos arrive third
    expect(calls[2].depth).toBe(2);
    expect(calls[2].paths).toEqual([`level-one${sep}level-two`]);
  });

  it('does not call onDepthComplete for depths without any repos', async () => {
    // Depth 0: root is a repo
    initRepo(testDir);

    // Depth 1: a directory that is NOT a repo but contains a subdirectory
    const intermediate = join(testDir, 'intermediate');
    mkdirSync(intermediate, { recursive: true });

    // Depth 2: a repo inside intermediate
    const inner = join(intermediate, 'sub-repo');
    initRepo(inner);

    const calls: { depth: number; count: number }[] = [];

    await discoverRepos(testDir, 5, (repos, depth) => {
      calls.push({ depth, count: repos.length });
    });

    // Should be called for depth 0 and depth 2, but NOT depth 1
    expect(calls).toHaveLength(2);
    expect(calls[0].depth).toBe(0);
    expect(calls[0].count).toBe(1);
    expect(calls[1].depth).toBe(2);
    expect(calls[1].count).toBe(1);
  });

  it('final result is sorted even when per-depth repos are unsorted', async () => {
    // Several repos at the same depth in a non-alphabetical order
    // The per-depth callback sees them in whatever order they're discovered,
    // but the final returned array is sorted alphabetically.
    const dirC = join(testDir, 'c-project');
    const dirA = join(testDir, 'a-project');
    const dirB = join(testDir, 'b-project');
    initRepo(dirC);
    initRepo(dirA);
    initRepo(dirB);

    const perDepthCalls: string[][] = [];

    const repos = await discoverRepos(testDir, 5, (repos, _depth) => {
      perDepthCalls.push(repos.map((r) => r.path));
    });

    // Final result should always be sorted: a-project, b-project, c-project
    const paths = repos.map((r) => r.path);
    expect(paths).toEqual(['a-project', 'b-project', 'c-project']);
  });
});
