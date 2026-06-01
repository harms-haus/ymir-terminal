import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cliPath = join(import.meta.dir, 'index.ts');

function runCli(args: string[]) {
  return spawnSync('bun', [cliPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
}

describe('CLI entry point', () => {
  test('--version prints version', () => {
    const result = runCli(['--version']);
    expect(result.stdout).toContain('0.1.0');
    expect(result.status).toBe(0);
  });

  test('-v prints version', () => {
    const result = runCli(['-v']);
    expect(result.stdout).toContain('0.1.0');
    expect(result.status).toBe(0);
  });

  test('--help prints usage', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('Usage: ymir');
    expect(result.stdout).toContain('web');
    expect(result.status).toBe(0);
  });

  test('-h prints usage', () => {
    const result = runCli(['-h']);
    expect(result.stdout).toContain('Usage:');
    expect(result.status).toBe(0);
  });

  test('no args shows not installed error or starting message', () => {
    const result = runCli([]);
    // launchApp() will either print "not installed" (exit 1) or "Starting" (exit 0)
    const output = result.stdout + result.stderr;
    const hasExpectedOutput =
      output.includes('not installed') ||
      output.includes('Starting');
    expect(hasExpectedOutput).toBe(true);
  });

  test('unknown command shows error', () => {
    const result = runCli(['foobar']);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Unknown command: foobar');
    expect(result.status).toBe(1);
  });
});
