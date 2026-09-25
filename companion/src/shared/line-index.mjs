// GENERATED from src/search/line-index.ts by `npm run companion:shared`. Do not edit.
/**
 * A game's main line, kept compact enough to scan millions of games in
 * seconds (Phase 85).
 *
 * The move search (`game-scan.ts`) asks three questions of a main line —
 * does this material hold for two positions, does this theme, did a piece
 * take this route — and until Phase 85 a companion database answered them by
 * sending every game's positions to the browser, 340 games a second. This is
 * what the companion keeps instead, one small binary value per game, built in
 * the browser at import from the same line `scanLine` reads
 * (`line-index-encode.ts`), and read by the companion's own scan:
 *
 * - **material runs** — the counts of each side's pieces, and the position
 *   where each run of unchanged material starts (material changes only on a
 *   capture or a promotion, so a game is a few dozen runs);
 * - **moves** — each main-line move as its squares, whether it promotes, the
 *   mover and whether the target square held a piece, which is all
 *   `findRoute` reads of a position;
 * - **themes** — for each strategic theme the line holds, the first ply it
 *   held for two positions (the same `firstHeld` rule), computed with the
 *   theme definitions of `THEMES_VERSION`.
 *
 * The answers are the scan's answers: the material test and the route are the
 * same functions (`materialMatchesCounts`, `findRoute`), and
 * `line-index.test.ts` requires the index and `scanLine` to agree game for
 * game. This module has no value imports outside `src/search`, so the
 * companion runs it as generated JavaScript (`npm run companion:shared`)
 * rather than as a second implementation.
 */



import { materialMatchesCounts,                                       } from './material-query.mjs';
import { findRoute,                                             } from './route.mjs';

export const LINE_INDEX_VERSION = 1;





























const PIECES                                 = [null, 'p', 'n', 'b', 'r', 'q', 'k'];
const SIDE_KEYS = ['q', 'r', 'b', 'n', 'p']         ;

/** a1 = 0 … h1 = 7, a2 = 8 … h8 = 63. */
export const squareIndex = (square        )         =>
  square.charCodeAt(0) - 97 + (square.charCodeAt(1) - 49) * 8;
const squareName = (index        )         =>
  `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`;

