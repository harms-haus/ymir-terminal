import { spawnGit } from './status';

/**
 * Run a git command that is expected to succeed.
 * Throws if the command returns a non-zero exit code
 * (spawnGit silently returns '' on failure).
 */
async function spawnGitOrThrow(args: string[], cwd: string): Promise<string> {
  // spawnGit returns empty string on failure, but also on commands
  // that produce no output. For mutating commands (add, restore, reset,
  // commit) an empty output is fine — the signal is that exitCode was 0.
  // Since spawnGit already swallows non-zero exits and returns '',
  // we re-run with direct Bun.spawn to capture stderr on failure.
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed (exit ${proc.exitCode}): ${stderr.trim()}`);
  }
  return stdout;
}

export async function stageFiles(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitOrThrow(['add', '--', ...files], dirPath);
}

export async function stageAll(dirPath: string): Promise<void> {
  await spawnGitOrThrow(['add', '-A'], dirPath);
}

export async function unstageFiles(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitOrThrow(['restore', '--staged', '--', ...files], dirPath);
}

export async function unstageAll(dirPath: string): Promise<void> {
  await spawnGitOrThrow(['reset', 'HEAD', '--', '.'], dirPath);
}

export async function discardChanges(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitOrThrow(['restore', '--', ...files], dirPath);
}

export async function discardAll(dirPath: string): Promise<void> {
  await spawnGitOrThrow(['checkout', '--', '.'], dirPath);
}

export async function commitChanges(dirPath: string, message: string): Promise<string> {
  if (!message.trim()) throw new Error('Commit message cannot be empty');
  await spawnGitOrThrow(['commit', '-m', message], dirPath);
  const hash = await spawnGit(['rev-parse', 'HEAD'], dirPath);
  return hash.trim();
}
