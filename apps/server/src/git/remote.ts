/**
 * Spawn a git command that throws on non-zero exit codes.
 * Unlike `spawnGit` (which silently returns ''), this captures stderr
 * so callers can meaningfully handle push/fetch failures.
 */
async function spawnGitStrict(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const detail = stderr.trim() || `git exited with code ${exitCode}`;
    throw new Error(detail);
  }
  return stdout;
}

export async function pushBranch(dirPath: string, branch: string): Promise<void> {
  try {
    await spawnGitStrict(['push', 'origin', branch], dirPath);
  } catch (error) {
    throw new Error(
      `Push failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function fetchRemote(dirPath: string): Promise<void> {
  try {
    await spawnGitStrict(['fetch'], dirPath);
  } catch (error) {
    throw new Error(
      `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
