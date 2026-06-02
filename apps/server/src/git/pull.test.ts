import { describe, expect, it, beforeEach, mock } from 'bun:test';

const spawnGitCheckedMock = mock<(...args: unknown[]) => Promise<string>>(
  () => Promise.resolve(''),
);
const fetchRemoteMock = mock<(...args: unknown[]) => Promise<void>>(
  () => Promise.resolve(),
);
const pushBranchMock = mock<(...args: unknown[]) => Promise<void>>(
  () => Promise.resolve(),
);

mock.module('./status', () => ({
  spawnGitChecked: spawnGitCheckedMock,
}));

mock.module('./remote', () => ({
  fetchRemote: fetchRemoteMock,
  pushBranch: pushBranchMock,
}));

import { pullRemote, syncRemote } from './pull';

describe('git pull', () => {
  beforeEach(() => {
    spawnGitCheckedMock.mockReset();
    fetchRemoteMock.mockReset();
    pushBranchMock.mockReset();
  });

  describe('pullRemote', () => {
    it('calls git pull without rebase by default', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await pullRemote('/repo');

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['pull'], '/repo');
    });

    it('calls git pull --rebase when rebase is true', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await pullRemote('/repo', true);

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(
        ['pull', '--rebase'],
        '/repo',
      );
    });

    it('calls git pull without --rebase when rebase is false', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await pullRemote('/repo', false);

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['pull'], '/repo');
    });

    it('calls git pull without --rebase when rebase is undefined', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await pullRemote('/repo', undefined);

      expect(spawnGitCheckedMock).toHaveBeenCalledWith(['pull'], '/repo');
    });
  });

  describe('syncRemote', () => {
    it('chains fetchRemote, pull --rebase, and pushBranch in order', async () => {
      spawnGitCheckedMock.mockResolvedValue('');
      const callOrder: string[] = [];
      fetchRemoteMock.mockImplementation(async () => {
        callOrder.push('fetch');
      });
      spawnGitCheckedMock.mockImplementation(async () => {
        callOrder.push('pull');
        return '';
      });
      pushBranchMock.mockImplementation(async () => {
        callOrder.push('push');
      });

      await syncRemote('/repo', 'main');

      expect(fetchRemoteMock).toHaveBeenCalledWith('/repo');
      expect(spawnGitCheckedMock).toHaveBeenCalledWith(
        ['pull', '--rebase'],
        '/repo',
      );
      expect(pushBranchMock).toHaveBeenCalledWith('/repo', 'main');
      expect(callOrder).toEqual(['fetch', 'pull', 'push']);
    });

    it('passes the branch name to pushBranch', async () => {
      spawnGitCheckedMock.mockResolvedValue('');

      await syncRemote('/repo', 'feature/my-branch');

      expect(pushBranchMock).toHaveBeenCalledWith('/repo', 'feature/my-branch');
    });
  });
});
