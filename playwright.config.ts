import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

const companionData = path.join(tmpdir(), `kingfisher-phase8-e2e-${process.pid}`);

/*
  Browser matrix for Phase 43.

  Phase 42 left this as a single Chrome project on the grounds that one
  browser is better than zero, but Phase 43 explicitly calls out three
  engine projects — Chromium, Firefox, WebKit — plus the existing
  Chrome-stable project for "real Chrome" certification. The default
  `npm run test:e2e` keeps the Chrome-only behaviour because that is what
  CI has run since Phase 8; the matrix is opt-in via `KF_E2E_MATRIX=1` or
  the dedicated `test:e2e:matrix` script, so a developer running locally
  does not get a five-fold slowdown for no reason.

  The companion webserver and project timeout are shared; the project
  `name` is what gets surfaced in the HTML report so a triaged failure
  can be re-run with `--project=<name>`.
 */
const browserProjects = [
  {
    name: 'chrome',
    use: { ...devices['Desktop Chrome'], channel: 'chrome' },
  },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chromium'] },
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
];

const matrixMode = process.env.KF_E2E_MATRIX === '1';

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
  /*
    In matrix mode the `chrome` project is the only one kept when the user
    wants a single-engine smoke run; the four-project set is the full
    certification. CI flips the flag so every push gets the matrix for
    free.
  */
  projects: matrixMode
    ? browserProjects
    : browserProjects.filter((project) => project.name === 'chrome'),
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
