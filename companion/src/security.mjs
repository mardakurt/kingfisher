/**
 * The companion's trust boundary.
 *
 * Everything here exists because this process spawns native binaries and reads
 * files. The rules are in `companion/README.md`; this file is where they are
 * actually enforced, and nothing else in the companion should re-implement
 * them.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const HOST = '127.0.0.1';

/** Origins a browser is allowed to call from. Localhost only, by construction. */
export const allowedOrigins = (port) =>
  new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    // The dev server and a production `next start` both default to 3210.
    'http://localhost:3210',
    'http://127.0.0.1:3210',
  ]);

export const createToken = () => randomBytes(32).toString('hex');

/**
 * Constant-time token comparison.
 *
 * `===` on a secret leaks its prefix through timing. The cost of doing this
 * properly is one function.
 */
export function tokenMatches(expected, given) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** The token from either the Authorization header or a query parameter. */
export function presentedToken(request, url) {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  // EventSource cannot set headers, so the stream endpoint accepts a query token.
  return url.searchParams.get('token') ?? '';
}

/**
 * A stable key for a database name.
 *
 * Hashed rather than encoded. The previous scheme was the hex of the name
 * truncated to sixteen characters, which is the hex of its first *eight
 * bytes* — so "Kasparov games 2024" and "Kasparov games 2025" produced the
 * same key, and creating the second silently re-pointed the first's key at a
 * new empty file while its games stayed in an orphaned one. Found by a
 * benchmark that created "Bench 10000" and then "Bench 100000".
 *
 * The whole name goes into the digest, so distinct names cannot collide by
 * sharing a prefix. It stays a pure function of the name, so re-creating a
 * database with the same name deliberately reopens the same file.
 */
export const databaseKey = (name) =>
  `db-${createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 20)}`;

/**
 * A registry of paths the user explicitly chose.
 *
 * Requests name a *key*, never a path. This is the difference between "open the
 * database the user imported" and "open any file on the disk", and it is the
 * single most important rule in the companion.
 */
export class PathRegistry {
  #entries = new Map();

  /**
   * Refuses to move an existing key to a different path.
   *
   * Re-registering the same key with a new path is how a collision turns into
   * data loss: the key keeps working, points somewhere empty, and the original
   * file becomes unreachable. Better to fail the request loudly.
   */
  register(key, absolutePath, meta = {}) {
    const existing = this.#entries.get(key);
    if (existing && existing.path !== absolutePath) {
      throw new Error(
        `Resource key ${key} is already registered to a different file. ` +
          'Choose a different name.',
      );
    }
    this.#entries.set(key, { path: absolutePath, ...meta });
    return key;
  }

  resolve(key) {
    const entry = this.#entries.get(key);
    if (!entry) throw new Error(`Unknown resource: ${key}`);
    return entry;
  }

  has(key) {
    return this.#entries.has(key);
  }

  list() {
    return [...this.#entries.entries()].map(([key, entry]) => ({ key, ...entry }));
  }

  delete(key) {
    return this.#entries.delete(key);
  }
}
