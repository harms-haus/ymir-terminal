import { getPlatformTarget, ensureDir } from './lib/build-utils';
import { join } from 'node:path';
import { copyFileSync, chmodSync, statSync, existsSync, writeFileSync } from 'node:fs';

function parseArgs(args: string[]): { outdir: string; tauriOutdir: string } {
  let outdir = 'dist';
  let tauriOutdir = 'src-tauri/target/release';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--outdir' && args[i + 1]) {
      outdir = args[++i];
    } else if (args[i] === '--tauri-outdir' && args[i + 1]) {
      tauriOutdir = args[++i];
    }
  }

  return { outdir, tauriOutdir };
}

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

const { outdir, tauriOutdir } = parseArgs(process.argv.slice(2));
const bunTarget = getPlatformTarget();

ensureDir(outdir);

let sourcePath: string;
let outputPath: string;

if (bunTarget.includes('linux')) {
  // Linux: binary is directly in release dir
  sourcePath = join(tauriOutdir, 'ymir');
  outputPath = join(outdir, 'ymir-app');
} else if (bunTarget.includes('windows')) {
  // Windows: binary is directly in release dir
  sourcePath = join(tauriOutdir, 'ymir.exe');
  outputPath = join(outdir, 'ymir-app.exe');
} else {
  // macOS: binary is inside the .app bundle
  const appBundlePath = join(tauriOutdir, 'bundle', 'macos', 'Ymir.app');
  const macBinaryPath = join(appBundlePath, 'Contents', 'MacOS', 'Ymir');

  if (!existsSync(macBinaryPath)) {
    console.error(`macOS binary not found at: ${macBinaryPath}`);
    process.exit(1);
  }

  // Copy the entire .app bundle to output directory
  const destBundlePath = join(outdir, 'Ymir.app');
  const bundleContents = join(destBundlePath, 'Contents');
  const bundleMacOS = join(bundleContents, 'MacOS');

  ensureDir(bundleMacOS);

  // Copy the main binary
  copyFileSync(macBinaryPath, join(bundleMacOS, 'Ymir'));
  chmodSync(join(bundleMacOS, 'Ymir'), 0o755);

  // Copy Info.plist if it exists
  const infoPlist = join(appBundlePath, 'Contents', 'Info.plist');
  if (existsSync(infoPlist)) {
    const destContents = join(destBundlePath, 'Contents');
    ensureDir(destContents);
    copyFileSync(infoPlist, join(destContents, 'Info.plist'));
  }

  // Create launcher script
  const launcherPath = join(outdir, 'ymir-app');
  writeFileSync(
    launcherPath,
    `#!/bin/bash\nDIR="$(cd "$(dirname "$0")" && pwd)"\nopen "$DIR/Ymir.app"\n`,
  );
  chmodSync(launcherPath, 0o755);

  const size = statSync(join(bundleMacOS, 'Ymir')).size;
  console.log(`Tauri app bundle: ${destBundlePath} (${formatSize(size)})`);
  console.log(`Launcher script: ${launcherPath}`);
  process.exit(0);
}

// Linux / Windows: copy the binary
if (!existsSync(sourcePath)) {
  console.error(`Tauri binary not found at: ${sourcePath}`);
  process.exit(1);
}

copyFileSync(sourcePath, outputPath);

// Set executable permissions on Unix
if (!bunTarget.includes('windows')) {
  chmodSync(outputPath, 0o755);
}

const size = statSync(outputPath).size;
console.log(`Tauri binary extracted: ${outputPath} (${formatSize(size)})`);
