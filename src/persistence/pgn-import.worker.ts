/// <reference lib="webworker" />

import { createPgnParser } from '@/chess/pgn';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { classifyTree } from '@/theory/classify-games';
import { loadOpeningIndex, type OpeningIndex } from '@/theory/openings';

import type {
  PgnWorkerMessage,
  PgnWorkerRequest,
  PreparedLocalGame,
  PreparedSqliteGame,
} from './pgn-import-protocol';

const acknowledgements = new Map<number, () => void>();

self.onmessage = (event: MessageEvent<PgnWorkerRequest>) => {
  if (event.data.type === 'ack') {
    acknowledgements.get(event.data.batchId)?.();
    acknowledgements.delete(event.data.batchId);
    return;
  }
  void run(event.data).catch((error: unknown) => {
    post({
      type: 'error',
      error: error instanceof Error ? error.message : 'The PGN worker failed.',
    });
  });
};

async function run(request: Extract<PgnWorkerRequest, { type: 'start' }>) {
  post({ type: 'progress', parsed: 0, issues: 0 });
  /*
    Classified here, once, during the pass that already has the tree in hand.
    The alternative — importing and then running a backfill over what was just
    imported — reads every game twice for an answer the first read could have
    produced. A failure to load the index is not a failure to import: the games
    land unclassified and the backfill finds them, which is exactly the state a
    collection imported before Phase 12 is in.
  */
  let openings: OpeningIndex | null = null;
  try {
    openings = await loadOpeningIndex();
  } catch {
    openings = null;
  }
  const source = typeof request.source === 'string' ? request.source : await request.source.text();
  const parser = createPgnParser(source);
  const batchSize = Math.max(1, request.batchSize);
  let parsed = 0;
  let issues = 0;
  let batchId = 0;
  let batch: PreparedLocalGame[] | PreparedSqliteGame[] = [];

  while (!parser.done) {
    const parsedGame = parser.next();
    if (!parsedGame) continue;
    const prepared = normalizeGame(parsedGame.tree);
    const game = openings ? { ...prepared, ...classifyTree(openings, prepared.tree) } : prepared;
    const positions = indexGame(game);
    parsed += 1;
    issues += parsedGame.issues.length;

    if (request.target === 'local') {
      (batch as PreparedLocalGame[]).push({ game, positions });
    } else {
      (batch as PreparedSqliteGame[]).push({
        game: {
          fingerprint: game.fingerprint,
          white: game.white,
          black: game.black,
          whiteKey: game.whiteKey,
          blackKey: game.blackKey,
          result: game.result,
          ...(game.date ? { date: game.date } : {}),
          ...(game.year ? { year: game.year } : {}),
          ...(game.event ? { event: game.event } : {}),
          ...(game.site ? { site: game.site } : {}),
          ...(game.round ? { round: game.round } : {}),
          ...(game.whiteRating ? { whiteRating: game.whiteRating } : {}),
          ...(game.blackRating ? { blackRating: game.blackRating } : {}),
          ...(game.eco ? { eco: game.eco } : {}),
          ...(game.opening ? { opening: game.opening } : {}),
          ...(game.classification ? { classification: game.classification } : {}),
          ...(game.classifiedWith ? { classifiedWith: game.classifiedWith } : {}),
          plyCount: positions.length,
          importedAt: game.importedAt,
        },
        pgn: game.normalizedPgn,
        positions: positions.map((position) => ({
          positionKey: position.positionKey,
          ply: position.ply,
          moveUci: position.moveUci,
          moveSan: position.moveSan,
          mover: position.mover,
          fen: position.fen,
          nodeId: position.nodeId,
          pawnSkeleton: position.pawnSkeleton,
          structureSignature: position.structureSignature,
          structureClaims: position.structureClaims,
        })),
      });
    }

    if (batch.length >= batchSize) {
      const id = ++batchId;
      post({ type: 'batch', batchId: id, parsed, issues, batch });
      batch = [];
      await acknowledged(id);
    } else if (parsed % 25 === 0) {
      post({ type: 'progress', parsed, issues });
    }
  }

  if (batch.length > 0) {
    const id = ++batchId;
    post({ type: 'batch', batchId: id, parsed, issues, batch });
    await acknowledged(id);
  }
  post({ type: 'done', total: parsed, issues: issues + parser.issues.length });
}

function acknowledged(batchId: number): Promise<void> {
  return new Promise((resolve) => acknowledgements.set(batchId, resolve));
}

function post(message: PgnWorkerMessage): void {
  self.postMessage(message);
}

export {};
