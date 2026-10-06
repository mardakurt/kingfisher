/** Authored decisions only. Classification is supplied by the caller's licensed index. */
import { positionKey } from '@/chess/fen';
import type { RepertoireWithPositions } from '@/persistence/domain';

export interface RepertoireOpeningSummary {
  readonly name: string;
  readonly positions: number;
  readonly moves: number;
  readonly positionId: string;
}

export function repertoireOverview(
  record: RepertoireWithPositions,
  classify: (key: string) => string | null,
): readonly RepertoireOpeningSummary[] {
  const groups = new Map<string, { keys: Set<string>; moves: number; positionId: string }>();
  const seen = new Set<string>();
  for (const position of record.positions) {
    const key = positionKey(position.fen);
    if (seen.has(key)) continue;
    seen.add(key);
    if (position.sideToMove !== record.repertoire.color) continue;
    const intended = position.moves.filter(
      (move) => !move.expected && (move.role === 'main' || move.role === 'alternative'),
    );
    if (!intended.length) continue;
    const name = classify(key) ?? 'Unclassified positions';
    const group = groups.get(name) ?? {
      keys: new Set<string>(),
      moves: 0,
      positionId: position.id,
    };
    group.keys.add(key);
    group.moves += new Set(intended.map((move) => move.uci)).size;
    groups.set(name, group);
  }
  return [...groups]
    .map(([name, group]) => ({
      name,
      positions: group.keys.size,
      moves: group.moves,
      positionId: group.positionId,
    }))
    .sort((a, b) => b.positions - a.positions || a.name.localeCompare(b.name));
}
