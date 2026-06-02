import {
  getPlatformTarget,
  getTargetTriple,
  getBinaryName,
  runCommand,
  ensureDir,
  parseBuildArgs,
} from './lib/build-utils';
import { join } from 'node:path';
import { chmodSync, statSync } from 'node:fs';

const { target, outdir } = parseBuildArgs(process.argv.slice(2));

// Determine the Bun compile target
const bunTarget = target ?? getPlatformTarget();
const targetTriple = getTargetTriple(bunTarget);

const binaryName = getBinaryName('ymir', bunTarget);
const outputPath = join(outdir, binaryName);

console.log(`Building CLI binary: ${binaryName} (target: ${targetTriple})`);

ensureDir(outdir);

const cmd = [
  'bun',
  'build',
  '--compile',
  'apps/cli/src/index.ts',
  '--target',
  bunTarget,
  '--outfile',
  outputPath,
];
const { success } = runCommand(cmd);

if (!success) {
  console.error('Failed to build CLI binary');
  process.exit(1);
}

// Set executable permissions on Unix
if (!bunTarget.includes('windows')) {
  chmodSync(outputPath, 0o755);
}

const size = statSync(outputPath).size;
const sizeMB = (size / 1024 / 1024).toFixed(2);
console.log(`CLI binary built: ${outputPath} (${sizeMB} MB)`);
