/** A new collection in an explicitly chosen, existing directory. Never overwrite a file. */
import { closeSync, openSync, realpathSync, statSync, statfsSync } from 'node:fs';
import path from 'node:path';

export function collectionLocation(directory, name) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory))
    throw new Error('Choose an absolute destination directory.');
  const resolved = realpathSync(directory);
  if (!statSync(resolved).isDirectory())
    throw new Error('The destination must be an existing directory.');
  const safeName =
    String(name)
      .replace(/[^\w. -]/g, '')
      .slice(0, 64) || 'database';
  return path.join(resolved, `${safeName}.kingfisher.sqlite`);
}

export function reserveCollection(file) {
  closeSync(openSync(file, 'wx', 0o600));
}

export function storageBytes(file) {
  let bytes = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      bytes += statSync(file + suffix).size;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return bytes;
}

export function checkImportStorage(file, maxBytes, reserveBytes = 2 * 1024 ** 3) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 ** 2)
    throw new Error('Choose a collection disk limit of at least one MiB.');
  if (storageBytes(file) >= maxBytes)
    throw new Error('Collection disk limit reached; committed games remain available.');
  const stat = statfsSync(path.dirname(file));
  if (Number(stat.bsize) * Number(stat.bavail) < reserveBytes)
    throw new Error('Free-space reserve reached; committed games remain available.');
}
