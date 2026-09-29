import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      // Phase 49: .test.tsx was never included, so post-update-notice.test.tsx
      // had not run once since it was written.
      'src/**/*.test.tsx',
      'companion/**/*.test.mjs',
      'scripts/**/*.test.mjs',
      'scripts/**/*.test.ts',
      'desktop/src/**/*.test.mjs',
      // The two `bench-*.test.ts` files are measurements, not gates: they
      // print a number and assert nothing, so in `npm test` they spent up to
      // two minutes each proving that a loop terminates. Their own headers
      // already said to run them under `vitest.bench.config.mts`, which did not
      // exist — so the instruction was false and the cost was real. That config
      // exists now, and these two are reachable only through it. Thresholding
      // wall-clock instead was considered and rejected: a performance budget
      // on a shared machine is a flaky test, and a suite that goes red for
      // reasons a person cannot act on stops being evidence.
      '!scripts/bench-*.test.ts',
    ],
  },
});