export function encodeLineIndex(parts                )             {
  const themes = [...parts.themes.entries()].map(
    ([id, ply]) => [new TextEncoder().encode(id.slice(0, 64)), ply]         ,
  );
  const size =
    1 +
    2 +
    2 +
    2 +
    2 +
    parts.runs.length * 7 +
    2 +
    parts.moves.length * 3 +
    1 +
    themes.reduce((sum, [bytes]) => sum + 1 + bytes.length + 2, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u8 = (value        ) => {
    view.setUint8(at, value);
    at += 1;
  };
  const u16 = (value        ) => {
    view.setUint16(at, value);
    at += 2;
  };
  u8(LINE_INDEX_VERSION);
  u16(parts.themesVersion);
  u16(parts.firstPly);
  u16(parts.positions);
  u16(parts.runs.length);
  for (const run of parts.runs) {
    // Ten counts of four bits: White's Q R B N P, then Black's.
    let packed = 0n;
    for (const side of [run.w, run.b]) {
      for (const key of SIDE_KEYS) packed = (packed << 4n) | BigInt(Math.min(15, side[key]));
    }
    for (let shift = 32n; shift >= 0n; shift -= 8n) u8(Number((packed >> shift) & 0xffn));
    u16(run.start);
  }
  u16(parts.moves.length);
  for (const move of parts.moves) {
    const mover = move.mover ? PIECES.indexOf(move.mover.type) : 0;
    const colour = move.mover?.color === 'b' ? 1 : 0;
    // from (6) · to (6) · promotion (1) · colour (1) · mover (3) · target occupied (1) = 18 bits
    const value =
      (move.from << 12) |
      (move.to << 6) |
      ((move.promotion ? 1 : 0) << 5) |
      (colour << 4) |
      (mover << 1) |
      (move.targetOccupied ? 1 : 0);
    // The first two bits of `from` go in the high byte's spare room.
    u8((value >> 16) & 0xff);
    u16(value & 0xffff);
  }
  u8(themes.length);
  for (const [bytes, ply] of themes) {
    u8(bytes.length);
    out.set(bytes, at);
    at += bytes.length;
    u16(ply);
  }
  return out;
}

export function decodeLineIndex(bytes            )                        {
  if (bytes.length < 11 || bytes[0] !== LINE_INDEX_VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 1;
  const u8 = () => view.getUint8(at++);
  const u16 = () => {
    const value = view.getUint16(at);
    at += 2;
    return value;
  };
  const themesVersion = u16();
  const firstPly = u16();
  const positions = u16();
  const runCount = u16();
  const runs                = [];
  for (let index = 0; index < runCount; index += 1) {
    let packed = 0n;
    for (let byte = 0; byte < 5; byte += 1) packed = (packed << 8n) | BigInt(u8());
    const counts           = [];
    for (let shift = 36n; shift >= 0n; shift -= 4n) counts.push(Number((packed >> shift) & 0xfn));
    const side = (offset        )               => ({
      q: counts[offset] ,
      r: counts[offset + 1] ,
      b: counts[offset + 2] ,
      n: counts[offset + 3] ,
      p: counts[offset + 4] ,
    });
    runs.push({ w: side(0), b: side(5), start: u16() });
  }
  const moveCount = u16();
  const moves                = [];
  for (let index = 0; index < moveCount; index += 1) {
    const value = (u8() << 16) | u16();
    const mover = (value >> 1) & 7;
    moves.push({
      from: (value >> 12) & 63,
      to: (value >> 6) & 63,
      promotion: ((value >> 5) & 1) === 1,
      mover: mover
        ? { color: ((value >> 4) & 1) === 1 ? 'b' : 'w', type: PIECES[mover]               }
        : null,
      targetOccupied: (value & 1) === 1,
    });
  }
  const themeCount = u8();
  const themes = new Map                ();
  for (let index = 0; index < themeCount; index += 1) {
    const length = u8();
    const id = new TextDecoder().decode(bytes.subarray(at, at + length));
    at += length;
    themes.set(id, u16());
  }
  return { themesVersion, firstPly, positions, runs, moves, themes };
}















/**
 * The same answer `scanLine` gives the same line: the ply at which every
 * question asked has held (the latest of their first moments), or a miss.
 */
export function scanLineIndex(line                , query              )                {
  const moments           = [];

  if (query.material) {
    const { query: material, colour } = query.material;
    const matches = line.runs.map((run) =>
      materialMatchesCounts({ w: run.w, b: run.b }, material, colour),
    );
    let held                = null;
    for (let index = 0; index < line.runs.length; index += 1) {
      if (!matches[index]) continue;
      const run = line.runs[index] ;
      const end = index + 1 < line.runs.length ? line.runs[index + 1] .start : line.positions;
      // Two positions of the run, the next run matching too, or the end of the game.
      if (end - run.start >= 2 || matches[index + 1] || index + 1 === line.runs.length) {
        held = line.firstPly + run.start;
        break;
      }
    }
    if (held === null) return { kind: 'miss' };
    moments.push(held);
  }

  if (query.theme) {
    if (line.themesVersion !== query.themesVersion) return { kind: 'unanswerable' };
    const ply = line.themes.get(query.theme);
    if (ply === undefined) return { kind: 'miss' };
    moments.push(ply);
  }

  if (query.route) {
    const moves              = line.moves.map((move, index) => ({
      ply: line.firstPly + index + 1,
      uci: `${squareName(move.from)}${squareName(move.to)}${move.promotion ? 'q' : ''}`,
      mover: move.mover,
      targetOccupied: move.targetOccupied,
    }));
    const at = findRoute(moves, query.route.route, query.route.colour);
    if (at === null) return { kind: 'miss' };
    moments.push(at);
  }

  if (moments.length === 0) return { kind: 'unanswerable' };
  return { kind: 'hit', ply: Math.max(...moments) };
}
