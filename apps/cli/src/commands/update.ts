import { rename, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, renameSync, createWriteStream } from 'node:fs';
import {
  getYmirHomeDir,
  CLI_BINARY_NAME,
  APP_BINARY_NAME,
  SERVER_BINARY_NAME,
  VERSION,
  GITHUB_REPO,
  IS_WINDOWS,
} from '@ymir/shared';

interface GithubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

const PLATFORM_TAG = IS_WINDOWS ? 'windows-x64' : 'linux-x64';
const BINARY_NAMES = [CLI_BINARY_NAME, APP_BINARY_NAME, SERVER_BINARY_NAME];

async function fetchLatestRelease(): Promise<GithubRelease> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { 'User-Agent': 'ymir-update-checker' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch release info: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GithubRelease;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ymir-update-checker' },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error(`No response body for ${url}`);
  }

  return new Promise((resolve, reject) => {
    const stream = createWriteStream(destPath);
    stream.on('finish', resolve);
    stream.on('error', reject);

    // @ts-expect-error - Node ReadableStream from fetch is pipeable
    body.pipe(stream);
  });
}

function replaceBinaryUnix(tempPath: string, finalPath: string): void {
  renameSync(tempPath, finalPath);
}

async function replaceBinaryWindows(tempPath: string, finalPath: string): Promise<void> {
  const oldPath = finalPath + '.old';

  if (existsSync(finalPath)) {
    if (existsSync(oldPath)) {
      await rm(oldPath, { force: true });
    }
    await rename(finalPath, oldPath);
  }

  await rename(tempPath, finalPath);

  // Safe file deletion after a short delay (no shell injection risk)
  setTimeout(async () => {
    try {
      await rm(oldPath, { force: true });
    } catch {}
  }, 3000);
}

export async function selfUpdate(): Promise<void> {
  console.log('Checking for updates...');

  let release: GithubRelease;
  try {
    release = await fetchLatestRelease();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to check for updates: ${message}`);
    process.exit(1);
  }

  const latestVersion = release.tag_name.replace(/^v/, '');

  if (latestVersion === VERSION) {
    console.log('Already up to date.');
    process.exit(0);
  }

  console.log(`New version available: ${latestVersion} (current: ${VERSION})`);

  // Find matching assets for our platform
  const assets: Array<{ name: string; browser_download_url: string }> = release.assets;
  const platformAssets = assets.filter((a) => a.name.includes(PLATFORM_TAG));

  if (platformAssets.length === 0) {
    console.error(`No assets found for platform ${PLATFORM_TAG}.`);
    process.exit(1);
  }

  const homeDir = getYmirHomeDir();
  await mkdir(homeDir, { recursive: true });

  // Create temp directory
  const tempDir = join(homeDir, 'update-temp');
  await mkdir(tempDir, { recursive: true });

  try {
    // Download all binaries in parallel
    const downloadPromises = BINARY_NAMES.map(async (binaryName) => {
      const asset = platformAssets.find((a) => {
        const base = a.name.replace(/\.tar\.gz$|\.zip$/, '').replace(`-${PLATFORM_TAG}`, '');
        return base === binaryName.replace(/\.(exe)?$/, '') || a.name.startsWith(binaryName);
      });

      if (!asset) return null;

      const tempPath = join(tempDir, asset.name);
      console.log(`Downloading ${asset.name}...`);
      await downloadFile(asset.browser_download_url, tempPath);
      return { name: asset.name, tempPath, finalName: binaryName };
    });

    const downloaded = (await Promise.all(downloadPromises)).filter(
      (r): r is { name: string; tempPath: string; finalName: string } => r !== null,
    );

    if (downloaded.length === 0) {
      console.error('No matching binaries found in release assets.');
      process.exit(1);
    }

    // Replace binaries
    for (const { tempPath, finalName } of downloaded) {
      const finalPath = join(homeDir, finalName);

      if (IS_WINDOWS) {
        await replaceBinaryWindows(tempPath, finalPath);
      } else {
        replaceBinaryUnix(tempPath, finalPath);
      }

      console.log(`Updated ${finalName}`);
    }

    console.log(`Successfully updated Ymir to ${latestVersion}.`);
  } finally {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  }
}
