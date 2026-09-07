/**
 * A real Syzygy probe, against real tables.
 *
 * Every other tablebase test in this repository writes empty files named
 * `KQvK.rtbw` and checks that the *scanner* reads the material and the piece
 * count out of the filename. That is worth testing and it is not this: an
 * empty file proves nothing about whether Kingfisher can answer "is this
 * position won", which is the only question a tablebase exists for. Phase 19
 * could not close the gap because the machine had no tables, and said so.
 *
 * The whole three-piece set is 56 KB — smaller than several of this project's
 * PGN fixtures — so it is committed rather than downloaded, and the answers
 * below are ones a person can check without a computer.
 *
 * `wdl` follows Fathom's scale: 4 win, 2 draw, 0 loss, with 3 and 1 for the
 * cursed wins and blessed losses the fifty-move rule creates.
 *
 * **Skipped, not failed, when the helper is not built.** It needs a C
 * compiler; `npm run tablebase:install` fetches Fathom's MIT-licensed decoder
 * and builds it. A machine without one is a supported configuration —
 * Kingfisher falls back to the public service and says which answered — so a
 * missing helper is not a broken build, and the skip names the reason.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { TablebaseHelper } from './tbprobe-helper.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'fixtures', 'syzygy-3');
const BINARY = path.join(HERE, '..', '..', 'engines', 'tablebase', 'kingfisher-tbprobe');

const built = existsSync(BINARY);
const suite = built ? describe : describe.skip;

suite('probing real three-piece Syzygy tables', () => {
  const helper = new TablebaseHelper(built ? BINARY : null);
  afterAll(async () => {
    await helper.stop();
  });

  const probe = async (fen) => {
    await helper.use(TABLES);
    return helper.probe(fen);
  };

  it('reports the piece limit the files on disk actually support', async () => {
    await helper.use(TABLES);
    const status = helper.state();
    expect(status.available).toBe(true);
    expect(status.largest).toBe(3);
  });

  /*
    A rook against a bare king is won. This is the position the Settings panel
    tests with, chosen because the user can check the answer themselves.
  */
  it('says a rook against a bare king is won, and how far from a reset', async () => {
    const result = await probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(4);
    expect(result.dtz).toBeGreaterThan(0);
  });

  /*
    The half that a "does it answer?" check would miss.

    Three of White's rook moves put the rook where the king takes it, and the
    position after each is a draw. A source that returned "won" for the
    position and did not distinguish the moves would pass a connection test and
    be useless for the thing tablebases are for.
  */
  it('marks the rook moves that throw the win away as drawn', async () => {
    const result = await probe('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    const drawn = result.moves
      .filter((move) => move.wdl === 2)
      .map((move) => move.uci)
      .sort();
    expect(drawn).toEqual(['d1d4', 'd1d5', 'd1d6']);
  });

  it('says a knight against a bare king is drawn, because it is', async () => {
    const result = await probe('8/8/8/4k3/8/8/8/K1N5 w - - 0 1');
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(2);
  });

  it('says a bishop against a bare king is drawn too', async () => {
    const result = await probe('8/8/8/4k3/8/8/8/K1B5 w - - 0 1');
    expect(result.wdl).toBe(2);
  });

  /*
    A stalemate the tables have to recognise as one rather than as a loss.
    White to move: both d1 and f1 are covered by the pawn, d2 and f2 by the
    king, and e2 is defended.
  */
  it('recognises a stalemate as a draw, not as a loss', async () => {
    const result = await probe('8/8/8/8/8/4k3/4p3/4K3 w - - 0 1');
    expect(result.stalemate).toBe(true);
    expect(result.wdl).toBe(2);
  });

  /*
    The boundary. Four pieces are outside a three-piece set, and the answer has
    to be "I do not have that" rather than a guess — the fallback to the remote
    service depends on being told, and a wrong local answer would never reach
    it.
  */
  it('refuses a position with more pieces than it has tables for', async () => {
    const result = await probe('8/8/8/4k3/8/8/4R3/K3R3 w - - 0 1');
    expect(result.ok).toBe(false);
  });
});
