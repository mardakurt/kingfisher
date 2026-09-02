import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  expect: { timeout: 10_000 },
  use: {
    // Next 16's development HMR origin checks reject 127.0.0.1 while the
    // server advertises localhost; using the canonical host keeps hydration
    // and browser event handlers deterministic.
    baseURL: 'http://localhost:3210',
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3210/analysis',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
