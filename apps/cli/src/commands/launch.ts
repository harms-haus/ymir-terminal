import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  getYmirHomeDir,
  APP_BINARY_NAME,
  SERVER_BINARY_NAME,
} from '@ymir/shared';

export function launchApp(): void {
  const homeDir = getYmirHomeDir();
  const binaryPath = join(homeDir, APP_BINARY_NAME);

  if (!existsSync(binaryPath)) {
    console.error(
      `Ymir is not installed at ${binaryPath}.\nRun 'ymir update' to install the latest version.`
    );
    process.exit(1);
  }

  const env = {
    ...process.env,
    YMIR_HOME: homeDir,
    YMIR_STATIC_DIR: join(homeDir, 'client-dist'),
    YMIR_SERVER_PATH: join(homeDir, SERVER_BINARY_NAME),
  };

  const child = spawn(binaryPath, [], {
    detached: true,
    stdio: 'ignore',
    env,
  });

  child.unref();

  console.log('Starting Ymir...');
  process.exit(0);
}
