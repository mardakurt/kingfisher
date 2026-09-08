import { _electron, test as browserTest } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Run the same acceptance assertions inside a real packaged application. */
export const test = browserTest.extend({
  /*
    `use` is Playwright's fixture callback, not React's. It is bound to a local
    name here because `eslint-plugin-react-hooks` matches on the identifier
    alone: a parameter called `use` reads to it as a hook called outside a
    component, and it reports three errors in a file that has never seen React.
    Renaming at the boundary is cheaper and more honest than disabling the rule
    for the file, which would also hide a real one.
  */
  page: async ({ page }, provide) => {
    const binary = process.env.KINGFISHER_ACCEPTANCE_BINARY;
    if (!binary) return provide(page);
    const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-acceptance-'));
    const app = await _electron.launch({
      executablePath: binary,
      args: [`--user-data-dir=${profile}`],
      timeout: 120_000,
    });
    try {
      const window = await app.firstWindow();
      await window.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 120_000 });
      await provide(window);
    } finally {
      await app.close();
      rmSync(profile, { recursive: true, force: true });
    }
  },
});

export function analysisUrl(page: { url(): string }): string {
  return process.env.KINGFISHER_ACCEPTANCE_BINARY
    ? new URL('/analysis', page.url()).href
    : 'http://localhost:3210/analysis';
}
