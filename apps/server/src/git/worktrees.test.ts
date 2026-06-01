import { describe, expect, it } from 'bun:test';
import { parseWorktreeList } from './worktrees';

describe('parseWorktreeList', () => {
  it('parses typical 2-worktree output', () => {
    const input = `worktree /path/to/main
HEAD abcd1234abcd1234abcd1234abcd1234abcd1234
branch refs/heads/main

worktree /path/to/linked
HEAD def456def456def456def456def456def456def4
branch refs/heads/feature-branch`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      path: '/path/to/main',
      branch: 'main',
      isMain: true,
      isDetached: false,
    });
    expect(result[1]).toEqual({
      path: '/path/to/linked',
      branch: 'feature-branch',
      isMain: false,
      isDetached: false,
    });
  });

  it('parses single worktree (main only)', () => {
    const input = `worktree /home/user/project
HEAD a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
branch refs/heads/main`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: '/home/user/project',
      branch: 'main',
      isMain: true,
      isDetached: false,
    });
  });

  it('handles detached HEAD', () => {
    const input = `worktree /home/user/project
HEAD a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
detached`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: '/home/user/project',
      branch: null,
      isMain: true,
      isDetached: true,
    });
  });

  it('handles mixed worktrees with one detached', () => {
    const input = `worktree /path/to/main
HEAD aaa1111
branch refs/heads/main

worktree /path/to/detached-wt
HEAD bbb2222
detached`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      path: '/path/to/main',
      branch: 'main',
      isMain: true,
      isDetached: false,
    });
    expect(result[1]).toEqual({
      path: '/path/to/detached-wt',
      branch: null,
      isMain: false,
      isDetached: true,
    });
  });

  it('returns empty array for empty string', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseWorktreeList('   \n  \n  ')).toEqual([]);
  });

  it('handles branch refs that are not refs/heads/', () => {
    const input = `worktree /path/to/main
HEAD aaa1111
branch refs/tags/v1.0`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(1);
    expect(result[0].branch).toBe('refs/tags/v1.0');
    expect(result[0].isDetached).toBe(false);
  });

  it('strips refs/heads/ prefix from branch names', () => {
    const input = `worktree /path/to/repo
HEAD aaa1111
branch refs/heads/feature/my-cool-feature`;

    const result = parseWorktreeList(input);

    expect(result[0].branch).toBe('feature/my-cool-feature');
  });

  it('correctly marks first worktree as isMain and rest as not', () => {
    const input = `worktree /a
HEAD aaa
branch refs/heads/main

worktree /b
HEAD bbb
branch refs/heads/feat-a

worktree /c
HEAD ccc
branch refs/heads/feat-b`;

    const result = parseWorktreeList(input);

    expect(result).toHaveLength(3);
    expect(result[0].isMain).toBe(true);
    expect(result[1].isMain).toBe(false);
    expect(result[2].isMain).toBe(false);
  });
});
