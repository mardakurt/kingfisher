import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Benchmarks, kept out of `npm test`.
 *
 * These files exist to *measure* — to print how long eviction and a streaming
 * cache take at 10k and 50k records — and they assert nothing. Running them
 * inside the ordinary suite cost up to two minutes each and proved only that a
 * loop terminates, which `expect().toBeDefined()` on a return value would have
 * proved for free.
 *
 * They are excluded from `vitest.config.mts` and reachable only from here, so
 * their file headers — which have said `vitest.bench.config.mts` all along —
 * are finally true.
 *
 *     npx vitest run --config vitest.bench.config.mts
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/bench-*.test.ts'],
    // These are the slow ones on purpose.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
