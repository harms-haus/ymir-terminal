import { VERSION } from '@ymir/shared';
import { launchApp } from './commands/launch';
import { startWeb } from './commands/web';
import { selfUpdate } from './commands/update';

function printHelp(): void {
  console.log(`Usage: ymir [command]

Commands:
  (default)    Launch the Ymir desktop app
  web           Start the web server and open in browser
  update        Update Ymir to the latest version
  --version     Show version
  --help        Show this help

Run 'ymir web --help' for web mode options.`);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  launchApp();
} else {
  const command = args[0];

  switch (command) {
    case 'web':
      startWeb(args.slice(1));
      break;
    case 'update':
      selfUpdate();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      process.exit(0);
      break;
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
      break;
  }
}
