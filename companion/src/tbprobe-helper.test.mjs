import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TablebaseHelper } from './tbprobe-helper.mjs';

/**
 * The helper's process management, and — where the machine has both — the real
 * decoder against real tables.
 *
 * Split deliberately. The lifecycle half must run everywhere, including on a
 * machine with no compiler and no tablebase files, because that is where the
 * "reports failure honestly rather than throwing" behaviour matters most. The
 * correctness half runs only when a build and a directory are present, and
 * says so when it skips rather than passing silently.
 *
 * Point `KINGFISHER_TEST_SYZYGY` at a directory of Syzygy tables to run it.
 * Three-piece tables (KQvK, KRvK, KPvK, KNvK) are about 25 kB in total and are
 * enough for everything asserted here.
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

const HELPER = builtHelper();
const TABLES = process.env.KINGFISHER_TEST_SYZYGY ?? null;
const live = HELPER && TABLES && existsSync(TABLES) ? describe : describe.skip;

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
    const helper = new TablebaseHelper(HELPER ?? path.join(directory, 'missing'));
    const state = await helper.use(file);
    expect(state.available).toBe(false);
    expect(state.reason).toBeTruthy();
  });

  it('is unavailable, not broken, with nothing configured', async () => {
    const helper = new TablebaseHelper(HELPER ?? path.join(directory, 'missing'));
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

live('the helper against real Syzygy tables', () => {
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
    // Putting the rook on the file the king stands on stalemates it.
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
    expect(result.reason).toMatch(/pieces|castling/i);
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
    /*
      The reason requests are queued. Two probes issued at once on one stdout
      stream could each read the other's answer, and a tablebase result
      attributed to the wrong position is the worst bug this feature could have.
    */
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
