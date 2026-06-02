import { describe, expect, it, beforeEach, mock } from 'bun:test';

const spawnGitMock = mock<(...args: unknown[]) => Promise<string>>(() => Promise.resolve(''));
const spawnGitCheckedMock = mock<(...args: unknown[]) => Promise<string>>(() =>
  Promise.resolve(''),
);

mock.module('./status', () => ({
  spawnGit: spawnGitMock,
  spawnGitChecked: spawnGitCheckedMock,
}));

import { stashPush, stashList, stashApply, stashPop, stashDrop, stashClear } from './stash';

describe('git stash', () => {
  beforeEach(() => {
    spawnGitMock.mockReset();
    spawnGitCheckedMock.mockReset();
  });

  describe('stashPush', () => {
    it('calls git stash push with default args and returns stash@{0}', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      const result = await stashPush('/repo');

      expect(result).toBe('stash@{0}');
      expect(spawnGitCheckedMock).toHaveBeenCalledTimes(1);
      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'push'], '/repo');
    });

    it('includes -u flag when includeUntracked is true', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPush('/repo', { includeUntracked: true });

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'push', '-u'], '/repo');
    });

    it('includes -m flag when message is provided', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPush('/repo', { message: 'my stash msg' });

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(
        ['stash', 'push', '-m', 'my stash msg'],
        '/repo',
      );
    });

    it('includes both -u and -m when both options are set', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPush('/repo', {
        includeUntracked: true,
        message: 'all the things',
      });

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(
        ['stash', 'push', '-u', '-m', 'all the things'],
        '/repo',
      );
    });

    it('does not add flags when options object is empty', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPush('/repo', {});

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'push'], '/repo');
    });
  });

  describe('stashList', () => {
    it('parses standard WIP stash lines', async () => {
      spawnGitMock.mockResolvedValue(
        'stash@{0}: WIP on main: abc1234 initial commit\n' +
          'stash@{1}: WIP on feature: def5678 add feature',
      );

      const entries = await stashList('/repo');

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({
        index: 0,
        ref: 'stash@{0}',
        message: 'abc1234 initial commit',
        branchName: 'main',
      });
      expect(entries[1]).toEqual({
        index: 1,
        ref: 'stash@{1}',
        message: 'def5678 add feature',
        branchName: 'feature',
      });
    });

    it('parses "On branch" format (non-WIP)', async () => {
      spawnGitMock.mockResolvedValue('stash@{0}: On main: abc1234 commit msg');

      const entries = await stashList('/repo');

      expect(entries).toHaveLength(1);
      expect(entries[0].branchName).toBe('main');
      expect(entries[0].message).toBe('abc1234 commit msg');
    });

    it('returns empty array when output is empty', async () => {
      spawnGitMock.mockResolvedValue('');

      const entries = await stashList('/repo');

      expect(entries).toEqual([]);
    });

    it('handles lines without branch colon gracefully', async () => {
      // A line with no ": " after the ref portion
      spawnGitMock.mockResolvedValue('stash@{0}: Some custom message without colon');

      const entries = await stashList('/repo');

      expect(entries).toHaveLength(1);
      expect(entries[0].branchName).toBeNull();
      expect(entries[0].message).toBe('Some custom message without colon');
    });

    it('extracts correct index from ref', async () => {
      spawnGitMock.mockResolvedValue('stash@{5}: WIP on dev: aaa000 fix bug');

      const entries = await stashList('/repo');

      expect(entries[0].index).toBe(5);
      expect(entries[0].ref).toBe('stash@{5}');
    });

    it('filters out blank lines', async () => {
      spawnGitMock.mockResolvedValue('stash@{0}: WIP on main: abc1234 msg\n\n  \n');

      const entries = await stashList('/repo');

      expect(entries).toHaveLength(1);
    });
  });

  describe('stashApply', () => {
    it('applies the latest stash when no ref provided', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashApply('/repo');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'apply'], '/repo');
    });

    it('applies a specific stash ref', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashApply('/repo', 'stash@{1}');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'apply', 'stash@{1}'], '/repo');
    });
  });

  describe('stashPop', () => {
    it('pops the latest stash when no ref provided', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPop('/repo');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'pop'], '/repo');
    });

    it('pops a specific stash ref', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashPop('/repo', 'stash@{0}');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'pop', 'stash@{0}'], '/repo');
    });
  });

  describe('stashDrop', () => {
    it('drops the specified stash', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashDrop('/repo', 'stash@{0}');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'drop', 'stash@{0}'], '/repo');
    });
  });

  describe('stashClear', () => {
    it('clears all stashes', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await stashClear('/repo');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['stash', 'clear'], '/repo');
    });
  });
});
