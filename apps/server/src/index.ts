import { startServer } from './server';

interface ParsedArgs {
  password: string | null;
  port: number;
  host: string;
  staticDir: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    password: null,
    port: 3000,
    host: '127.0.0.1',
    staticDir: undefined,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--password=')) {
      result.password = arg.slice('--password='.length);
    } else if (arg.startsWith('--port=')) {
      const port = parseInt(arg.slice('--port='.length), 10);
      if (Number.isNaN(port) || port < 0 || port > 65535) {
        console.error(
          `Invalid port: ${arg.slice('--port='.length)}. Must be a number between 0 and 65535.`,
        );
        process.exit(1);
      }
      result.port = port;
    } else if (arg.startsWith('--host=')) {
      result.host = arg.slice('--host='.length);
    } else if (arg.startsWith('--staticDir=')) {
      result.staticDir = arg.slice('--staticDir='.length);
    }
  }

  return result;
}

const args = parseArgs(process.argv);

const password = args.password || process.env.YMIR_PASSWORD;
if (!password) {
  console.error(
    'Usage: ymir --password=<pass> [--port=3000] [--host=127.0.0.1] [--staticDir=<path>]',
  );
  console.error('  Or set YMIR_PASSWORD environment variable');
  process.exit(1);
}

startServer({ password, port: args.port, host: args.host, staticDir: args.staticDir });
