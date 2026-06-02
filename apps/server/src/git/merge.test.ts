import { describe, expect, it, beforeEach, mock } from 'bun:test';

const spawnGitMock = mock<(...args: unknown[]) => Promise<string>>(() => Promise.resolve(''));
const spawnGitCheckedMock = mock<(...args: unknown[]) => Promise<string>>(() =>
  Promise.resolve(''),
);

mock.module('./status', () => ({
  spawnGit: spawnGitMock,
  spawnGitChecked: spawnGitCheckedMock,
}));

import { mergeBranch, rebaseBranch, rebaseAbort, isRebaseInProgress } from './merge';

describe('git merge', () => {
  beforeEach(() => {
    spawnGitMock.mockReset();
    spawnGitCheckedMock.mockReset();
  });

  describe('mergeBranch', () => {
    it('calls git merge with the given branch name', async () => {
      spawnGitCheckedMock.mockResolvedValue('Already up to date.');

      const result = await mergeBranch('/repo', 'feature');

      expect(result).toBe('Already up to date.');
      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['merge', 'feature'], '/repo');
    });

    it('accepts branch names with slashes, dots, underscores, hyphens', async () => {
      spawnGitCheckedMock.mockResolvedValue('ok');

      await mergeBranch('/repo', 'feature/my-branch.v2');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['merge', 'feature/my-branch.v2'], '/repo');
    });

    it('throws on invalid branch name with special characters', async () => {
      await expect(mergeBranch('/repo', 'bad;name')).rejects.toThrow('Invalid branch name');
      expect(spawnGitCheckedMock).not.toHaveBeenCalled();
    });

    it('throws on branch name with parentheses', async () => {
      await expect(mergeBranch('/repo', 'bad(name)')).rejects.toThrow('Invalid branch name');
    });

    it('throws on empty branch name', async () => {
      await expect(mergeBranch('/repo', '')).rejects.toThrow('Invalid branch name');
    });
  });

  describe('rebaseBranch', () => {
    it('calls git rebase with the given branch name', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      const result = await rebaseBranch('/repo', 'main');

      expect(result).toBe('');
      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['rebase', 'main'], '/repo');
    });

    it('throws on invalid branch name', async () => {
      await expect(rebaseBranch('/repo', 'evil$branch')).rejects.toThrow('Invalid branch name');
      expect(spawnGitCheckedMock).not.toHaveBeenCalled();
    });
  });

  describe('rebaseAbort', () => {
    it('calls git rebase --abort', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await rebaseAbort('/repo');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['rebase', '--abort'], '/repo');
    });
  });

  describe('isRebaseInProgress', () => {
    it('returns true when REBASE_HEAD exists', async () => {
      spawnGitMock.mockResolvedValue('abc1234deadbeef\n');

      const result = await isRebaseInProgress('/repo');

      expect(result).toBe(true);
      expect(spawnGitMock).toHaveBeenCalledWith(['rev-parse', '--verify', 'REBASE_HEAD'], '/repo');
    });

    it('returns false when REBASE_HEAD does not exist (empty output)', async () => {
      spawnGitMock.mockResolvedValue('');

      const result = await isRebaseInProgress('/repo');

      expect(result).toBe(false);
    });

    it('returns false when output is only whitespace', async () => {
      spawnGitMock.mockResolvedValue('   \n');

      const result = await isRebaseInProgress('/repo');

      expect(result).toBe(false);
    });
  });
});
