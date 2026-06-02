import { spawnGit, spawnGitChecked } from './status';

export async function pushBranch(dirPath: string, branch: string): Promise<void> {
  try {
    await spawnGitChecked(['push', 'origin', branch], dirPath);
  } catch (error) {
    throw new Error(`Push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchRemote(dirPath: string): Promise<void> {
  try {
    await spawnGitChecked(['fetch'], dirPath);
  } catch (error) {
    throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listRemotes(
  dirPath: string,
): Promise<{ name: string; fetchUrl: string; pushUrl: string }[]> {
  const output = await spawnGit(['remote', '-v'], dirPath);
  const remotes: { name: string; fetchUrl: string; pushUrl: string }[] = [];
  const map = new Map<string, { fetchUrl?: string; pushUrl?: string }>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    // Format: "name\turl (fetch)" or "name\turl (push)"
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, type] = match;
    if (!map.has(name)) map.set(name, {});
    const entry = map.get(name)!;
    if (type === 'fetch') entry.fetchUrl = url;
    else entry.pushUrl = url;
  }

  for (const [name, entry] of map) {
    remotes.push({ name, fetchUrl: entry.fetchUrl ?? '', pushUrl: entry.pushUrl ?? '' });
  }

  return remotes;
}

export async function addRemote(dirPath: string, name: string, url: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid remote name: ${name}`);
  }
  const isValidUrl =
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('ssh://') ||
    url.startsWith('git://') ||
    url.includes(':');
  if (!isValidUrl) {
    throw new Error(`Invalid remote URL: ${url}`);
  }
  await spawnGitChecked(['remote', 'add', name, url], dirPath);
}

export async function removeRemote(dirPath: string, name: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid remote name: ${name}`);
  }
  await spawnGitChecked(['remote', 'remove', name], dirPath);
}
