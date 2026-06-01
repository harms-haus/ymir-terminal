import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { existsSync, mkdirSync, copyFileSync, chmodSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';

const IS_WINDOWS = process.platform === 'win32';
const GITHUB_REPO = 'harms-haus/ymir-terminal';

function getYmirHome(): string {
  if (IS_WINDOWS) {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ymir');
  }
  return join(homedir(), '.ymir');
}

function run(cmd: string, options?: { cwd?: string }): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: options?.cwd });
}

function checkCommand(name: string): boolean {
  try {
    execSync(`${IS_WINDOWS ? 'where' : 'which'} ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Ymir Install (from source) ===\n');
  const ymirHome = getYmirHome();

  // Step 1: Check prerequisites
  console.log('Checking prerequisites...');

  if (!checkCommand('bun')) {
    console.error('Error: Bun is required. Install from https://bun.sh');
    process.exit(1);
  }
  console.log('  ✓ Bun');

  if (!checkCommand('rustc')) {
    console.error('Error: Rust is required. Install from https://rustup.rs');
    process.exit(1);
  }
  console.log('  ✓ Rust');

  if (!checkCommand('cargo')) {
    console.error('Error: cargo not found.');
    process.exit(1);
  }
  console.log('  ✓ Cargo');

  // Check Tauri system deps on Linux
  if (process.platform === 'linux') {
    try {
      execSync('pkg-config --exists webkit2gtk-4.1', { stdio: 'pipe' });
      console.log('  ✓ webkit2gtk-4.1');
    } catch {
      console.error('Error: webkit2gtk-4.1 development libraries are required.');
      console.error(
        '  Install: sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev librsvg2-dev',
      );
      process.exit(1);
    }
  }

  // Step 2: Detect source directory
  let sourceDir: string;
  const isLocalInstall = existsSync(join(import.meta.dir, '..', 'package.json'));

  if (isLocalInstall) {
    sourceDir = join(import.meta.dir, '..');
    console.log(`\nUsing local source: ${sourceDir}`);
  } else {
    sourceDir = join(tmpdir(), 'ymir-build-' + Date.now());
    console.log(`\nCloning source to: ${sourceDir}`);
    run(`git clone https://github.com/${GITHUB_REPO}.git ${sourceDir}`);
  }

  try {
    // Step 3: Install dependencies
    console.log('\nInstalling dependencies...');
    run('bun install', { cwd: sourceDir });

    // Step 4: Build client
    console.log('\nBuilding client...');
    run('bun run build:client', { cwd: sourceDir });

    // Step 5: Build server binary
    console.log('\nBuilding server binary...');
    run('bun run build:sidecar', { cwd: sourceDir });

    // Step 6: Build CLI binary
    console.log('\nBuilding CLI binary...');
    run('bun run build:cli', { cwd: sourceDir });

    // Step 7: Build Tauri app
    console.log('\nBuilding Tauri desktop app...');
    run('bunx tauri build --no-bundle', { cwd: sourceDir });

    // Step 8: Extract Tauri binary
    console.log('\nExtracting Tauri binary...');
    run('bun run extract:tauri', { cwd: sourceDir });

    // Step 9: Install to ~/.ymir/
    console.log(`\nInstalling to ${ymirHome}...`);
    mkdirSync(ymirHome, { recursive: true });

    const ext = IS_WINDOWS ? '.exe' : '';

    // Copy CLI binary
    const cliSrc = join(sourceDir, 'dist', `ymir${ext}`);
    const cliDest = join(ymirHome, `ymir${ext}`);
    copyFileSync(cliSrc, cliDest);
    if (!IS_WINDOWS) chmodSync(cliDest, 0o755);
    console.log(`  ✓ CLI binary → ${cliDest}`);

    // Copy server binary - find it from sidecar build or dist
    let serverSrc = join(sourceDir, 'dist', `ymir-server${ext}`);
    if (!existsSync(serverSrc)) {
      // Try sidecar build output location
      const sidecarDir = join(sourceDir, 'src-tauri', 'binaries');
      if (existsSync(sidecarDir)) {
        const files = readdirSync(sidecarDir);
        const sidecar = files.find((f) => f.includes('ymir-server') && !f.includes('.gitkeep'));
        if (sidecar) {
          serverSrc = join(sidecarDir, sidecar);
          const sizeMB = statSync(serverSrc).size / 1024 / 1024;
          console.log(`  Found server binary: ${serverSrc} (${sizeMB.toFixed(2)} MB)`);
        }
      }
    }
    const serverDest = join(ymirHome, `ymir-server${ext}`);
    if (existsSync(serverSrc)) {
      copyFileSync(serverSrc, serverDest);
      if (!IS_WINDOWS) chmodSync(serverDest, 0o755);
      console.log(`  ✓ Server binary → ${serverDest}`);
    }
    if (!existsSync(serverDest)) {
      console.error(`Error: Server binary not found. Tried:`);
      console.error(`  ${join(sourceDir, 'dist', `ymir-server${ext}`)}`);
      console.error(`  ${serverSrc}`);
      process.exit(1);
    }
    const serverStats = statSync(serverDest);
    const serverSizeMB = serverStats.size / 1024 / 1024;
    if (serverSizeMB < 1) {
      console.error(`Error: Server binary is too small (${serverSizeMB.toFixed(2)} MB). The sidecar build may have failed.`);
      console.error(`Expected a Bun-compiled binary (~90 MB) but got a placeholder file.`);
      console.error(`Try running 'bun run build:sidecar' manually to check for errors.`);
      process.exit(1);
    }

    // Copy Tauri app binary
    const appSrc = join(sourceDir, 'dist', `ymir-app${ext}`);
    const appDest = join(ymirHome, `ymir-app${ext}`);
    if (existsSync(appSrc)) {
      copyFileSync(appSrc, appDest);
      if (!IS_WINDOWS) chmodSync(appDest, 0o755);
      console.log(`  ✓ Tauri app → ${appDest}`);
    }

    // Copy client dist
    const clientDistSrc = join(sourceDir, 'apps', 'client', 'dist');
    const clientDistDest = join(ymirHome, 'client-dist');
    if (existsSync(clientDistSrc)) {
      mkdirSync(clientDistDest, { recursive: true });
      cpSync(clientDistSrc, clientDistDest, { recursive: true });
      console.log(`  ✓ Client dist → ${clientDistDest}`);
    }

    // Step 10: Add to PATH
    console.log('\nSetting up PATH...');
    if (!IS_WINDOWS) {
      const symlink = '/usr/local/bin/ymir';
      try {
        execFileSync('ln', ['-sf', cliDest, symlink], { stdio: 'inherit' });
        console.log(`  ✓ Created symlink: ${symlink} → ${cliDest}`);
      } catch {
        const localBin = join(homedir(), '.local', 'bin');
        mkdirSync(localBin, { recursive: true });
        execFileSync('ln', ['-sf', cliDest, join(localBin, 'ymir')], { stdio: 'inherit' });
        console.log(`  ✓ Created symlink in ${localBin}`);
        console.log(
          '  Add ~/.local/bin to PATH: echo "export PATH=$HOME/.local/bin:$PATH" >> ~/.bashrc',
        );
      }
    } else {
      console.log(`  Add ${ymirHome} to your PATH: setx PATH "%PATH%;${ymirHome}"`);
    }

    console.log('\n✓ Ymir installed successfully!');
    console.log('Run "ymir" to launch the desktop app.');
    console.log('Run "ymir web --password <pw>" for web mode.');
  } finally {
    if (!isLocalInstall) {
      try {
        rmSync(sourceDir, { recursive: true });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('Install failed:', err);
  process.exit(1);
});
