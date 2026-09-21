import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ChessBaseDatabase } from './database';

const ROOT = join(__dirname, '__fixtures__');

/** Every file of one fixture database, keyed by extension. */
export function fixtureFiles(directory: string, name: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const file of readdirSync(join(ROOT, directory))) {
    const match = /^(.*)\.(\w+)$/.exec(file);
    if (!match || match[1] !== name) continue;
    files.set(match[2]!.toLowerCase(), new Uint8Array(readFileSync(join(ROOT, directory, file))));
  }
  return files;
}

export const fixtureDatabase = (directory: string, name: string): ChessBaseDatabase =>
  new ChessBaseDatabase(name, fixtureFiles(directory, name));

export const fixtureBytes = (path: string): Uint8Array =>
  new Uint8Array(readFileSync(join(ROOT, path)));
