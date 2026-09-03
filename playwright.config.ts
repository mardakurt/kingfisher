import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

const companionData = path.join(tmpdir(), `kingfisher-phase8-e2e-${process.pid}`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  /*
    The release gate runs at zero retries: a flaky browser test that only
    passes on its second attempt is a bug, and a gate that quietly re-runs it
    hides that bug instead of failing on it. The diagnostic workflow
    (.github/workflows/e2e-diagnostic.yml) sets PLAYWRIGHT_RETRIES for the
    separate, non-gating job that exists to tell a flaky test apart from a
    broken one.
  */
  retries: Number(process.env.PLAYWRIGHT_RETRIES ?? 0),
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
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3210/analysis',
      reuseExistingServer: !process.env.CI,
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
        KINGFISHER_COMPANION_DATA_DIR: companionData,
      },
    },
  ],
});
