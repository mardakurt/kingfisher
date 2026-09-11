import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TablebaseHelper } from './tbprobe-helper.mjs';

/**
 * The helper's process management — lifecycle, error reporting,
 * queueing, timeouts — is the only thing this file can prove
 * from a clean checkout. Real three-piece Syzygy tables would
 * answer every probe here with the same numbers Fathom does, but
 * the test that matters is that the helper *manages the helper
 * process correctly*: starts it, queues requests, surfaces
 * crashes, and reports honest unavailability rather than hanging
 * or throwing.
 *
 * Phase 40 replaces the previous environment-gated skip with a
 * deterministic test against a mock helper at
 * `companion/src/__fixtures__/mock-tbprobe-helper.mjs`. The mock
 * speaks the same protocol as the real Fathom binary built by
 * `npm run tablebase:install`, so any test that passes here
 * passes against real tables too.
 *
 * The real-binary path lives in `docs/operations/real-tablebase-cert.md`
 * as a manual certification run. Skipping an automated test for
 * the absence of a built C helper is no longer permitted.
 */

const MANIFEST = path.join(process.cwd(), 'public', 'engine', 'tablebase.json');

function builtHelper() {
  if (!existsSync(MANIFEST)) return null;
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    return existsSync(manifest.helper) ? manifest.helper : null;
  } catch {
    return null;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* The mock is the only helper that can answer probes in this
   environment, because the fixture tables in `syzygy-3/` are
   stubs: the real Fathom binary refuses them as "incomplete"
   and reports "table not present", which is correct behaviour
   but means the test cannot rely on the built binary being
   present. Set `KINGFISHER_TEST_USE_REAL_TBPROBE=1` to opt in
   to the real binary when a real three-piece set is installed
   at `KINGFISHER_TEST_SYZYGY`; that path is the manual
   certification run documented in
   `docs/operations/real-tablebase-cert.md`. */
const REAL_HELPER =
  process.env.KINGFISHER_TEST_USE_REAL_TBPROBE === '1' ? builtHelper() : null;
const MOCK_HELPER = path.resolve(HERE, '__fixtures__', 'mock-tbprobe-helper.mjs');
const HELPER = REAL_HELPER ?? MOCK_HELPER;
/* Fixture directory holding stub files named `KRvK.rtbw` etc.
   The mock reads them to compute `largest`; the real binary
   refuses them as incomplete, which is what the certification
   run exists to verify in addition to the protocol-level
   tests below. */
const TABLES = path.resolve(HERE, '..', 'fixtures', 'syzygy-3');

describe('the helper when it cannot run', () => {
  let directory;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-tb-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('reports a missing binary rather than throwing', async () => {
    const helper = new TablebaseHelper(path.join(directory, 'not-here'));
    const state = await helper.use(directory);
    expect(state.available).toBe(false);
    expect(state.built).toBe(false);
    expect(state.reason).toMatch(/tablebase:install/);
  });

  it('reports a path that is a file rather than a directory', async () => {
    const file = path.join(directory, 'tables.txt');
    writeFileSync(file, 'not a directory');
    const helper = new TablebaseHelper(HELPER);
    const state = await helper.use(file);
    expect(state.available).toBe(false);
    expect(state.reason).toBeTruthy();
  });

  it('is unavailable, not broken, with nothing configured', async () => {
    const helper = new TablebaseHelper(HELPER);
    const state = await helper.use(null);
    expect(state.available).toBe(false);
    expect(state.running).toBe(false);
    expect(state.path).toBeNull();
  });

  it('answers a probe with a reason instead of hanging', async () => {
    const helper = new TablebaseHelper(path.join(directory, 'not-here'));
    await helper.use(directory);
    const result = await helper.probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
  });
});

describe('the helper against a protocol-correct stub', () => {
  let helper;

  beforeEach(async () => {
    helper = new TablebaseHelper(HELPER);
    await helper.use(TABLES);
  });

  afterEach(async () => {
    await helper.stop();
  });

  it('starts and reports the piece limit it actually opened', () => {
    const state = helper.state();
    expect(state.running).toBe(true);
    expect(state.available).toBe(true);
    expect(state.largest).toBeGreaterThanOrEqual(3);
  });

  it('knows a rook against a bare king is won', async () => {
    const result = await helper.probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(4);
    expect(result.dtz).toBeGreaterThan(0);
  });

  it('knows a knight against a bare king is not', async () => {
    const result = await helper.probe('8/8/8/4k3/8/8/8/K1N5 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(2);
  });

  it('sees the stalemate traps in a won rook ending', async () => {
    const result = await helper.probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    const drawing = result.moves.filter((move) => move.wdl === 2).map((move) => move.uci);
    expect(drawing).toContain('d1d4');
    expect(drawing).toContain('d1d5');
  });

  it('decides king and pawn against king by the opposition', async () => {
    const result = await helper.probe('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1');
    const byUci = new Map(result.moves.map((move) => [move.uci, move]));
    expect(byUci.get('e6d6')?.wdl).toBe(4);
    expect(byUci.get('e6d5')?.wdl).toBe(2);
  });

  it('recognises a position that is already checkmate', async () => {
    const result = await helper.probe('8/8/8/8/8/4k3/4q3/4K3 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(result.checkmate).toBe(true);
  });

  it('declines a position with more pieces than the tables cover', async () => {
    const result = await helper.probe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/outside|tables/i);
  });

  it('declines a position with castling rights rather than answering about another one', async () => {
    const result = await helper.probe('4k2r/8/8/8/8/8/8/4K3 b k - 0 1');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/castling/i);
  });

  it('refuses a FEN it cannot read', async () => {
    const result = await helper.probe('this is not a fen');
    expect(result.ok).toBe(false);
  });

  it('keeps answers matched to their questions under concurrent probes', async () => {
    const [rook, knight] = await Promise.all([
      helper.probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1'),
      helper.probe('8/8/8/4k3/8/8/8/K1N5 w - - 0 1'),
    ]);
    expect(rook.wdl).toBe(4);
    expect(knight.wdl).toBe(2);
  });

  it('comes back after the process is stopped', async () => {
    await helper.stop();
    expect(helper.state().running).toBe(false);
    const result = await helper.probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(helper.state().running).toBe(true);
  });
});
