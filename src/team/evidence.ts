/**
 * What the engine actually did for a handover.
 *
 * Derived from the tree at the moment of the handover and stored beside the
 * PGN, because PGN carries a score (`[%eval]`) and nothing about who produced
 * it. A coach reading "14 of 31 positions evaluated · Stockfish 17.1, depth
 * 18–26" knows what the numbers in the file are worth; a coach reading bare
 * scores does not. Nothing here is estimated: a position without a stored
 * evaluation counts as unevaluated, whatever was on the engine panel.
 */

import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { plural } from '@/lib/plural';
import type { HandoverEvidence } from '@/persistence/domain';

const UNNAMED = 'Engine';

export function handoverEvidence(tree: GameTree): HandoverEvidence {
  const byEngine = new Map<string, { positions: number; minDepth: number; maxDepth: number }>();
  let positions = 0;
  let evaluated = 0;
  let variations = 0;
  let comments = 0;
  for (const node of Object.values(tree.nodes)) {
    positions += 1;
    // Every child past the first is the head of a side variation.
    variations += Math.max(0, node.children.length - 1);
    if (node.comment) comments += 1;
    if (node.preComment) comments += 1;
    const evaluation = node.evaluation;
    if (!evaluation) continue;
    evaluated += 1;
    const name = evaluation.engine?.trim() || UNNAMED;
    const depth = evaluation.depth ?? 0;
    const entry = byEngine.get(name);
    if (entry) {
      entry.positions += 1;
      entry.minDepth = Math.min(entry.minDepth, depth);
      entry.maxDepth = Math.max(entry.maxDepth, depth);
    } else {
      byEngine.set(name, { positions: 1, minDepth: depth, maxDepth: depth });
    }
  }
  return {
    positions,
    evaluated,
    moves: mainlinePath(tree).length - 1,
    variations,
    comments,
    engines: [...byEngine]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => b.positions - a.positions || a.name.localeCompare(b.name)),
  };
}

/** One line for a card: what was evaluated, by what, how deep. */
export function describeEvidence(evidence: HandoverEvidence | undefined): string {
  if (!evidence || evidence.positions === 0) return 'No positions.';
  const work: string[] = [];
  if (evidence.moves !== undefined) work.push(plural(evidence.moves, 'move'));
  if (evidence.variations) work.push(plural(evidence.variations, 'variation'));
  if (evidence.comments) work.push(plural(evidence.comments, 'comment'));
  const lead = work.length > 0 ? `${work.join(' · ')} · ` : '';
  if (evidence.evaluated === 0) {
    return `${lead}${evidence.positions} positions · no engine evaluations recorded.`;
  }
  const engines = evidence.engines
    .map((engine) =>
      engine.minDepth === engine.maxDepth
        ? `${engine.name}, depth ${engine.maxDepth}`
        : `${engine.name}, depth ${engine.minDepth}–${engine.maxDepth}`,
    )
    .join('; ');
  return `${lead}${evidence.evaluated} of ${evidence.positions} positions evaluated · ${engines}.`;
}
