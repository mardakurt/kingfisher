/**
 * The companion's trust boundary.
 *
 * Everything here exists because this process spawns native binaries and reads
 * files. The rules are in `companion/README.md`; this file is where they are
 * actually enforced, and nothing else in the companion should re-implement
 * them.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

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
 * A registry of paths the user explicitly chose.
 *
 * Requests name a *key*, never a path. This is the difference between "open the
 * database the user imported" and "open any file on the disk", and it is the
 * single most important rule in the companion.
 */
export class PathRegistry {
  #entries = new Map();

  register(key, absolutePath, meta = {}) {
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
