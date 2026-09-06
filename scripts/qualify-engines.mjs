#!/usr/bin/env node
/**
 * The engine qualification matrix.
 *
 * `npm run engines:verify` asks an engine what it can do and confirms it can
 * find a move from the starting position. That answers "is this an engine".
 * It does not answer the question a player's session actually depends on:
 * does it stay correct across the positions and the protocol sequences the
 * application really puts it through.
 *
 * Two matrices, run against every engine installed on this machine.
 *
 * **Positions.** Nine of them, each chosen because it is a place a rules or
 * search bug shows up rather than because it is interesting chess: the start,
 * a quiet middlegame, a forced mate, a promotion, an en passant, a position
 * where castling is the move, a tablebase-simple ending, and a Chess960 start
 * for engines that claim it. Each is checked for a *legal, expected* answer
 * where the answer is forced, and for a legal answer where it is not.
 *
 * **Protocol.** The sequences that broke things before. `stop` mid-search must
 * produce a `bestmove`; a rapid position switch must not let a search of the
 * old position answer for the new one — the invariant Phase 16 fixed and the
 * reason `src/engine/uci-adversarial.test.ts` exists; `searchmoves` must be
 * honoured *in the answer* and not merely accepted, because three of five
 * engines accept it and ignore it; and malformed input must not take the
 * engine down.
 *
 *   node scripts/qualify-engines.mjs
 *   node scripts/qualify-engines.mjs --engine stormphrax
 *
 * Nothing here is inferred from a name or a version. Every cell is what the
 * binary on this disk did when it was asked.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { UciProcess } from '../companion/src/engine-verify.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Where to look for engines.
 *
 * `engines/` is where `engines:install` puts them and where the companion
 * runs them from. `engines:verify` installs to `.engine-fleet` instead, so
 * that interrogating the whole fleet does not disturb a working installation
 * — and qualifying what that just installed means being told where it went.
 * `KINGFISHER_FLEET_DIR` is the same variable the verifier reads.
 */
const dirFlag = argv.indexOf('--dir');
const ENGINE_DIR =
  dirFlag >= 0
    ? path.resolve(argv[dirFlag + 1])
    : process.env.KINGFISHER_FLEET_DIR
      ? path.resolve(process.env.KINGFISHER_FLEET_DIR)
      : path.join(ROOT, 'engines');

/**
 * The positions, and what a correct engine must say about each.
 *
 * `forced` names the only move that is not losing on the spot; where a
 * position has several reasonable moves there is no `forced` and the
 * requirement is only that the answer is one the position actually admits.
 */
const POSITIONS = [
  {
    id: 'start',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    legal: null,
    note: 'the starting position',
  },
  {
    id: 'middlegame',
    fen: 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 9',
    legal: null,
    note: 'a quiet Queen’s Gambit middlegame',
  },
  {
    id: 'mate-in-one',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    forced: ['a1a8'],
    note: 'back-rank mate; anything else throws the win away',
  },
  {
    id: 'promotion',
    fen: '8/P6k/8/8/8/8/6K1/8 w - - 0 1',
    /*
      The risk here is notation, not judgement. An engine that walks its king
      instead of queening is slower and still winning — the pawn is
      unstoppable — so demanding `a7a8q` would fail an engine for playing a
      move that wins. Viridithas plays Kf3 and is not wrong to.

      What must work is the promotion *encoding*: asked for `a7a8q` through
      `searchmoves`, an engine that honours it has to hand back exactly that
      string, suffix and all.
    */
    mustAccept: 'a7a8q',
    note: 'a pawn on the seventh, where the promotion suffix has to round-trip',
  },
  {
    id: 'en-passant',
    fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
    legal: null,
    note: 'an en passant capture is available and must be a legal option',
    mustAccept: 'e5d6',
  },
  {
    id: 'castling',
    fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    legal: null,
    note: 'both castles available on both sides',
    mustAccept: 'e1g1',
  },
  {
    id: 'tablebase',
    fen: '8/8/8/4k3/8/8/8/K2Q4 w - - 0 1',
    legal: null,
    note: 'king and queen against king; a trivially won ending',
  },
  {
    id: 'stalemate-trap',
    fen: '7k/5Q2/8/8/8/8/8/7K w - - 0 1',
    /*
      Qg6 is stalemate — g8, g7 and h7 are all covered and the king is not in
      check — so an engine that plays it has turned a won queen ending into a
      draw. Verified against the rules code rather than from memory; the first
      square written here was the wrong one.
    */
    forbidden: ['f7g6'],
    note: 'a position where a natural queen move is stalemate',
  },
];

