import { mkdirSync } from 'node:fs';

// Mapping from Bun compile targets to Tauri target triples
export const TARGET_MAP: Record<string, string> = {
  'bun-linux-x64': 'x86_64-unknown-linux-gnu',
  'bun-linux-arm64': 'aarch64-unknown-linux-gnu',
  'bun-darwin-x64': 'x86_64-apple-darwin',
  'bun-darwin-arm64': 'aarch64-apple-darwin',
  'bun-windows-x64': 'x86_64-pc-windows-msvc',
};

// Get the Bun compile target for the current platform
export function getPlatformTarget(): string {
  const platform = process.platform;
  const arch = process.arch;

  const platformMap: Record<string, string> = {
    linux: 'linux',
    darwin: 'darwin',
    win32: 'windows',
  };
  const archMap: Record<string, string> = {
    x64: 'x64',
    arm64: 'arm64',
  };

  const os = platformMap[platform];
  const cpu = archMap[arch];

  if (!os || !cpu) {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }

  return `bun-${os}-${cpu}`;
}

// Convert Bun compile target to Tauri target triple
export function getTargetTriple(bunTarget: string): string {
  const triple = TARGET_MAP[bunTarget];
  if (!triple) throw new Error(`Unknown Bun target: ${bunTarget}`);
  return triple;
}

// Get the binary name with platform-appropriate extension
export function getBinaryName(name: string, bunTarget: string): string {
  return bunTarget.includes('windows') ? `${name}.exe` : name;
}

// Run a command and return success/failure
export function runCommand(
  cmd: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): { success: boolean; exitCode: number } {
  const result = Bun.spawnSync(cmd, {
    cwd: options?.cwd,
    env: { ...process.env, ...options?.env },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return { success: result.exitCode === 0, exitCode: result.exitCode ?? 1 };
}

// Ensure a directory exists
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
