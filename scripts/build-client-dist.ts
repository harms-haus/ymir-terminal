import { getPlatformTarget, runCommand, ensureDir } from './lib/build-utils';
import { join } from 'node:path';
import { statSync } from 'node:fs';

function parseArgs(args: string[]): { target?: string; outdir: string } {
  let target: string | undefined;
  let outdir = 'dist';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = args[++i];
    } else if (args[i] === '--outdir' && args[i + 1]) {
      outdir = args[++i];
    }
  }

  return { target, outdir };
}

function getPlatformName(bunTarget: string): string {
  if (bunTarget.includes('linux')) return 'linux';
  if (bunTarget.includes('darwin')) return 'macos';
  if (bunTarget.includes('windows')) return 'windows';
  return 'unknown';
}

const { target, outdir } = parseArgs(process.argv.slice(2));
const bunTarget = target ?? getPlatformTarget();
const platform = getPlatformName(bunTarget);
const isWindows = bunTarget.includes('windows');

// Step 1: Build the client SPA
console.log('Building client...');
const { success: buildSuccess } = runCommand(['bun', 'run', 'build:client']);
if (!buildSuccess) {
  console.error('Failed to build client');
  process.exit(1);
}

// Step 2: Create the archive
ensureDir(outdir);

const archiveName = `client-dist-${platform}${isWindows ? '.zip' : '.tar.gz'}`;
const archivePath = join(outdir, archiveName);

console.log(`Creating archive: ${archiveName}`);

if (isWindows) {
  // Use PowerShell Compress-Archive on Windows
  const { success } = runCommand([
    'powershell',
    '-Command',
    `Compress-Archive -Path "apps/client/dist/*" -DestinationPath "${archivePath}" -Force`,
  ]);
  if (!success) {
    console.error('Failed to create zip archive');
    process.exit(1);
  }
} else {
  // Use tar on Linux/macOS
  const { success } = runCommand(['tar', '-czf', archivePath, '-C', 'apps/client/dist', '.']);
  if (!success) {
    console.error('Failed to create tar.gz archive');
    process.exit(1);
  }
}

const size = statSync(archivePath).size;
const sizeMB = (size / 1024 / 1024).toFixed(2);
console.log(`Client distribution archive: ${archivePath} (${sizeMB} MB)`);