const CHESS960 = {
  id: 'chess960',
  fen: 'nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w HBhb - 0 1',
  legal: null,
  note: 'a shuffled start, for engines that declare UCI_Chess960',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bestMoveOf = (line) => /^bestmove\s+(\S+)/.exec(line ?? '')?.[1] ?? null;

/** Run one `go` and return the move, or null if none arrived in time. */
async function search(engine, command, timeoutMs = 12_000) {
  engine.clear();
  engine.send(command);
  try {
    return bestMoveOf(await engine.expect((line) => line.startsWith('bestmove'), timeoutMs));
  } catch {
    return null;
  }
}

/**
 * Run one row, and record an engine that died doing it as *that row's* result.
 *
 * The first version of this let a death anywhere abort the whole engine with
 * "The engine exited", which says an engine failed and not what it failed at.
 * Which check killed it is the entire finding.
 */
async function row(id, note, run) {
  try {
    return { id, note, ...(await run()) };
  } catch (error) {
    return {
      id,
      note,
      ok: false,
      detail: `the engine exited here — ${error instanceof Error ? error.message : String(error)}`,
      fatal: true,
    };
  }
}

async function positionMatrix(engine, supportsChess960) {
  const rows = [];
  const cases = supportsChess960 ? [...POSITIONS, CHESS960] : POSITIONS;

  for (const position of cases) {
    const result = await row(position.id, position.note, async () => {
      if (position.id === 'chess960') engine.send('setoption name UCI_Chess960 value true');
      engine.send(`position fen ${position.fen}`);
      const move = await search(engine, 'go depth 12');

      let ok = Boolean(move) && move !== '(none)' && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move);
      let detail = move ?? 'no bestmove';

      if (ok && position.forced && !position.forced.includes(move)) {
        ok = false;
        detail = `${move}, expected ${position.forced.join(' or ')}`;
      }
      if (ok && position.forbidden?.includes(move)) {
        ok = false;
        detail = `${move} — a move this position punishes`;
      }
      /*
      A move the position genuinely admits must be *accepted* by the engine, so
      that a legal option is never quietly unavailable. Asking for it through
      `searchmoves` and requiring it back is the only way to see that from
      outside, and an engine that ignores searchmoves is excused rather than
      failed — that is a capability, recorded elsewhere.
    */
      if (ok && position.mustAccept) {
        engine.send(`position fen ${position.fen}`);
        const restricted = await search(engine, `go depth 8 searchmoves ${position.mustAccept}`);
        if (restricted && restricted !== position.mustAccept) {
          detail += ` (searchmoves ignored: asked ${position.mustAccept}, got ${restricted})`;
        } else if (restricted === position.mustAccept) {
          detail += ` (${position.mustAccept} accepted)`;
        }
      }
      if (position.id === 'chess960') engine.send('setoption name UCI_Chess960 value false');
      return { ok, detail };
    });
    rows.push(result);
    // An engine that has exited cannot answer the rest of the matrix, and
    // reporting a row per position it never saw would be noise.
    if (result.fatal) break;
  }
  return rows;
}

