import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getYmirHomeDir, SERVER_BINARY_NAME, IS_MACOS, IS_WINDOWS } from '@ymir/shared';

function printWebHelp(): void {
  console.log(`Usage: ymir web [options]

Options:
  --password <pw>   Password for authentication (required)
  -p <pw>           Shorthand for --password
  --host <addr>     Host address (default: 127.0.0.1)
  --port <num>      Port number (default: 3000)
  --no-open         Do not open the browser
  --help            Show this help`);
}

export function startWeb(args: string[]): void {
  let password: string | undefined;
  let host = '127.0.0.1';
  let port = '3000';
  let noOpen = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printWebHelp();
      process.exit(0);
    }

    if (arg === '--no-open') {
      noOpen = true;
      continue;
    }

    if (arg === '-p') {
      password = args[++i];
      continue;
    }

    if (arg.startsWith('--password=')) {
      password = arg.slice('--password='.length);
      continue;
    }

    if (arg === '--password') {
      password = args[++i];
      continue;
    }

    if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length);
      continue;
    }

    if (arg === '--host') {
      host = args[++i];
      continue;
    }

    if (arg.startsWith('--port=')) {
      port = arg.slice('--port='.length);
      continue;
    }

    if (arg === '--port') {
      port = args[++i];
      continue;
    }
  }

  if (!password) {
    console.error('Error: --password is required.');
    printWebHelp();
    process.exit(1);
  }

  const homeDir = getYmirHomeDir();
  const serverPath = join(homeDir, SERVER_BINARY_NAME);

  if (!existsSync(serverPath)) {
    console.error(
      `Ymir server not found at ${serverPath}.\nRun 'ymir update' to install the latest version.`
    );
    process.exit(1);
  }

  const staticDir = join(homeDir, 'client-dist');

  const server = spawn(
    serverPath,
    [`--host=${host}`, `--port=${port}`, `--staticDir=${staticDir}`],
    {
      stdio: 'inherit',
      env: { ...process.env, YMIR_PASSWORD: password },
    }
  );

  server.on('error', (err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

  if (!noOpen) {
    const url = `http://${host}:${port}`;

    setTimeout(() => {
      let command: string;
      let cmdArgs: string[];

      if (IS_WINDOWS) {
        command = 'cmd';
        cmdArgs = ['/c', 'start', url];
      } else if (IS_MACOS) {
        command = 'open';
        cmdArgs = [url];
      } else {
        command = 'xdg-open';
        cmdArgs = [url];
      }

      const opener = spawn(command, cmdArgs, { stdio: 'ignore' });
      opener.unref();
    }, 1500);
  }

  server.on('close', (code) => {
    process.exit(code ?? 0);
  });
}
