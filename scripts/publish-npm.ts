import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runCommand, ensureDir } from './lib/build-utils';

// ── Config ──────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, '..');

const PLATFORM_PACKAGES = ['ymir-linux-x64', 'ymir-windows-x64'] as const;

const VERSION_REGEX = /export const VERSION = ['"]([^'"]+)['"]/;

// Binary names expected in dist/ for each platform package
const BINARY_MAP: Record<string, string> = {
  'ymir-linux-x64': 'ymir',
  'ymir-windows-x64': 'ymir.exe',
};

// ── Helpers ─────────────────────────────────────────────────────────

function readVersion(): string {
  const constantsPath = resolve(ROOT, 'packages/shared/src/constants.ts');
  const content = readFileSync(constantsPath, 'utf-8');
  const match = content.match(VERSION_REGEX);
  if (!match) {
    console.error('Could not read VERSION from packages/shared/src/constants.ts');
    process.exit(1);
  }
  return match[1];
}

function updatePackageVersion(pkgDir: string, version: string): void {
  const pkgPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

function updateOptionalDependencies(pkgDir: string, version: string): void {
  const pkgPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      pkg.optionalDependencies[dep] = version;
    }
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

function findBinary(distDir: string, platformPkg: string): string | null {
  const binaryName = BINARY_MAP[platformPkg];
  const binaryPath = join(distDir, binaryName);
  if (existsSync(binaryPath)) {
    return binaryPath;
  }
  return null;
}

function findBinaryByHeuristic(distDir: string, platformPkg: string): string | null {
  // If exact binary not found, try to find a matching binary by platform suffix
  const entries = readdirSync(distDir);
  if (platformPkg.includes('linux')) {
    const match = entries.find((e) => e.includes('linux') && !e.includes('windows'));
    return match ? join(distDir, match) : null;
  }
  if (platformPkg.includes('windows')) {
    const match = entries.find(
      (e) => e.includes('windows') && (e.endsWith('.exe') || e.includes('windows')),
    );
    return match ? join(distDir, match) : null;
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const version = readVersion();
  const distDir = resolve(ROOT, 'dist');

  console.log(`Publishing npm packages (version: ${version})${dryRun ? ' [DRY RUN]' : ''}\n`);

  if (!existsSync(distDir)) {
    console.error(`dist/ directory not found at: ${distDir}`);
    console.error('Run build steps first to produce binaries.');
    process.exit(1);
  }

  // ── Step 1: Publish platform packages ───────────────────────────

  for (const pkg of PLATFORM_PACKAGES) {
    const pkgDir = resolve(ROOT, 'packages/npm', pkg);
    const binDir = join(pkgDir, 'bin');
    const binaryName = BINARY_MAP[pkg];

    console.log(`── ${pkg} ──`);

    // Copy binary
    let binarySource = findBinary(distDir, pkg);
    if (!binarySource) {
      binarySource = findBinaryByHeuristic(distDir, pkg);
    }

    if (binarySource) {
      ensureDir(binDir);
      const destPath = join(binDir, binaryName);
      copyFileSync(binarySource, destPath);
      console.log(`  Copied binary: ${binarySource} → ${destPath}`);
    } else {
      console.log(`  No binary found in dist/ for ${pkg}, skipping binary copy`);
    }

    // Update version
    updatePackageVersion(pkgDir, version);
    console.log(`  Updated package.json version → ${version}`);

    // Publish
    const publishCmd = ['npm', 'publish', '--access', 'public'];
    if (dryRun) {
      publishCmd.push('--dry-run');
    }

    console.log(`  Running: ${publishCmd.join(' ')}`);
    const { success } = runCommand(publishCmd, { cwd: pkgDir });

    if (!success) {
      console.error(`  ✗ Failed to publish ${pkg}`);
      if (!dryRun) {
        process.exit(1);
      }
    } else {
      console.log(`  ✓ Published ${pkg}`);
    }

    console.log('');
  }

  // ── Step 2: Publish main ymir package ──────────────────────────

  const mainPkgDir = resolve(ROOT, 'packages/npm/ymir');

  console.log('── ymir (main) ──');

  // Update version + optionalDependencies
  updatePackageVersion(mainPkgDir, version);
  updateOptionalDependencies(mainPkgDir, version);
  console.log(`  Updated package.json version → ${version}`);
  console.log(`  Updated optionalDependencies → ${version}`);

  // Publish
  const mainPublishCmd = ['npm', 'publish', '--access', 'public'];
  if (dryRun) {
    mainPublishCmd.push('--dry-run');
  }

  console.log(`  Running: ${mainPublishCmd.join(' ')}`);
  const { success: mainSuccess } = runCommand(mainPublishCmd, { cwd: mainPkgDir });

  if (!mainSuccess) {
    console.error('  ✗ Failed to publish ymir');
    if (!dryRun) {
      process.exit(1);
    }
  } else {
    console.log('  ✓ Published ymir');
  }

  console.log(`\nDone!${dryRun ? ' (dry run)' : ''}`);
}

main();
