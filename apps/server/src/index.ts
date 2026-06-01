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

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle both --key=value and --key value formats
    let key: string;
    let value: string | undefined;
    const eqIndex = arg.indexOf('=');
    if (eqIndex !== -1) {
      key = arg.slice(0, eqIndex);
      value = arg.slice(eqIndex + 1);
    } else {
      key = arg;
      // Next arg is the value (if it exists and doesn't start with --)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        value = args[++i];
      }
    }

    if (value === undefined) continue;

    if (key === '--password') {
      result.password = value;
    } else if (key === '--port') {
      const port = parseInt(value, 10);
      if (Number.isNaN(port) || port < 0 || port > 65535) {
        console.error(`Invalid port: ${value}. Must be a number between 0 and 65535.`);
        process.exit(1);
      }
      result.port = port;
    } else if (key === '--host') {
      result.host = value;
    } else if (key === '--staticDir') {
      result.staticDir = value;
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
