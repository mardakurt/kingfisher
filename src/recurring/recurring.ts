/**
 * Recurring facts for Review → Improvement.
 *
 * Pure: all storage reads happen in the feature query. This module joins
 * canonical positions, stored engine evidence, deterministic pawn skeletons,
 * player-authored endgame categories and repertoire positions. It returns
 * counts and the games behind them; it never classifies a player or a move.
 */

import { formatScore, scoreToCentipawns } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { describePawnSkeleton } from '@/chess/structure';
import { mainlinePath } from '@/chess/tree/tree';
import type {
  EndgameCategory,
  EndgamePositionRecord,
  RepertoirePositionRecord,
  RepertoireRecord,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';
import type { GameRecord, PositionRecord } from '@/persistence/types';
import { nameKey } from '@/round/identity';

export const DEFAULT_ENGINE_LOSS_CP = 100;
export const MIN_STRUCTURE_GAMES = 5;

export interface RecurringGameFact {
  readonly gameId: string;
  readonly label: string;
  readonly result: string;
  readonly outcome: 'win' | 'loss' | 'draw';
  readonly playedAs: 'w' | 'b';
  readonly ply: number;
}

interface RecordFact {
  readonly games: readonly RecurringGameFact[];
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** FIDE score percentage: win 1, draw 0.5, loss 0. */
  readonly scorePercent: number;
}

export interface EngineFlagOccurrence extends RecurringGameFact {
  readonly nodeId: string;
  readonly moveSan: string;
  readonly before: string;
  readonly after: string;
  readonly lossCp: number;
  readonly engineName: string;
  readonly beforeDepth: number;
  readonly afterDepth: number;
}

export interface EngineFlagRow extends RecordFact {
  readonly positionKey: string;
  readonly fen: string;
  readonly occurrences: readonly EngineFlagOccurrence[];
}

export interface StructureLossRow extends RecordFact {
  readonly pawnSkeleton: string;
  readonly description: string;
  readonly fen: string;
}

export interface EndgameLossRow extends RecordFact {
  readonly category: EndgameCategory;
  readonly distinctPositions: number;
}

export interface RepertoireLossRow extends RecordFact {
  readonly positionKey: string;
  readonly fen: string;
  readonly repertoireTitles: readonly string[];
}

export interface RecurringReport {
  readonly engine: readonly EngineFlagRow[];
  readonly structures: readonly StructureLossRow[];
  readonly endgames: readonly EndgameLossRow[];
  readonly repertoire: readonly RepertoireLossRow[];
  readonly factCount: number;
}

export interface RecurringInput {
  readonly games: readonly GameRecord[];
  readonly aliases: readonly string[];
  readonly evidence: readonly StoredEngineEvidenceRecord[];
  readonly positions: readonly PositionRecord[];
  readonly endgames: readonly EndgamePositionRecord[];
  readonly repertoires: readonly RepertoireRecord[];
  readonly repertoirePositions: readonly RepertoirePositionRecord[];
  readonly engineLossCp?: number;
}

interface SelectedGame {
  readonly game: GameRecord;
  readonly color: 'w' | 'b';
  readonly fact: Omit<RecurringGameFact, 'ply'>;
}

interface EnginePair {
  readonly before: StoredEngineEvidenceRecord;
  readonly after: StoredEngineEvidenceRecord;
}

export function buildRecurringReport(input: RecurringInput): RecurringReport {
  const selected = selectedGames(input.games, input.aliases);
  const byGame = new Map(selected.map((entry) => [entry.game.id, entry]));
  const positions = input.positions.filter((record) => byGame.has(record.gameId));
  const engineLossCp = Math.max(0, input.engineLossCp ?? DEFAULT_ENGINE_LOSS_CP);

  const engine = engineRows(selected, input.evidence, engineLossCp);
  const structures = structureRows(positions, byGame);
  const endgames = endgameRows(positions, input.endgames, byGame);
  const repertoire = repertoireRows(
    positions,
    input.repertoires,
    input.repertoirePositions,
    byGame,
  );

  return {
    engine,
    structures,
    endgames,
    repertoire,
    factCount: engine.length + structures.length + endgames.length + repertoire.length,
  };
}

function selectedGames(
  games: readonly GameRecord[],
  aliases: readonly string[],
): readonly SelectedGame[] {
  const keys = new Set(aliases.map(nameKey).filter(Boolean));
  if (keys.size === 0) return [];
  const selected: SelectedGame[] = [];
  for (const game of games) {
    const color = keys.has(nameKey(game.white)) ? 'w' : keys.has(nameKey(game.black)) ? 'b' : null;
    if (!color) continue;
    const outcome = outcomeOf(game.result, color);
    if (!outcome) continue;
    selected.push({
      game,
      color,
      fact: {
        gameId: game.id,
        label: `${game.white} – ${game.black}`,
        result: game.result,
        outcome,
        playedAs: color,
      },
    });
  }
  return selected;
}

function outcomeOf(result: string, color: 'w' | 'b'): 'win' | 'loss' | 'draw' | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return null;
}

