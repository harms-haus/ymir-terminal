import { getPlatformTarget, getTargetTriple, getBinaryName, runCommand } from './lib/build-utils';
import { join } from 'node:path';
import { statSync } from 'node:fs';

interface Artifact {
  name: string;
  path: string;
}

function parseArgs(args: string[]): { target?: string; skipTauri: boolean } {
  let target: string | undefined;
  let skipTauri = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = args[++i];
    } else if (args[i] === '--skip-tauri') {
      skipTauri = true;
    }
  }

  return { target, skipTauri };
}

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function getArtifactSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

const { target, skipTauri } = parseArgs(process.argv.slice(2));
const bunTarget = target ?? getPlatformTarget();
const artifacts: Artifact[] = [];

console.log('=== Building all artifacts ===\n');

// Step 1: Build client SPA
console.log('📦 Step 1: Building client SPA...');
const { success: clientSuccess } = runCommand(['bun', 'run', 'build:client']);
if (!clientSuccess) {
  console.error('❌ Client build failed');
  process.exit(1);
}
console.log('✅ Client built\n');

// Step 2: Build server binary
console.log('📦 Step 2: Building server binary...');
const serverArgs = ['bun', 'scripts/build-server.ts', '--target', bunTarget];
const { success: serverSuccess } = runCommand(serverArgs);
if (!serverSuccess) {
  console.error('❌ Server build failed');
  process.exit(1);
}

// Determine server output path for artifact tracking
const triple = getTargetTriple(bunTarget);
const serverBinaryName = getBinaryName('ymir-server-' + triple, bunTarget);
const serverPath = join('src-tauri/binaries', serverBinaryName);
artifacts.push({ name: 'Server binary', path: serverPath });
console.log('✅ Server built\n');

// Step 3: Build CLI binary
console.log('📦 Step 3: Building CLI binary...');
const cliArgs = ['bun', 'scripts/build-cli.ts', '--target', bunTarget];
const { success: cliSuccess } = runCommand(cliArgs);
if (!cliSuccess) {
  console.error('❌ CLI build failed');
  process.exit(1);
}
const cliBinaryName = getBinaryName('ymir', bunTarget);
const cliPath = join('dist', cliBinaryName);
artifacts.push({ name: 'CLI binary', path: cliPath });
console.log('✅ CLI built\n');

// Step 4 & 5: Build Tauri app (unless skipped)
if (!skipTauri) {
  console.log('📦 Step 4: Building Tauri app...');
  const { success: tauriSuccess } = runCommand(['bunx', 'tauri', 'build']);
  if (!tauriSuccess) {
    console.error('❌ Tauri build failed');
    process.exit(1);
  }
  console.log('✅ Tauri app built\n');

  console.log('📦 Step 5: Extracting Tauri binary...');
  const extractArgs = ['bun', 'scripts/extract-tauri-binary.ts'];
  const { success: extractSuccess } = runCommand(extractArgs);
  if (!extractSuccess) {
    console.error('❌ Tauri binary extraction failed');
    process.exit(1);
  }

  const tauriBinaryName = getBinaryName('ymir-app', bunTarget);
  artifacts.push({ name: 'Tauri app', path: join('dist', tauriBinaryName) });
  console.log('✅ Tauri binary extracted\n');
}

// Print summary
console.log('=== Build Summary ===');
for (const artifact of artifacts) {
  const size = getArtifactSize(artifact.path);
  if (size > 0) {
    console.log(`  ${artifact.name}: ${artifact.path} (${formatSize(size)})`);
  } else {
    console.log(`  ${artifact.name}: ${artifact.path} (not found)`);
  }
}
console.log('\n✅ All builds completed successfully!');
