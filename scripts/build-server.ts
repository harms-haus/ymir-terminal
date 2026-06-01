import {
  getPlatformTarget,
  getTargetTriple,
  getBinaryName,
  runCommand,
  ensureDir,
} from './lib/build-utils';
import { join } from 'node:path';
import { chmodSync, statSync } from 'node:fs';

function parseArgs(args: string[]): { target?: string; outdir: string } {
  let target: string | undefined;
  let outdir = 'src-tauri/binaries';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = args[++i];
    } else if (args[i] === '--outdir' && args[i + 1]) {
      outdir = args[++i];
    }
  }

  return { target, outdir };
}

const { target, outdir } = parseArgs(process.argv.slice(2));

// Determine the Bun compile target
const bunTarget = target ?? getPlatformTarget();
const targetTriple = getTargetTriple(bunTarget);

const binaryName = getBinaryName('ymir-server-' + targetTriple, bunTarget);
const outputPath = join(outdir, binaryName);

console.log(`Building sidecar binary: ${binaryName}`);

ensureDir(outdir);

const cmd = [
  'bun',
  'build',
  '--compile',
  'apps/server/src/index.ts',
  '--target',
  bunTarget,
  '--outfile',
  outputPath,
];
const { success } = runCommand(cmd);

if (!success) {
  console.error('Failed to build sidecar binary');
  process.exit(1);
}

// Set executable permissions on Unix
if (!bunTarget.includes('windows')) {
  chmodSync(outputPath, 0o755);
}

const size = statSync(outputPath).size;
const sizeMB = (size / 1024 / 1024).toFixed(2);
console.log(`Sidecar binary built: ${outputPath} (${sizeMB} MB)`);
