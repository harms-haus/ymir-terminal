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
      result.port = parseInt(arg.slice('--port='.length), 10);
    } else if (arg.startsWith('--host=')) {
      result.host = arg.slice('--host='.length);
    } else if (arg.startsWith('--staticDir=')) {
      result.staticDir = arg.slice('--staticDir='.length);
    }
  }

  return result;
}

const args = parseArgs(process.argv);

if (!args.password) {
  console.log('Usage: ymir --password=<pass> [--port=3000] [--host=127.0.0.1] [--staticDir=<path>]');
  process.exit(1);
}

startServer({ password: args.password, port: args.port, host: args.host, staticDir: args.staticDir });
