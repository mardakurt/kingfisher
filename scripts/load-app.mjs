/**
 * Loading the application's own TypeScript from a benchmark script.
 *
 * The benchmarks have to call the real `parsePgn`, `normalizeGame` and
 * `indexGame`. Reimplementing them here would measure a different program —
 * and worse, a benchmark that computed its own position keys would silently
 * stop matching the ones the application stores.
 *
 * Node's type stripping cannot load them: this codebase imports
 * `./parse` rather than `./parse.ts`, and resolves `@/` through a path alias,
 * neither of which Node's ESM resolver does. Vite does both, and is already a
 * dependency through Vitest, so the benchmarks borrow its SSR module loader
 * rather than adding a runner or rewriting every import in `src/`.
 */

import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server = null;

/** Boots Vite once per process; repeated calls share the module graph. */
export async function loadApp(specifiers) {
  server ??= await createServer({
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    // `hmr: false` matters when several workers boot Vite at once: each
    // would otherwise try to open the same WebSocket port and log a failure.
    server: { middlewareMode: true, watch: null, hmr: false },
    resolve: {
      alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
    },
  });

  const loaded = {};
  for (const specifier of specifiers) {
    Object.assign(loaded, await server.ssrLoadModule(specifier));
  }
  return loaded;
}

/** Vite keeps the process alive; benchmarks call this when they are done. */
export async function closeApp() {
  await server?.close();
  server = null;
}
