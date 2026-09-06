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
      'companion/**/*.test.mjs',
      'scripts/**/*.test.mjs',
      'desktop/src/**/*.test.mjs',
    ],
  },
});
