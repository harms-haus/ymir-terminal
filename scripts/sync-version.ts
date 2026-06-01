import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── File definitions ────────────────────────────────────────────────
// Each entry describes where to find the version and how to update it.

interface VersionSource {
  label: string;
  path: string;
  readRegex: RegExp;
  /** Returns the full replacement string for the match */
  replace: (version: string) => string;
}

const ROOT = resolve(import.meta.dir, '..');

const SOURCES: VersionSource[] = [
  {
    label: 'packages/shared/src/constants.ts',
    path: 'packages/shared/src/constants.ts',
    readRegex: /export const VERSION = ['"]([^'"]+)['"]/,
    replace: (v) => `export const VERSION = '${v}'`,
  },
  {
    label: 'src-tauri/Cargo.toml',
    path: 'src-tauri/Cargo.toml',
    readRegex: /^version\s*=\s*"([^"]+)"/m,
    replace: (v) => `version = "${v}"`,
  },
  {
    label: 'src-tauri/tauri.conf.json',
    path: 'src-tauri/tauri.conf.json',
    readRegex: /"version"\s*:\s*"([^"]+)"/,
    replace: (v) => `"version": "${v}"`,
  },
  {
    label: 'packages/npm/ymir/package.json',
    path: 'packages/npm/ymir/package.json',
    readRegex: /"version"\s*:\s*"([^"]+)"/,
    replace: (v) => `"version": "${v}"`,
  },
  {
    label: 'packages/npm/ymir-linux-x64/package.json',
    path: 'packages/npm/ymir-linux-x64/package.json',
    readRegex: /"version"\s*:\s*"([^"]+)"/,
    replace: (v) => `"version": "${v}"`,
  },
  {
    label: 'packages/npm/ymir-windows-x64/package.json',
    path: 'packages/npm/ymir-windows-x64/package.json',
    readRegex: /"version"\s*:\s*"([^"]+)"/,
    replace: (v) => `"version": "${v}"`,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

function readVersion(source: VersionSource): string | null {
  const filePath = resolve(ROOT, source.path);
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(source.readRegex);
  return match ? match[1] : null;
}

function setVersion(source: VersionSource, version: string): void {
  const filePath = resolve(ROOT, source.path);
  const content = readFileSync(filePath, 'utf-8');
  const replacement = source.replace(version);
  const updated = content.replace(source.readRegex, replacement);
  writeFileSync(filePath, updated, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  // Parse --set <version>
  if (args[0] === '--set') {
    const version = args[1];
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
      console.error('Usage: bun scripts/sync-version.ts --set <version>');
      console.error('  Version must be in semver format (e.g. 1.2.3)');
      process.exit(1);
    }

    console.log(`Setting all versions to ${version}...\n`);

    for (const source of SOURCES) {
      setVersion(source, version);
      console.log(`  ✓ ${source.label} → ${version}`);
    }

    // Also update optionalDependencies in the main ymir package
    const ymirPkgPath = resolve(ROOT, 'packages/npm/ymir/package.json');
    const ymirPkg = JSON.parse(readFileSync(ymirPkgPath, 'utf-8'));
    if (ymirPkg.optionalDependencies) {
      for (const dep of Object.keys(ymirPkg.optionalDependencies)) {
        ymirPkg.optionalDependencies[dep] = version;
      }
      writeFileSync(ymirPkgPath, JSON.stringify(ymirPkg, null, 2) + '\n', 'utf-8');
      console.log(`  ✓ packages/npm/ymir/package.json optionalDependencies → ${version}`);
    }

    console.log('\nDone! All versions updated.');
    return;
  }

  // No args: check mode
  console.log('Checking version consistency...\n');

  const versions: { label: string; version: string | null }[] = [];

  for (const source of SOURCES) {
    const version = readVersion(source);
    versions.push({ label: source.label, version });
    const status = version ?? 'NOT FOUND';
    console.log(`  ${source.label}: ${status}`);
  }

  const foundVersions = versions
    .map((v) => v.version)
    .filter((v): v is string => v !== null);

  const uniqueVersions = [...new Set(foundVersions)];

  console.log('');

  if (foundVersions.length < SOURCES.length) {
    console.error('✗ Some files did not contain a version string');
    process.exit(1);
  }

  if (uniqueVersions.length === 1) {
    console.log(`✓ All versions match: ${uniqueVersions[0]}`);
    process.exit(0);
  } else {
    console.error(`✗ Version mismatch detected: ${uniqueVersions.join(', ')}`);
    process.exit(1);
  }
}

main();