function engineRows(
  selected: readonly SelectedGame[],
  evidence: readonly StoredEngineEvidenceRecord[],
  thresholdCp: number,
): readonly EngineFlagRow[] {
  const evidenceByGameNode = new Map<string, StoredEngineEvidenceRecord[]>();
  for (const record of evidence) {
    const key = `${record.gameId}|${record.nodeId}`;
    const rows = evidenceByGameNode.get(key) ?? [];
    rows.push(record);
    evidenceByGameNode.set(key, rows);
  }

  const grouped = new Map<
    string,
    { fen: string; occurrences: Map<string, EngineFlagOccurrence> }
  >();
  for (const entry of selected) {
    const path = mainlinePath(entry.game.tree);
    for (let index = 0; index + 1 < path.length; index += 1) {
      const node = entry.game.tree.nodes[path[index]!];
      const child = entry.game.tree.nodes[path[index + 1]!];
      if (!node || !child?.move || sideToMove(node.fen) !== entry.color) continue;
      const pair = latestComparablePair(
        evidenceByGameNode.get(`${entry.game.id}|${node.id}`) ?? [],
        evidenceByGameNode.get(`${entry.game.id}|${child.id}`) ?? [],
      );
      if (!pair) continue;
      const beforeCp = scoreToCentipawns(pair.before.score, 100_000);
      const afterCp = scoreToCentipawns(pair.after.score, 100_000);
      const lossCp = entry.color === 'w' ? beforeCp - afterCp : afterCp - beforeCp;
      if (lossCp < thresholdCp) continue;
      const key = positionKey(node.fen);
      const occurrence: EngineFlagOccurrence = {
        ...entry.fact,
        ply: child.ply,
        nodeId: node.id,
        moveSan: child.move.san,
        before: formatScore(pair.before.score),
        after: formatScore(pair.after.score),
        lossCp,
        engineName: pair.before.engineName,
        beforeDepth: pair.before.depth,
        afterDepth: pair.after.depth,
      };
      const bucket = grouped.get(key) ?? { fen: node.fen, occurrences: new Map() };
      const existing = bucket.occurrences.get(entry.game.id);
      if (!existing || occurrence.lossCp > existing.lossCp) {
        bucket.occurrences.set(entry.game.id, occurrence);
      }
      grouped.set(key, bucket);
    }
  }

  return [...grouped.entries()]
    .map(([key, bucket]) => {
      const occurrences = [...bucket.occurrences.values()].sort((a, b) => b.lossCp - a.lossCp);
      return {
        positionKey: key,
        fen: bucket.fen,
        occurrences,
        ...recordFact(occurrences),
      };
    })
    .sort(
      (a, b) =>
        b.games.length - a.games.length || b.occurrences[0]!.lossCp - a.occurrences[0]!.lossCp,
    );
}

function latestComparablePair(
  before: readonly StoredEngineEvidenceRecord[],
  after: readonly StoredEngineEvidenceRecord[],
): EnginePair | null {
  let found: EnginePair | null = null;
  for (const first of before) {
    for (const second of after) {
      if (first.jobId !== second.jobId || first.engineId !== second.engineId) continue;
      if (
        !found ||
        Math.min(first.analysedAt, second.analysedAt) >
          Math.min(found.before.analysedAt, found.after.analysedAt)
      ) {
        found = { before: first, after: second };
      }
    }
  }
  return found;
}

function structureRows(
  positions: readonly PositionRecord[],
  games: ReadonlyMap<string, SelectedGame>,
): readonly StructureLossRow[] {
  const grouped = new Map<string, Map<string, RecurringGameFact>>();
  const fenBySkeleton = new Map<string, string>();
  for (const position of positions) {
    if (!position.pawnSkeleton || !position.fen) continue;
    const game = games.get(position.gameId);
    if (!game) continue;
    const bucket = grouped.get(position.pawnSkeleton) ?? new Map();
    keepEarliest(bucket, { ...game.fact, ply: position.ply });
    grouped.set(position.pawnSkeleton, bucket);
    if (!fenBySkeleton.has(position.pawnSkeleton)) {
      fenBySkeleton.set(position.pawnSkeleton, position.fen);
    }
  }
  return [...grouped.entries()]
    .map(([pawnSkeleton, facts]) => ({
      pawnSkeleton,
      description: describePawnSkeleton(pawnSkeleton),
      fen: fenBySkeleton.get(pawnSkeleton)!,
      ...recordFact([...facts.values()]),
    }))
    .filter((row) => row.games.length >= MIN_STRUCTURE_GAMES && row.scorePercent < 50)
    .sort((a, b) => a.scorePercent - b.scorePercent || b.games.length - a.games.length);
}

