/**
 * One archive file, scanned into pre-sharded partial results.
 *
 * Runs as a worker thread so a twelve-core machine turns a fifteen-minute
 * single-threaded build into a two-minute one. Each worker owns its own Vite
 * module graph and therefore its own copy of the application's rules code;
 * that costs a second of startup per worker and buys the guarantee that the
 * position keys written here are the ones the running application computes.
 *
 * Output is written to disk already bucketed by shard, so the merge step never
 * has to hold the whole archive's positions in memory at once.
 */

import { mkdirSync, openSync, closeSync, writeSync } from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { closeApp, loadApp } from '../load-app.mjs';
import { readGames } from './pgn-stream.mjs';

const { file, outDir, shards, limits } = workerData;

/** Buffered per-shard appenders, so a scan is not one syscall per position. */
function shardWriter(kind, count) {
  const dir = path.join(outDir, kind);
  mkdirSync(dir, { recursive: true });
  const buffers = Array.from({ length: count }, () => []);
  const handles = Array.from({ length: count }, (_, shard) =>
    openSync(path.join(dir, `${shard}.txt`), 'a'),
  );
  const flush = (shard) => {
    if (buffers[shard].length === 0) return;
    writeSync(handles[shard], buffers[shard].join('\n') + '\n');
    buffers[shard] = [];
  };
  return {
    write(shard, line) {
      buffers[shard].push(line);
      if (buffers[shard].length >= 4096) flush(shard);
    },
    close() {
      for (let shard = 0; shard < count; shard += 1) {
        flush(shard);
        closeSync(handles[shard]);
      }
    },
  };
}

