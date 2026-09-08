import { _electron, test as browserTest } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Run the same acceptance assertions inside a real packaged application. */
export const test = browserTest.extend({
  page: async ({ page }, use) => {
    const binary = process.env.KINGFISHER_ACCEPTANCE_BINARY;
    if (!binary) return use(page);
    const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-acceptance-'));
    const app = await _electron.launch({
      executablePath: binary,
      args: [`--user-data-dir=${profile}`],
      timeout: 120_000,
    });
    try {
      const window = await app.firstWindow();
      await window.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 120_000 });
      await use(window);
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
