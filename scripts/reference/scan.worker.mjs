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

const { file, label, outDir, shards, limits } = workerData;

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
  const accepted = shardWriter('accepted', shards.game);

  let seen = 0;
  let kept = 0;
  let opened = 0;
  let rejected = 0;
  let maxYear = 0;

  /*
    Rejected before the movetext is tokenised, not after.

    The broadcast archives are small enough that it makes no difference. The
    standard database is ninety million games a month and a high-rated pack
    keeps roughly one in two hundred and fifty, so tokenising every game would
    spend almost the whole build tearing apart movetext nothing will read.
    Speed and rating are both in the headers, which is what makes this possible.
  */
  const speeds = Array.isArray(limits.speeds) && limits.speeds.length > 0 ? limits.speeds : null;
  /*
    Counted here rather than in the loop below, because the loop no longer sees
    the games this predicate turns away. Without it a build over ninety million
    games reported that it had scanned a few hundred, which read as a broken
    stream and was in fact a broken counter.
  */
  let examined = 0;
  const accept = speeds
    ? (tags) => {
        examined += 1;
        const event = `${tags.Event ?? ''}`.toLowerCase();
        // Lichess names the speed in the Event tag: "Rated Blitz game".
        // Checked longest-first so "ultrabullet" is never read as "bullet".
        const speed = [
          'ultrabullet',
          'bullet',
          'blitz',
          'rapid',
          'classical',
          'correspondence',
        ].find((name) => event.includes(name));
        if (!speed || !speeds.includes(speed)) return false;
        const white = Number(tags.WhiteElo) || 0;
        const black = Number(tags.BlackElo) || 0;
        if (white === 0 || black === 0) return false;
        return Math.min(white, black) >= limits.minRating;
      }
    : undefined;

  for await (const { tags, moves } of readGames(file, accept ? { accept } : {})) {
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

    // Rating bounds alone cannot prove human or over-the-board provenance.
    // Also exclude explicitly marked bots and engine/online broadcasts.
    if (stated.some((elo) => elo > limits.maxRating)) continue;
    if (whiteTitle === 'BOT' || blackTitle === 'BOT') continue;
    if (
      limits.excludeOnline &&
      /\b(tcec|computer|engine|online|lichess|chess\.com|bullet|titled tuesday)\b/i.test(
        `${tags.BroadcastName ?? ''} ${tags.Event ?? ''}`,
      )
    )
      continue;

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
    /*
      A relay occasionally carries a typo for a date, and one row reading 2308
      is enough to move the whole pack's "recent" window past every game in it.
      A year outside the range chess has been recorded in is treated as no year
      rather than as a fact.
    */
    const parsed = Number(date.slice(0, 4)) || 0;
    const year = parsed >= 1475 && parsed <= limits.thisYear ? parsed : 0;
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
    const positions = [];
    const visited = new Set();
    const canonicalMoves = [];
    // Full scores are checked to the end, even when only the first 41 plies
    // contribute to Explorer. Nothing is emitted from an illegal game.
    for (let ply = 0; ply < moves.length; ply += 1) {
      const key = positionKey(position.fen);
      const advanced = position.advanceSan(moves[ply]);
      if (!advanced.ok) {
        illegal = true;
        break;
      }
      const move = advanced.value.move;
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const rating = ply % 2 === 0 ? whiteElo : blackElo;
      canonicalMoves.push(move.san);
      if (ply < limits.maxPly && !visited.has(key)) {
        positions.push([
          shardOf(key, shards.explorer),
          `${key}\t${move.san}\t${uci}\t${result}\t${rating}\t${year}\t${ply}\t${id}\t${rated}\t${openable ? 1 : 0}`,
        ]);
        visited.add(key);
      }
      position = advanced.value.next;
    }
    if (illegal) {
      rejected += 1;
      continue;
    }

    kept += 1;
    accepted.write(shardOf(id, shards.game), id);
    for (const [shard, row] of positions) explorer.write(shard, row);
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
          canonicalMoves.join(' '),
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
        `${key}\t${name}\t${fide}\t${title}\t${year}\t${elo}\t${id}`,
      );
      if (openable) playerGames.write(shardOf(key, shards.playergames), `${key}\t${year}\t${id}`);
    }
  }

  explorer.close();
  games.close();
  players.close();
  playerGames.close();
  accepted.close();
  await closeApp();
  parentPort.postMessage({
    file: label ?? String(file),
    // What the archive held, not what survived the headers.
    seen: Math.max(seen, examined),
    kept,
    opened,
    rejected,
    maxYear,
  });
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
  parentPort.postMessage({
    file: label ?? String(file),
    error: error instanceof Error ? error.stack : String(error),
  });
  process.exit(1);
});