async function main() {
  const { Position, positionKey } = await loadApp(['/src/chess/position.ts', '/src/chess/fen.ts']);
  const { playerKey } = await loadApp(['/src/persistence/schema/migrations.ts']);
  const { shardOf } = await loadApp(['/src/reference/pack.ts']);

  const explorer = shardWriter('explorer', shards.explorer);
  const games = shardWriter('game', shards.game);
  const players = shardWriter('players', shards.players);
  const playerGames = shardWriter('playergames', shards.playergames);

  let seen = 0;
  let kept = 0;
  let opened = 0;
  let rejected = 0;
  let maxYear = 0;

  for await (const { tags, moves } of readGames(file)) {
    seen += 1;
    const result = tags.Result;
    if (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') continue;
    if (moves.length < limits.minPlies) continue;
    if (tags.Variant && tags.Variant !== 'Standard') continue;
    // A game starting from a set-up position is not part of an opening
    // reference, and its key sequence would not begin at the initial position.
    if (tags.FEN) continue;

    const white = (tags.White ?? '').trim();
    const black = (tags.Black ?? '').trim();
    if (!white || !black) continue;

    const whiteElo = Number(tags.WhiteElo) || 0;
    const blackElo = Number(tags.BlackElo) || 0;
    const whiteTitle = tags.WhiteTitle ?? '';
    const blackTitle = tags.BlackTitle ?? '';
    /*
      The lowest rating the archive actually stated, which is not the same as
      the lower of the two: relays routinely carry one player's rating and not
      the other's, and treating a missing tag as a rating of zero throws the
      game away. A missing rating is an absence of evidence, so it neither
      admits nor excludes; the ratings that *are* stated decide.
    */
    const stated = [whiteElo, blackElo].filter((elo) => elo > 0);
    const rated = stated.length > 0 ? Math.min(...stated) : 0;

    /*
      An upper bound, which is not a quality filter but a species filter. The
      archive relays engine tournaments (TCEC) and online events rated on a
      different scale alongside over-the-board chess, and both carry numbers no
      human has ever held — the highest FIDE rating ever achieved is 2882. Left
      in, they dominate every "strongest games at this position" list and make
      a player's recorded peak meaningless. Excluded, the reference is what it
      says it is: over-the-board games between people.
    */
    if (stated.some((elo) => elo > limits.maxRating)) continue;

    /*
      Titles are the second way in, because the archive has two kinds of game.
      Ordinary tournament games carry ratings and are admitted on them. Match
      and exhibition events frequently carry titles and no rating at all — and
      those are exactly the events former world champions play in, so a rating
      threshold alone silently excludes the players a reference most obviously
      ought to contain.
    */
    const titled = limits.titles.includes(whiteTitle) && limits.titles.includes(blackTitle);
    if (rated > 0 ? rated < limits.minRating : !titled) continue;

    const date = normaliseDate(tags.UTCDate ?? tags.Date ?? '');
    const year = Number(date.slice(0, 4)) || 0;
    if (year > maxYear) maxYear = year;

    /*
      A stable id derived from the game itself rather than a counter, so two
      runs of the build over the same archive produce the same pack, and so a
      game relayed into two broadcasts collapses to one row.
    */
    const id = gameId(white, black, date, moves);
    /*
      Two thresholds, because the two things a pack carries cost very
      different amounts. A game's contribution to the statistics is a handful
      of counters; carrying its full score is a few hundred bytes. Opening the
      statistics wide and the stored games narrow is what lets a pack small
      enough to ship still answer from a large population.
    */
    const openable =
      rated > 0
        ? rated >= limits.openRating
        : limits.openTitles.includes(whiteTitle) && limits.openTitles.includes(blackTitle);

    let position = Position.initial();
    let illegal = false;
    const depth = Math.min(moves.length, limits.maxPly);
    for (let ply = 0; ply < depth; ply += 1) {
      const key = positionKey(position.fen);
      const advanced = position.advanceSan(moves[ply]);
      if (!advanced.ok) {
        illegal = true;
        break;
      }
      const move = advanced.value.move;
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const rating = ply % 2 === 0 ? whiteElo : blackElo;
      explorer.write(
        shardOf(key, shards.explorer),
        `${key}\t${moves[ply]}\t${uci}\t${result}\t${rating}\t${year}\t${ply}\t` +
          `${openable ? id : ''}\t${openable ? rated : 0}`,
      );
      position = advanced.value.next;
    }
    if (illegal) {
      rejected += 1;
      continue;
    }

    kept += 1;
    if (openable) {
      opened += 1;
      games.write(
        shardOf(id, shards.game),
        [
          id,
          white,
          black,
          result,
          year,
          date,
          tags.BroadcastName ?? tags.Event ?? '',
          tags.ECO ?? '',
          tags.Opening ?? '',
          whiteElo,
          blackElo,
          tags.GameURL ?? tags.Site ?? '',
          moves.join(' '),
        ].join('\t'),
      );
    }

    for (const side of ['w', 'b']) {
      const name = side === 'w' ? white : black;
      const key = playerKey(name);
      if (!key) continue;
      const elo = side === 'w' ? whiteElo : blackElo;
      const fide = (side === 'w' ? tags.WhiteFideId : tags.BlackFideId) ?? '';
      const title = side === 'w' ? whiteTitle : blackTitle;
      players.write(
        shardOf(key, shards.players),
        `${key}\t${name}\t${fide}\t${title}\t${year}\t${elo}`,
      );
      if (openable) playerGames.write(shardOf(key, shards.playergames), `${key}\t${year}\t${id}`);
    }
  }

  explorer.close();
  games.close();
  players.close();
  playerGames.close();
  await closeApp();
  parentPort.postMessage({ file, seen, kept, opened, rejected, maxYear });
}

/** `YYYY.MM.DD`, whichever of the several shapes in the wild the tag used. */
function normaliseDate(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

/**
 * A content hash of the game, in the same alphabet everywhere.
 *
 * Deliberately includes the moves: two players meeting twice in one event on
 * the same day are two games, and only the moves tell them apart.
 */
function gameId(white, black, date, moves) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const text = `${white}|${black}|${date}|${moves.join(' ')}`;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return (a.toString(36) + b.toString(36).padStart(7, '0')).padStart(13, '0');
}

main().catch((error) => {
  parentPort.postMessage({ file, error: error instanceof Error ? error.stack : String(error) });
  process.exit(1);
});
