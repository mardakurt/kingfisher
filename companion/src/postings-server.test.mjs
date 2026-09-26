/**
 * The posting layout through the companion's own HTTP routes (Phase 86).
 *
 * `postings.test.mjs` proves the layout answers as the row layout does, in
 * process. This proves the server serves it: the kit is loaded at start, a
 * collection is created in the layout on request, games imported over HTTP
 * explore with SAN derived, and a row-layout collection is converted by the
 * maintenance job and answers the same afterwards. A real server, as a child
 * process, as the browser meets it.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as kit from '../../src/companion-kit/import-kit.ts';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'postings-server-test-token';
const PORT = 4501;
const BASE = `http://127.0.0.1:${PORT}`;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

let companion;

const post = async (route, body) => {
  const response = await fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
};

const games = kit.preparePgnBatch(
  readFileSync(new URL('../../public/bench/bench-1k.pgn', import.meta.url), 'utf8')
    .split('\n\n[Event')
    .slice(0, 120)
    .join('\n\n[Event'),
  null,
  true,
  1_790_000_000_000,
).payloads;

beforeAll(async () => {
  companion = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(PORT),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'kingfisher-postings-http-')),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('The companion never became ready.');
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        await response.text();
        return;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 40_000);

afterAll(() => {
  companion?.kill('SIGKILL');
});

describe('the companion serves the posting layout', () => {
  it('creates, imports into and explores a compact collection', async () => {
    const created = await post('/db/create', { name: 'Compact HTTP', layout: 'postings' });
    expect(created.status).toBe(200);
    expect(created.json.layout).toBe('postings');
    const rows = await post('/db/create', { name: 'Rows HTTP' });
    expect(rows.json.layout).toBe('rows');

    for (const key of [created.json.key, rows.json.key]) {
      const imported = await post('/db/import', { key, games });
      expect(imported.json).toEqual({ imported: games.length, duplicates: 0 });
    }
    const compact = await post('/db/explore', { key: created.json.key, positionKey: START });
    const reference = await post('/db/explore', { key: rows.json.key, positionKey: START });
    expect(compact.status).toBe(200);
    expect(compact.json.totalGames).toBe(games.length);
    expect(compact.json.moves.map((m) => [m.uci, m.san, m.games]).sort()).toEqual(
      reference.json.moves.map((m) => [m.uci, m.san, m.games]).sort(),
    );
    const schema = await post('/db/schema', { key: created.json.key });
    expect(schema.json.layout).toBe('postings');
    expect(schema.json.kit).toBe('loaded');

    // A structure search it cannot answer says why, and the process stays up.
    const refused = await post('/db/structure-search', {
      key: created.json.key,
      query: { mode: 'pawn-skeleton', pawnSkeleton: 'x' },
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.json.error).toMatch(/does not store pawn structures/);
    expect((await fetch(`${BASE}/health`)).ok).toBe(true);
  }, 60_000);

  it('converts a row-layout collection in a maintenance job', async () => {
    const rows = await post('/db/create', { name: 'Convert HTTP' });
    await post('/db/import', { key: rows.json.key, games });
    const before = await post('/db/explore', { key: rows.json.key, positionKey: START });

    const started = await post('/db/convert-postings', { key: rows.json.key });
    expect(started.status).toBe(202);
    let status = started.json;
    const deadline = Date.now() + 30_000;
    while (status?.status === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = (await post('/db/maintenance-status', { key: rows.json.key })).json;
    }
    expect(status.status).toBe('completed');
    expect(status.result.converted).toBe(games.length);

    const after = await post('/db/explore', { key: rows.json.key, positionKey: START });
    expect((await post('/db/schema', { key: rows.json.key })).json.layout).toBe('postings');
    expect(after.json).toEqual(before.json);
  }, 60_000);
});
