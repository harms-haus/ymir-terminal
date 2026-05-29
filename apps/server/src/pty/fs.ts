import { existsSync as _realExistsSync } from 'node:fs';

export function existsSync(path: string): boolean {
  return _realExistsSync(path);
}
