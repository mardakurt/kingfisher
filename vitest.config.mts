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
    ],
  },
});
