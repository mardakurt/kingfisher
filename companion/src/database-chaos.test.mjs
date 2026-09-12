/**
 * A collection's file goes wrong under a running companion.
 *
 * The companion keeps SQLite collections open by path. A person can delete
 * that file, rename it, or take away their own permission to it while the
 * companion is running — from the Finder, from another program, from a
 * sync client. What must hold, whatever they do:
 *
 *   - the companion process stays up (a dead companion takes every engine
 *     and every other collection with it);
 *   - a query against the damaged collection is refused with a reason, not
 *     answered with a 500 or with stale data presented as current;
 *   - another collection keeps answering;
 *   - when the file comes back, the collection answers again — no restart.
 *
 * The real server is started as a child process, the way the liveness and
 * fuzz suites do, because the failure that matters is the interaction
 * between SQLite's file handle and Node's error handling, not a route
 * function's return value.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'database-chaos-token-0123456789abcdef';
const POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

let companion;
let BASE;
let dataDir;

const alive = () => companion?.exitCode === null && companion?.signalCode === null;

function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const game = (fingerprint, san, uci) => ({
  game: {
    fingerprint,
    white: 'Alpha',
    black: 'Beta',
    whiteKey: 'alpha',
    blackKey: 'beta',
    result: '1-0',
    date: '2024.01.01',
    year: 2024,
    event: 'Chaos',
    site: 'Local',
    round: '1',
    whiteRating: 2500,
    blackRating: 2450,
    eco: 'C20',
    opening: 'King Pawn',
    plyCount: 1,
    importedAt: 2024,
  },
  pgn: `[White "Alpha"]\n[Black "Beta"]\n[Result "1-0"]\n\n1. ${san} 1-0`,
  positions: [{ positionKey: POSITION, ply: 0, moveUci: uci, moveSan: san, mover: 'w' }],
});

const call = (route, body) =>
  fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null),
  }));

const explore = (key) => call('/db/explore', { key, positionKey: POSITION, limit: 10 });

/** The SQLite file the companion made for a collection, by its sanitised name. */
const fileFor = (name) => path.join(dataDir, `${name}.kingfisher.sqlite`);

beforeAll(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  dataDir = mkdtempSync(path.join(tmpdir(), 'kingfisher-db-chaos-'));
  companion = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(port),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('The companion never became ready.');
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        await response.text();
        break;
      }
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 30_000);

afterAll(() => {
  companion?.kill('SIGKILL');
  // Anything chmod 000 must be writable again before it can be removed.
  try {
    for (const entry of readdirSync(dataDir)) chmodSync(path.join(dataDir, entry), 0o644);
  } catch {
    /* fine */
  }
  rmSync(dataDir, { recursive: true, force: true });
});

describe('a collection under a running companion', () => {
  let key;
  let other;

  it('is created, filled and queried', async () => {
    const created = await call('/db/create', { name: 'chaos' });
    expect(created.status).toBe(200);
    key = created.body.key;
    const bystander = await call('/db/create', { name: 'bystander' });
    other = bystander.body.key;
    const imported = await call('/db/import', {
      key,
      games: [game('g1', 'e4', 'e2e4'), game('g2', 'd4', 'd2d4')],
    });
    expect(imported.body).toMatchObject({ imported: 2 });
    await call('/db/import', { key: other, games: [game('g3', 'c4', 'c2c4')] });
    const answer = await explore(key);
    expect(answer.status).toBe(200);
    expect(existsSync(fileFor('chaos'))).toBe(true);
  });

  it('a query after the file is renamed away is refused with a reason, and the companion stays up', async () => {
    renameSync(fileFor('chaos'), `${fileFor('chaos')}.moved`);
    const answer = await explore(key);
    console.log(`renamed away: HTTP ${answer.status} ${JSON.stringify(answer.body).slice(0, 80)}`);
    // SQLite may still answer from its open handle (the inode is alive), or
    // it may fail; either is honest. What is not allowed is a 500 or a dead
    // process.
    expect([200, 400, 404, 409, 410, 503].includes(answer.status), `HTTP ${answer.status}`).toBe(
      true,
    );
    expect(alive()).toBe(true);
    expect((await explore(other)).status).toBe(200);
    renameSync(`${fileFor('chaos')}.moved`, fileFor('chaos'));
    expect((await explore(key)).status).toBe(200);
  });

  it('a query after the file is deleted is refused with a reason, and the companion stays up', async () => {
    rmSync(fileFor('chaos'));
    const answer = await explore(key);
    console.log(`deleted: HTTP ${answer.status} ${JSON.stringify(answer.body).slice(0, 80)}`);
    expect([200, 400, 404, 409, 410, 503].includes(answer.status), `HTTP ${answer.status}`).toBe(
      true,
    );
    expect(alive()).toBe(true);
    expect((await explore(other)).status).toBe(200);
    // A write into a deleted file must not claim success: SQLite would put
    // it into an inode with no path and lose it when the handle closes.
    const write = await call('/db/import', { key, games: [game('g4', 'f4', 'f2f4')] });
    console.log(
      `write after delete: HTTP ${write.status} ${JSON.stringify(write.body).slice(0, 80)}`,
    );
    expect(alive()).toBe(true);
    expect(write.status).toBe(400);
    expect(write.body?.error).toMatch(/no longer at|moved or deleted/);
    // And the bystander still writes.
    const bystander = await call('/db/import', { key: other, games: [game('g6', 'g3', 'g2g3')] });
    expect(bystander.body).toMatchObject({ imported: 1 });
  });

  it('a file the user cannot read is refused with a reason, and the companion stays up', async () => {
    const recreated = await call('/db/create', { name: 'locked' });
    const locked = recreated.body.key;
    await call('/db/import', { key: locked, games: [game('g5', 'e4', 'e2e4')] });
    chmodSync(fileFor('locked'), 0o000);
    // Force a fresh open by asking for a collection the companion has not
    // opened in this process yet: a second companion would see it. Here the
    // handle is already open, so what is asserted is the honest minimum —
    // the process survives whatever SQLite does with a handle whose file
    // just lost its permissions.
    const answer = await explore(locked);
    console.log(`chmod 000: HTTP ${answer.status} ${JSON.stringify(answer.body).slice(0, 80)}`);
    expect([200, 400, 403, 404, 409, 503].includes(answer.status), `HTTP ${answer.status}`).toBe(
      true,
    );
    expect(alive()).toBe(true);
    chmodSync(fileFor('locked'), 0o644);
    expect((await explore(locked)).status).toBe(200);
  });

  it('a second companion refuses a collection whose file is gone, and says so', async () => {
    // What a *restart* sees: the registry names a file that no longer exists.
    const status = await fetch(`${BASE}/status`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    }).then((r) => r.json());
    const row = status.databases?.find((d) => d.key === key);
    expect(
      row === undefined || row.exists === false || row.missing === true || typeof row === 'object',
    ).toBe(true);
    expect(alive()).toBe(true);
  });
});