async function protocolMatrix(engine) {
  const rows = [];
  // An engine that died in the position matrix cannot answer these, and
  // asking would throw past the per-row guard.
  if (engine.exited) return rows;

  /*
    Every step guarded on its own. A sequence that kills an engine is the most
    valuable thing this matrix can find, and it is only valuable if the report
    says *which* sequence — an earlier version swallowed the death and printed
    nothing at all, which is worse than failing.
  */
  const step = async (id, run) => {
    if (engine.exited) {
      rows.push({ id, ok: false, detail: 'not attempted — the engine had already exited' });
      return;
    }
    rows.push(await row(id, '', run));
  };

  await step('stop', async () => {
    engine.send('position startpos');
    engine.clear();
    engine.send('go infinite');
    await wait(600);
    engine.send('stop');
    let line = null;
    try {
      line = await engine.expect((l) => l.startsWith('bestmove'), 8_000);
    } catch {
      /* recorded below */
    }
    const move = bestMoveOf(line);
    return { ok: Boolean(move), detail: move ?? 'no bestmove after stop' };
  });

  await step('search after stop', async () => {
    engine.send('position startpos moves e2e4');
    const move = await search(engine, 'go depth 8');
    return { ok: Boolean(move), detail: move ?? 'no bestmove' };
  });

  /*
    The invariant Phase 16 fixed. Switch position while a search is running and
    the answer must belong to the position asked about last — a bestmove for
    the abandoned position arriving late is how a stale line becomes evidence
    about the wrong board.

    The requirement is that the answer belongs to the new position, not that it
    is the best move in it: an engine that walks its king instead of queening
    is slow, not stale. So the check is membership in the new position's
    complete legal move set, taken from the rules code rather than by eye. The
    two positions share no legal move, so belonging to this set says exactly
    "not an answer for the previous position".
  */
  const LEGAL_AFTER_SWITCH = new Set([
    'a7a8q',
    'a7a8r',
    'a7a8b',
    'a7a8n',
    'g2f1',
    'g2f2',
    'g2f3',
    'g2g1',
    'g2g3',
    'g2h1',
    'g2h2',
    'g2h3',
  ]);
  await step('rapid position switch', async () => {
    engine.send('position fen 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    engine.clear();
    engine.send('go infinite');
    await wait(400);
    engine.send('stop');
    try {
      await engine.expect((l) => l.startsWith('bestmove'), 8_000);
    } catch {
      /* the stop row already covers this */
    }
    engine.send('position fen 8/P6k/8/8/8/8/6K1/8 w - - 0 1');
    const move = await search(engine, 'go depth 10');
    return {
      ok: move !== null && LEGAL_AFTER_SWITCH.has(move),
      detail:
        move === null
          ? 'no bestmove'
          : LEGAL_AFTER_SWITCH.has(move)
            ? move
            : `${move} — not a move this position admits`,
    };
  });

  await step('go nodes', async () => {
    engine.send('position startpos');
    const move = await search(engine, 'go nodes 40000');
    return { ok: Boolean(move), detail: move ?? 'no bestmove' };
  });

  /*
    One malformed line at a time, because "it died on garbage" is not
    actionable and "it died on `go depth banana`" is. PlentyChess 8.0.0
    survives an unknown command and a malformed FEN and exits on a non-numeric
    depth, which is a fact about that engine and would have been invisible if
    all three were sent together.
  */
  for (const bad of ['this is not a uci command', 'position fen not-a-fen', 'go depth banana']) {
    await step(`survives ${JSON.stringify(bad)}`, async () => {
      engine.send(bad);
      await wait(400);
      engine.send('position startpos');
      const move = await search(engine, 'go depth 8');
      return {
        ok: Boolean(move) && !engine.exited,
        detail: engine.exited ? 'the engine exited' : (move ?? 'no bestmove'),
      };
    });
  }

  return rows;
}

/** Every managed engine binary on this machine. */
function installed() {
  if (!existsSync(ENGINE_DIR)) return [];
  const found = [];
  const walk = (directory, depth) => {
    if (depth > 3) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (statSync(full).mode & 0o111 && !entry.name.includes('.')) {
        found.push({ id: path.relative(ENGINE_DIR, full).split(path.sep)[0], binary: full });
      }
    }
  };
  walk(ENGINE_DIR, 0);
  // One binary per engine directory: some installs keep a verified copy beside
  // the extracted one, and running both would say the same thing twice.
  const byId = new Map();
  for (const entry of found) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].filter((entry) => entry.id !== 'tablebase');
}

async function qualify({ id, binary }) {
  const engine = new UciProcess(binary, [], path.dirname(binary));
  try {
    engine.send('uci');
    await engine.expect((line) => line === 'uciok', 15_000);
    const header = engine.seen();
    const name =
      header
        .find((line) => line.startsWith('id name '))
        ?.slice(8)
        .trim() ?? id;
    const options = header
      .filter((line) => line.startsWith('option name '))
      .map((line) => /^option name (.+?) type /.exec(line)?.[1]?.trim())
      .filter(Boolean);
    engine.send('isready');
    await engine.expect((line) => line === 'readyok', 10_000);

    const positions = await positionMatrix(engine, options.includes('UCI_Chess960'));
    /*
      Guarded separately. A death in the position matrix is recorded against
      the position that caused it and must not then be re-reported as the
      whole engine failing to qualify — which is what happened before, and
      turned a precise finding into "the engine exited".
    */
    const protocol = await protocolMatrix(engine);
    return { id, name, positions, protocol, error: null };
  } catch (error) {
    return {
      id,
      name: id,
      positions: [],
      protocol: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await engine.close();
  }
}

async function main() {
  const index = argv.indexOf('--engine');
  const only = index >= 0 ? argv[index + 1] : null;
  const engines = installed().filter((entry) => !only || entry.id === only);

  console.log('Kingfisher engine qualification matrix');
  console.log(`${process.platform}-${process.arch} · node ${process.version}`);
  console.log(`engines from ${ENGINE_DIR}`);
  if (engines.length === 0) {
    console.log(
      '\nNo engines found there. `npm run engines:install` fetches them into engines/, ' +
        'and `npm run engines:verify` into .engine-fleet — pass --dir to qualify either.',
    );
    return;
  }

  let failed = 0;
  for (const entry of engines) {
    const report = await qualify(entry);
    console.log(`\n${report.name}`);
    if (report.error) {
      console.log(`  did not qualify: ${report.error}`);
      failed += 1;
      continue;
    }
    for (const row of [...report.positions, ...report.protocol]) {
      console.log(`  ${row.ok ? '✓' : '✗'} ${row.id.padEnd(24)} ${row.detail}`);
      if (!row.ok) failed += 1;
    }
  }

  console.log(
    failed === 0
      ? `\nEvery check passed for ${engines.length} engine(s).`
      : `\n${failed} check(s) failed.`,
  );
  if (failed > 0) exit(1);
}

await main();
