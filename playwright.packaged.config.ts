import { defineConfig } from '@playwright/test';
import browser from './playwright.config';

if (!process.env.KINGFISHER_ACCEPTANCE_BINARY) {
  throw new Error('Set KINGFISHER_ACCEPTANCE_BINARY to the packaged Kingfisher executable.');
}

// The packaged shell owns its web server and companion. Starting development
// services here would hide exactly the integration this acceptance run checks.
export default defineConfig({
  ...browser,
  testMatch: 'soak.spec.ts',
  webServer: [],
  outputDir: 'test-results-packaged',
});
