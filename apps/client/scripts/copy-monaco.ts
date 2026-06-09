import { createRequire } from 'node:module';
import { cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

try {
  const require = createRequire(import.meta.url);
  const monacoPkg = require.resolve('monaco-editor/package.json');
  const monacoVsDir = resolve(dirname(monacoPkg), 'min', 'vs');
  const destDir = resolve(import.meta.dirname, '..', 'public', 'monaco', 'vs');

  cpSync(monacoVsDir, destDir, { recursive: true, force: true });

  // eslint-disable-next-line no-console
  console.log(`✓ Monaco assets copied to ${destDir}`);
} catch (err) {
  console.error(`Failed to copy Monaco assets. Ensure 'monaco-editor' is installed.`);
  if (err instanceof Error && err.message) {
    console.error(err.message);
  }
  process.exit(1);
}
