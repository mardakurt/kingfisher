/** A bounded, source-specific survey of recorded practice, never a repertoire recommendation. */
import { positionKey } from '@/chess/fen';
import { playUciAt } from '@/chess/game';
import { Position } from '@/chess/position';
import { serializePgn } from '@/chess/pgn/serialize';
import { createTree, setComment } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type { ExplorerResult } from '@/database/types';

export interface OpeningSurvey {
  readonly tree: GameTree;
  readonly source: { readonly id: string; readonly name: string };
  readonly generatedAt: string;
  readonly queries: number;
  readonly positions: number;
  readonly cuts: number;
  readonly depth: number;
  readonly width: number;
  readonly stopped: 'complete' | 'query-limit' | 'cancelled';
}

export async function buildOpeningSurvey(input: {
  readonly fen: Fen;
  readonly source: { readonly id: string; readonly name: string };
  readonly explore: (fen: Fen, signal?: AbortSignal) => Promise<ExplorerResult>;
  readonly depth: number;
  readonly width: number;
  readonly maxQueries?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (queries: number) => void;
}): Promise<OpeningSurvey> {
  const generatedAt = new Date().toISOString();
  const maxQueries = input.maxQueries ?? 40;
  if (
    !Number.isInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > 8 ||
    !Number.isInteger(input.width) ||
    input.width < 1 ||
    input.width > 5 ||
    !Number.isInteger(maxQueries) ||
    maxQueries < 1 ||
    maxQueries > 100
  ) {
    throw new Error('Survey limits must be depth 1–8, branches 1–5 and queries 1–100.');
  }
  const validated = Position.fromFen(input.fen);
  if (!validated.ok) throw new Error(validated.error.message);
  let tree = createTree(input.fen, {
    Event: 'Opening survey',
    Site: input.source.name,
    Result: '*',
    SetUp: '1',
    FEN: input.fen,
  });
  const queue: { id: NodeId; depth: number; ancestors: ReadonlySet<string> }[] = [
    { id: tree.rootId, depth: 0, ancestors: new Set([positionKey(input.fen)]) },
  ];
  const cache = new Map<string, ExplorerResult>();
  let queries = 0;
  let cuts = 0;
  let stopped: OpeningSurvey['stopped'] = 'complete';
  for (let index = 0; index < queue.length; index += 1) {
    if (input.signal?.aborted) {
      stopped = 'cancelled';
      break;
    }
    const current = queue[index]!;
    const fen = tree.nodes[current.id]!.fen;
    const key = positionKey(fen);
    let result = cache.get(key);
    if (!result) {
      if (queries >= maxQueries) {
        stopped = 'query-limit';
        break;
      }
      try {
        result = await input.explore(fen, input.signal);
      } catch (error) {
        if (input.signal?.aborted) {
          stopped = 'cancelled';
          break;
        }
        throw error;
      }
      if (input.signal?.aborted) {
        stopped = 'cancelled';
        break;
      }
      if (positionKey(result.fen) !== key || result.source.id !== input.source.id) {
        throw new Error('The source returned evidence for a different position or population.');
      }
      if (!Number.isSafeInteger(result.totalGames) || result.totalGames < 0) {
        throw new Error('The source returned an invalid game count.');
      }
      cache.set(key, result);
      queries += 1;
      input.onProgress?.(queries);
    }
    const seen = new Set<string>();
    const moves = result.moves
      .filter((move) => {
        if (!Number.isSafeInteger(move.games) || move.games < 0 || move.games > result.totalGames) {
          throw new Error('The source returned an invalid move count.');
        }
        if (move.games === 0 || seen.has(move.uci)) return false;
        seen.add(move.uci);
        return true;
      })
      .sort((a, b) => b.games - a.games || a.uci.localeCompare(b.uci));
    const cut = result.truncated === true || moves.length > input.width;
    if (cut) cuts += 1;
    const note = `${input.source.name}: ${result.totalGames} games at this position.${cut ? ' Move list bounded; omitted moves are not absent from the source.' : ''}`;
    tree = setComment(
      tree,
      current.id,
      [tree.nodes[current.id]!.comment, note].filter(Boolean).join(' '),
    );
    for (const move of moves.slice(0, input.width)) {
      const played = playUciAt(tree, current.id, move.uci);
      if (!played.ok) throw new Error(`The source returned an illegal move: ${move.uci}.`);
      tree = played.value.tree;
      const id = played.value.nodeId;
      tree = setComment(
        tree,
        id,
        `${input.source.name}: ${move.games} of ${result.totalGames} games. Most played here does not mean best.`,
      );
      const nextKey = positionKey(tree.nodes[id]!.fen);
      if (current.ancestors.has(nextKey)) {
        tree = setComment(
          tree,
          id,
          `${tree.nodes[id]!.comment} Repeated position; continuation stopped.`,
        );
      } else if (current.depth + 1 < input.depth) {
        queue.push({
          id,
          depth: current.depth + 1,
          ancestors: new Set([...current.ancestors, nextKey]),
        });
      }
    }
  }
  tree = setComment(
    tree,
    tree.rootId,
    [
      `Snapshot ${generatedAt}. Recorded practice from ${input.source.name} (${input.source.id}), using source defaults. Depth limit ${input.depth} plies; at most ${input.width} moves per position; ${queries} source queries. Status: ${stopped}. Leaves may stop at a limit, not at the end of theory. Per-position counts do not prove an entire path occurred in one game. No engine evaluation or repertoire recommendation.`,
      tree.nodes[tree.rootId]!.comment,
    ]
      .filter(Boolean)
      .join(' '),
  );
  return {
    tree,
    source: input.source,
    generatedAt,
    queries,
    positions: cache.size,
    cuts,
    depth: input.depth,
    width: input.width,
    stopped,
  };
}

export function openingSurveyPgn(survey: OpeningSurvey): string {
  return serializePgn(survey.tree);
}
