import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { selectTool } from './tools';

/**
 * Install flow for an optional reference pack, exercised through the
 * real UI.
 *
 * Phase 40 replaces the previous "skip when no built pack exists"
 * gate with a generated deterministic fixture pack. The fixture is
 * built at test startup from the same `kingfisher-pack/1` schema
 * the production packs use, so the install pipeline — manifest
 * fetch, chunk download, digest verification, IndexedDB
 * persistence, catalog registration, Explorer wiring — runs end to
 * end and is the same code path the user exercises.
 *
 * The real-pack coverage — 80 chunks and 32 MB through a real
 * network — moves to `docs/operations/real-reference-pack-cert.md`
 * as a manual certification run. CI never has the optional packs
 * because they are gitignored build output, and a "passing
 * vacuously" suite is worse than a deterministic one.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function openReferenceSources(page: Page) {
  await page.goto('/databases');
  await ready(page);
  await page.getByRole('button', { name: /Reference sources/ }).click();
  await expect(page.locator('[data-source-row="kingfisher-starter"]')).toBeVisible({
    timeout: 60_000,
  });
}

async function installFromUrl(page: Page, url: string) {
  const form = page.locator('form:has(#pack-url)');
  if (!(await form.isVisible()))
    await page.getByRole('button', { name: 'Install from a URL' }).click();
  await form.locator('#pack-url').fill(url);
  // Scoped to the form: every catalog row has an Install button of its own.
  await form.getByRole('button', { name: 'Install', exact: true }).click();
}

/* ---------------------------------------------------------------- *
 * Fixture pack — the deterministic input the e2e suite installs.   *
 *                                                                    *
 * Built once per test run in a temp directory. The format, the      *
 * chunk layout, and the line records are identical in shape to the  *
 * production packs so every code path the user exercises runs       *
 * here. The pack is small by design: the brief is explicit that     *
 * "real scale" coverage is a manual certification, not an           *
 * automated gate.                                                   *
 * ---------------------------------------------------------------- */

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface FixturePack {
  readonly directory: string;
  readonly id: string;
  readonly name: string;
  readonly counts: { games: number; openable: number; positions: number; players: number };
  close(): void;
}

function buildFixturePack(): FixturePack {
  const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-pack-e2e-'));

  const id = 'kingfisher-test-pack';
  const name = 'Kingfisher Test Reference';
  const version = 'phase40-fixture';

  /* The chunk records match what the production packer emits.
     Two positions, one game, one player, one playergames entry —
     enough for the explorer to render a row, the catalog to
     register a source, and the integrity check to pass. */
  const explorer = gzipSync(
    Buffer.from(
      [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|e4,e2e4,100,40,35,25,2500,126,60,25,20,15|g1',
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|e5,d7d5,80,40,35,25,2500,150,60,20,15,10|g1',
      ].join('\n') + '\n',
      'utf8',
    ),
  );
  const game = gzipSync(
    Buffer.from(
      [
        'g1',
        'Test White',
        'Test Black',
        '1-0',
        '2026',
        '2026.09.01',
        'E',
        'B90',
        'Najdorf',
        '2500',
        '2480',
        'https://example.invalid/g1',
        'e4 c5',
      ].join('\t') + '\n',
      'utf8',
    ),
  );
  const players = gzipSync(
    Buffer.from(
      ['testwhite', '', 'Test White', '1', 'GM', '10', '2020', '2026', '2500', '2490'].join('\t') +
        '\n',
      'utf8',
    ),
  );
  const playergames = gzipSync(Buffer.from('testwhite|g1\n', 'utf8'));

  const chunks = [
    { kind: 'explorer', shard: 0, file: 'explorer-000.kfp.gz', bytes: explorer, entries: 2 },
    { kind: 'game', shard: 0, file: 'game-000.kfp.gz', bytes: game, entries: 1 },
    { kind: 'players', shard: 0, file: 'players-000.kfp.gz', bytes: players, entries: 1 },
    {
      kind: 'playergames',
      shard: 0,
      file: 'playergames-000.kfp.gz',
      bytes: playergames,
      entries: 1,
    },
  ] as const;

  const manifest = {
    format: 'kingfisher-pack/1',
    id,
    name,
    description:
      'A pack shipped with the e2e suite so the install flow is exercised end-to-end in CI.',
    version,
    builtAt: '2026-09-01',
    license: { id: 'CC0-1.0', name: 'CC0', url: 'https://example.invalid/cc0' },
    provenance: {
      source: 'Test fixture',
      url: 'https://example.invalid/test-pack',
      retrieved: '2026-09-01',
      transformation: 'None.',
      upstream: [],
    },
    counts: { games: 1, openable: 1, positions: 2, players: 1 },
    maxPositionPly: 40,
    recentSince: 2026,
    shards: { explorer: 1, game: 1, players: 1, playergames: 1 },
    chunks: chunks.map(({ kind, shard, file, bytes, entries }) => ({
      id: `${kind}-${shard}`,
      kind,
      shard,
      file,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      entries,
    })),
    rawBytes: explorer.byteLength + game.byteLength + players.byteLength + playergames.byteLength,
    compressedBytes:
      explorer.byteLength + game.byteLength + players.byteLength + playergames.byteLength,
  };

  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  for (const { file, bytes } of chunks) {
    writeFileSync(path.join(directory, file), bytes);
  }

  return {
    directory,
    id,
    name,
    counts: manifest.counts,
    close() {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        /* The temp dir is best-effort cleanup. */
      }
    },
  };
}

