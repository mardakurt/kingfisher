import { defineConfig } from '@playwright/test';
import config from './playwright.config';

/** Independent side audit: never attach to the main checkout's Next server. */
export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: 'http://localhost:3219' },
  outputDir: '/tmp/kingfisher-side-audit/playwright-results',
  webServer: [
    {
      command: 'npx next dev --port 3219',
      url: 'http://localhost:3219/analysis',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run companion',
      url: 'http://127.0.0.1:4338/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        KINGFISHER_COMPANION_PORT: '4338',
        KINGFISHER_COMPANION_TOKEN: 'phase8-e2e-token',
        KINGFISHER_COMPANION_DATA_DIR: '/tmp/kingfisher-side-audit/companion',
      },
    },
  ],
});
