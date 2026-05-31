import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(paths).toEqual(['projects/proj-a', 'projects/proj-b']);
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
    expect(found[0].path).toBe('level1/level2');
  });

  it('returns empty array for empty directory', async () => {
    const repos = await discoverRepos(testDir);
    expect(repos).toEqual([]);
  });

  it('stops at repo boundary — nested repo inside repo is not scanned', async () => {
    // Outer repo at workspace root
    initRepo(testDir);

    // Inner repo inside outer repo
    const inner = join(testDir, 'nested-inner');
    initRepo(inner);

    const repos = await discoverRepos(testDir);
    // Should find only the outer repo — inner is behind a repo boundary
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('.');
  });

  it('populates hasRemote when a remote is configured', async () => {
    initRepo(testDir);
    run('git remote add origin https://example.com/repo.git', testDir);

    const repos = await discoverRepos(testDir);
    expect(repos).toHaveLength(1);
    expect(repos[0].hasRemote).toBe(true);
  });
});