function endgameRows(
  positions: readonly PositionRecord[],
  endgames: readonly EndgamePositionRecord[],
  games: ReadonlyMap<string, SelectedGame>,
): readonly EndgameLossRow[] {
  const categoriesByKey = new Map<string, Set<EndgameCategory>>();
  for (const endgame of endgames) {
    const categories = categoriesByKey.get(endgame.positionKey) ?? new Set();
    categories.add(endgame.category);
    categoriesByKey.set(endgame.positionKey, categories);
  }
  const grouped = new Map<
    EndgameCategory,
    { games: Map<string, RecurringGameFact>; positions: Set<string> }
  >();
  for (const position of positions) {
    const game = games.get(position.gameId);
    if (!game) continue;
    for (const category of categoriesByKey.get(position.positionKey) ?? []) {
      const bucket = grouped.get(category) ?? { games: new Map(), positions: new Set() };
      keepEarliest(bucket.games, { ...game.fact, ply: position.ply });
      bucket.positions.add(position.positionKey);
      grouped.set(category, bucket);
    }
  }
  return [...grouped.entries()]
    .map(([category, bucket]) => ({
      category,
      distinctPositions: bucket.positions.size,
      ...recordFact([...bucket.games.values()]),
    }))
    .filter((row) => row.games.length > 0 && row.scorePercent < 50)
    .sort((a, b) => a.scorePercent - b.scorePercent || b.games.length - a.games.length);
}

function repertoireRows(
  positions: readonly PositionRecord[],
  repertoires: readonly RepertoireRecord[],
  repertoirePositions: readonly RepertoirePositionRecord[],
  games: ReadonlyMap<string, SelectedGame>,
): readonly RepertoireLossRow[] {
  const repertoireById = new Map(repertoires.map((record) => [record.id, record]));
  const positionsByKey = new Map<string, PositionRecord[]>();
  for (const position of positions) {
    const rows = positionsByKey.get(position.positionKey) ?? [];
    rows.push(position);
    positionsByKey.set(position.positionKey, rows);
  }
  const grouped = new Map<
    string,
    { fen: string; titles: Set<string>; games: Map<string, RecurringGameFact> }
  >();
  for (const repertoirePosition of repertoirePositions) {
    const repertoire = repertoireById.get(repertoirePosition.repertoireId);
    if (!repertoire) continue;
    const bucket = grouped.get(repertoirePosition.positionKey) ?? {
      fen: repertoirePosition.fen,
      titles: new Set(),
      games: new Map(),
    };
    let reachedForThisRepertoire = false;
    for (const position of positionsByKey.get(repertoirePosition.positionKey) ?? []) {
      const game = games.get(position.gameId);
      if (!game || game.color !== repertoire.color) continue;
      keepEarliest(bucket.games, { ...game.fact, ply: position.ply });
      reachedForThisRepertoire = true;
    }
    if (reachedForThisRepertoire) bucket.titles.add(repertoire.title);
    grouped.set(repertoirePosition.positionKey, bucket);
  }
  return [...grouped.entries()]
    .map(([key, bucket]) => ({
      positionKey: key,
      fen: bucket.fen,
      repertoireTitles: [...bucket.titles].sort(),
      ...recordFact([...bucket.games.values()]),
    }))
    .filter((row) => row.games.length > 0 && row.scorePercent < 50)
    .sort((a, b) => a.scorePercent - b.scorePercent || b.games.length - a.games.length);
}

function keepEarliest(bucket: Map<string, RecurringGameFact>, fact: RecurringGameFact): void {
  const existing = bucket.get(fact.gameId);
  if (!existing || fact.ply < existing.ply) bucket.set(fact.gameId, fact);
}

function recordFact(games: readonly RecurringGameFact[]): RecordFact {
  const unique = [...new Map(games.map((game) => [game.gameId, game])).values()].sort(
    (a, b) => a.label.localeCompare(b.label) || a.ply - b.ply,
  );
  const wins = unique.filter((game) => game.outcome === 'win').length;
  const losses = unique.filter((game) => game.outcome === 'loss').length;
  const draws = unique.filter((game) => game.outcome === 'draw').length;
  return {
    games: unique,
    wins,
    losses,
    draws,
    scorePercent:
      unique.length === 0 ? 0 : Math.round(((wins + draws * 0.5) / unique.length) * 1_000) / 10,
  };
}

const sideToMove = (fen: string): 'w' | 'b' => (fen.split(/\s+/)[1] === 'b' ? 'b' : 'w');