/**
 * Serve a pack directory, with the same hooks (`corrupt`, `version`,
 * `delayMs`) the previous real-pack server had so the same failure
 * modes are exercised through the same UI.
 */
function servePack(
  directory: string,
  options: { corrupt?: boolean; version?: string; delayMs?: number } = {},
) {
  const server: Server = createServer((request, response) => {
    const name = path.basename(new URL(request.url ?? '/', 'http://x').pathname);
    const file = path.join(directory, name);
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (!name || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('no');
      return;
    }
    if (name === 'manifest.json' && options.version) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      response.writeHead(200).end(JSON.stringify({ ...manifest, version: options.version }));
      return;
    }
    if (options.corrupt && name === 'explorer-000.kfp.gz') {
      const bytes = readFileSync(file);
      const at = Math.floor(bytes.length / 2);
      bytes.writeUInt8(bytes.readUInt8(at) ^ 0xff, at);
      response.writeHead(200, { 'content-length': String(bytes.length) }).end(bytes);
      return;
    }
    response.writeHead(200, { 'content-length': String(statSync(file).size) });
    setTimeout(() => {
      if (!response.destroyed) createReadStream(file).pipe(response);
    }, options.delayMs ?? 0);
  });
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/manifest.json`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test.describe('installing a reference pack through the real UI', () => {
  test.slow();
  test.use({ actionTimeout: 30_000 });

  let fixture: FixturePack;
  test.beforeAll(() => {
    fixture = buildFixturePack();
  });
  test.afterAll(() => {
    fixture?.close();
  });

  test('installs the fixture pack, answers a chess question, and can be removed again', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const pack = await servePack(fixture.directory);
    const id = fixture.id;
    const expectedGames = fixture.counts.games.toLocaleString();
    try {
      await openReferenceSources(page);
      await installFromUrl(page, pack.url);

      const row = page.locator(`[data-source-row="${id}"]`);
      await expect(row).toBeVisible({ timeout: 120_000 });

      /*
        Installed, and reporting the numbers its own manifest states.

        Not "a row appeared": a pack that installed one of four
        chunks and called itself ready would also produce a row.
        The game count is the cheapest thing that can only be
        right if the whole thing landed.
      */
      await expect(row).toContainText(expectedGames, { timeout: 240_000 });
      await expect(row.getByRole('button', { name: /^Remove /i })).toBeVisible();

      // It is a source the explorer will actually use.
      await page.goto('/analysis');
      await ready(page);
      const dock = page.locator('[data-workspace-dock]').first();
      await selectTool(page, dock, 'Explorer');
      const picker = dock.getByRole('combobox', { name: 'Evidence source' });
      await expect(picker.locator(`option[value="${id}"]`)).toHaveCount(1, { timeout: 60_000 });
      await picker.selectOption(id);
      await expect(dock.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 60_000 });

      /*
        And it answers as itself.

        A source that silently fell back to the bundled Starter
        would still show moves here; the assertion is on the
        count the panel attributes to *this* source being the
        one this fixture carries and Starter does not.
      */
      await expect(dock).toContainText(`${expectedGames} games here`);

      // Verification is clean on a pack that just installed.
      await openReferenceSources(page);
      await row.getByRole('button', { name: /^Show details of/ }).click();
      await row.getByRole('button', { name: 'Verify integrity' }).click();
      await expect(page.getByText(/all chunks verified/i)).toBeVisible({ timeout: 120_000 });

      // Removing it takes it away and leaves the bundled source alone.
      await row.getByRole('button', { name: /^Remove /i }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(row.getByRole('button', { name: 'Install', exact: true })).toHaveCount(0, {
        timeout: 120_000,
      });
      await expect(page.locator('[data-source-row="kingfisher-starter"]')).toContainText(
        'Built in',
      );
    } finally {
      await pack.close();
    }
  });

  /**
   * A chunk that arrives whole and hashes to the wrong thing.
   *
   * The contract is that a pack is wholly installed or not
   * installed at all, and the failure mode it exists to prevent
   * is the one nobody would notice: a source in the catalog,
   * marked ready, quietly answering from part of its data. So
   * the assertion is not that an error appeared — it is that the
   * source never became usable.
   */
  test('a pack whose bytes do not match its digest never becomes a source', async ({ page }) => {
    test.setTimeout(300_000);
    const pack = await servePack(fixture.directory, { corrupt: true });
    const id = fixture.id;
    try {
      await openReferenceSources(page);
      await installFromUrl(page, pack.url);

      const row = page.locator(`[data-source-row="${id}"]`);
      await expect(row).toBeVisible({ timeout: 120_000 });
      await expect(row).toContainText(/does not match|verification|digest|damaged|failed/i, {
        timeout: 240_000,
      });

      // Never usable: no toggle a person can turn on, and never
      // offered to the explorer as a source.
      await expect(row.getByRole('switch', { name: `Use ${fixture.name}` })).toBeDisabled();

      await page.goto('/analysis');
      await ready(page);
      const dock = page.locator('[data-workspace-dock]').first();
      await selectTool(page, dock, 'Explorer');
      const picker = dock.getByRole('combobox', { name: 'Evidence source' });
      await expect(picker.locator(`option[value="${id}"]:not([disabled])`)).toHaveCount(0);
    } finally {
      await pack.close();
    }
  });
});
