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

/*
  Microsoft Edge, which the landing names as a supported browser. Not in the
  matrix: it is not installed on the maintainer's Mac. `edge-cert.yml` runs it
  on a GitHub-hosted Windows runner, where Edge is preinstalled, by naming it
  in KF_E2E_PROJECT.
*/
const edgeProject = {
  name: 'edge',
  use: { ...devices['Desktop Edge'], channel: 'msedge' },
};
/** One project by name, for a runner that has exactly that browser. */
const onlyProject = process.env.KF_E2E_PROJECT;

/**
 * How many times a failing test is retried, from the environment.
 *
 * Anything that is not a non-negative integer is **zero**, and says so. The
 * previous `Number(process.env.PLAYWRIGHT_RETRIES ?? 0)` turned a typo into
 * `NaN`, which is not zero, does not look like a mistake, and reached the
 * packaged acceptance run through this config's spread. A gate that must run
 * at zero retries should not be reachable by misspelling a variable.
 */
function parseRetries(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(
      `[playwright] PLAYWRIGHT_RETRIES="${raw}" is not a non-negative integer; running with 0 retries.`,
    );
    return 0;
  }
  return parsed;
}

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

    Not pinned to 0 here, deliberately. `browser-cert.yml` fires on a weekly
    cron and on `v*` tag pushes, and on both `github.event.inputs.retries` is
    empty, so the release gate is already pinned to 0 by the workflow itself
    and no config change could loosen it. The only way to raise this is a
    manual `workflow_dispatch`, which is the intended diagnostic entry point.
    Pinning the config would remove that tool and protect nothing.

    What *was* worth fixing is the arithmetic. `Number('abc')` is `NaN`, not
    0 — so a typo in the variable name (`PLAYWRIGHT_RETRES=2` in a shell
    profile, say) produced `retries: NaN`, which is not the zero the gate
    requires and does not look like a mistake on inspection. It also reached
    the packaged acceptance run, which spreads this config. Unparseable now
    means zero, loudly.
  */
  retries: parseRetries(process.env.PLAYWRIGHT_RETRIES),
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  expect: { timeout: 10_000 },
  /*
    In matrix mode the `chrome` project is the only one kept when the user
    wants a single-engine smoke run; the four-project set is the full
    certification. CI flips the flag so every push gets the matrix for
    free.
  */
  projects: onlyProject
    ? [...browserProjects, edgeProject].filter((project) => project.name === onlyProject)
    : matrixMode
      ? browserProjects
      : browserProjects.filter((project) => project.name === 'chrome'),
  use: {
    // Next 16's development HMR origin checks reject 127.0.0.1 while the
    // server advertises localhost; using the canonical host keeps hydration
    // and browser event handlers deterministic.
    baseURL: 'http://localhost:3210',
    // Every test starts on a written, empty preferences profile at the
    // current schema version. Nothing opens on launch any more (Phase 61
    // dropped the tour and the name prompt); fresh-install regressions
    // still override this with no storage at all and assert exactly that.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3210',
          localStorage: [
            {
              name: 'kingfisher.preferences',
              value: JSON.stringify({ state: {}, version: 7 }),
            },
          ],
        },
      ],
    },
    /*
      No browser here. Each project names its own device and channel; a
      top-level `channel: 'chrome'` (here since Phase 8, before the projects
      existed) leaked into the Firefox and WebKit projects, and both failed
      every test at launch with "Unsupported firefox channel chrome". Phase
      43's "the matrix passed on Firefox and WebKit" could not have been a
      run of this configuration.
    */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      // Turbopack's development manifest writes intermittently produced empty
      // manifests during long suites. Exercise the same app with Next's supported
      // Webpack dev server; production builds retain their normal bundler.
      command: 'npm run dev -- --webpack',
      env: {
        KINGFISHER_E2E: '1',
        // Keep the long route suite below Next's 80% development restart threshold.
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=6144']
          .filter(Boolean)
          .join(' '),
      },
      url: 'http://localhost:3210/analysis',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node scripts/build-companion-kit.mjs && npm run companion',
      url: 'http://127.0.0.1:4338/health',
      reuseExistingServer: false,
      // Includes building the source import bundle before the HTTP server starts.
      timeout: 120_000,
      env: {
        KINGFISHER_COMPANION_PORT: '4338',
        KINGFISHER_COMPANION_TOKEN: 'phase8-e2e-token',
        KINGFISHER_COMPANION_DATA_DIR: companionData,
        KINGFISHER_COMPANION_KIT: path.join(companionData, 'import-kit.mjs'),
      },
    },
  ],
});
