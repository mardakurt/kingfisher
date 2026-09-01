/**
 * The evidence packet.
 *
 * A language model asked "why is Nf3 strong here?" will answer from what it
 * remembers about chess, which is a plausible-sounding average of the internet
 * and is wrong about this position in particular. The packet exists so that it
 * is never asked that question. It is given what Kingfisher *knows* — the
 * engine's actual lines, the database's actual counts, the user's actual
 * repertoire, the tablebase's actual verdict — and asked to explain that.
 *
 * Every item carries its source. That is not decoration: it is what lets the
 * answer be checked, and what stops generated prose from being mistaken for
 * something Stockfish said.
 *
 * Nothing in this module talks to a network. It builds a structure; the
 * provider sends it.
 */

import type { PositionFeatures } from '@/chess/features';
import type { Fen, San, Uci } from '@/chess/types';
import type { EngineAnalysis } from '@/engine/types';
import type { DatabaseMove } from '@/database/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import type { TablebaseResult } from '@/tablebase/types';

/**
 * Where a fact came from.
 *
 * The assistant must attribute every claim to one of these, and must never
 * present its own prose as though it came from one.
 */
export type EvidenceSource =
  | 'engine'
  | 'database'
  | 'repertoire'
  | 'personal-games'
  | 'tablebase'
  | 'user-notes'
  | 'model-game'
  | 'position-features';

export interface EngineEvidence {
  readonly engine: string;
  readonly depth: number;
  readonly lines: readonly {
    readonly rank: number;
    readonly score: string;
    readonly moves: readonly San[];
  }[];
}

export interface DatabaseEvidence {
  readonly source: string;
  readonly totalGames: number;
  readonly moves: readonly {
    readonly san: San;
    readonly games: number;
    readonly frequencyPercent: number;
    readonly scorePercent: number;
    readonly averageRating?: number;
  }[];
}

export interface RepertoireEvidence {
  readonly title: string;
  readonly color: 'White' | 'Black';
  readonly moves: readonly { readonly san: San; readonly role: string; readonly note?: string }[];
}

export interface EvidencePacket {
  readonly fen: Fen;
  readonly sideToMove: 'White' | 'Black';
  /** The moves that led here, in SAN, so the model can see the game so far. */
  readonly line: readonly San[];
  readonly engines: readonly EngineEvidence[];
  readonly database: DatabaseEvidence | null;
  readonly repertoire: RepertoireEvidence | null;
  readonly personal: { readonly games: number; readonly scorePercent: number } | null;
  readonly tablebase: {
    readonly category: string;
    readonly dtz: number | null;
    readonly best: readonly San[];
  } | null;
  readonly features: PositionFeatures | null;
  readonly notes: readonly string[];
  readonly modelGames: readonly string[];
  /** Which sources actually carry data, so the prompt can say what is missing. */
  readonly present: readonly EvidenceSource[];
}

export interface PacketInput {
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly line?: readonly San[];
  readonly engines?: readonly { name: string; analysis: EngineAnalysis | null }[];
  readonly databaseName?: string;
  readonly databaseTotal?: number;
  readonly databaseMoves?: readonly DatabaseMove[];
  readonly repertoire?: {
    title: string;
    color: 'w' | 'b';
    record: RepertoirePositionRecord;
  } | null;
  readonly personal?: { games: number; score: number } | null;
  readonly tablebase?: TablebaseResult | null;
  readonly features?: PositionFeatures | null;
  readonly notes?: readonly string[];
  readonly modelGames?: readonly string[];
  readonly formatScore: (score: EngineAnalysis['lines'][number]['score']) => string;
}

const percent = (value: number): number => Math.round(value * 100);

export function buildEvidencePacket(input: PacketInput): EvidencePacket {
  const present: EvidenceSource[] = [];

  const engines = (input.engines ?? [])
    .filter((entry): entry is { name: string; analysis: EngineAnalysis } => entry.analysis !== null)
    .map((entry) => ({
      engine: entry.name,
      depth: entry.analysis.depth,
      lines: entry.analysis.lines.slice(0, 4).map((line) => ({
        rank: line.rank,
        score: input.formatScore(line.score),
        // SAN where the line has been replayed; UCI is unreadable to a model
        // and to a person, and a line nobody can read cannot be checked.
        moves: (line.san ?? []).slice(0, 8) as readonly San[],
      })),
    }));
  if (engines.length > 0) present.push('engine');

  const total = input.databaseTotal ?? 0;
  const database: DatabaseEvidence | null =
    input.databaseMoves && input.databaseMoves.length > 0
      ? {
          source: input.databaseName ?? 'local database',
          totalGames: total,
          moves: input.databaseMoves.slice(0, 8).map((move) => {
            const played = move.white + move.draws + move.black;
            const wins = input.sideToMove === 'w' ? move.white : move.black;
            return {
              san: move.san,
              games: move.games,
              frequencyPercent: total > 0 ? percent(move.games / total) : 0,
              scorePercent: played > 0 ? percent((wins + move.draws / 2) / played) : 50,
              ...(move.averageRating ? { averageRating: move.averageRating } : {}),
            };
          }),
        }
      : null;
  if (database) present.push('database');

  const repertoire: RepertoireEvidence | null = input.repertoire
    ? {
        title: input.repertoire.title,
        color: input.repertoire.color === 'w' ? 'White' : 'Black',
        moves: input.repertoire.record.moves.map((move) => ({
          san: move.san,
          role: move.expected ? 'expected opponent reply' : move.role,
          ...(move.note ? { note: move.note } : {}),
        })),
      }
    : null;
  if (repertoire) present.push('repertoire');

  const personal = input.personal
    ? { games: input.personal.games, scorePercent: percent(input.personal.score) }
    : null;
  if (personal && personal.games > 0) present.push('personal-games');

  const tablebase = input.tablebase
    ? {
        category: input.tablebase.category,
        dtz: input.tablebase.dtz,
        best: input.tablebase.moves.slice(0, 3).map((move) => move.san),
      }
    : null;
  if (tablebase) present.push('tablebase');

  if (input.features) present.push('position-features');
  const notes = (input.notes ?? []).filter((note) => note.trim().length > 0);
  if (notes.length > 0) present.push('user-notes');
  const modelGames = input.modelGames ?? [];
  if (modelGames.length > 0) present.push('model-game');

  return {
    fen: input.fen,
    sideToMove: input.sideToMove === 'w' ? 'White' : 'Black',
    line: input.line ?? [],
    engines,
    database,
    repertoire,
    personal,
    tablebase,
    features: input.features ?? null,
    notes,
    modelGames,
    present,
  };
}

/**
 * The packet as text for the model.
 *
 * Rendered rather than sent as raw JSON because a model follows a labelled
 * document more reliably than a nested object, and because the labels are the
 * attribution — "ENGINE (Stockfish, depth 26)" is what the answer has to cite.
 */
export function renderPacket(packet: EvidencePacket): string {
  const out: string[] = [];

  out.push(`POSITION`);
  out.push(`FEN: ${packet.fen}`);
  out.push(`${packet.sideToMove} to move.`);
  if (packet.line.length > 0) out.push(`Moves so far: ${packet.line.join(' ')}`);

  for (const engine of packet.engines) {
    out.push('', `ENGINE (${engine.engine}, depth ${engine.depth})`);
    for (const line of engine.lines) {
      out.push(`  ${line.rank}. ${line.score}  ${line.moves.join(' ')}`);
    }
  }

  if (packet.database) {
    out.push('', `DATABASE (${packet.database.source}, ${packet.database.totalGames} games here)`);
    for (const move of packet.database.moves) {
      out.push(
        `  ${move.san}: ${move.games} games, ${move.frequencyPercent}% of them, scoring ${move.scorePercent}%` +
          (move.averageRating ? `, average Elo ${move.averageRating}` : ''),
      );
    }
  }

  if (packet.repertoire) {
    out.push('', `REPERTOIRE (${packet.repertoire.title}, ${packet.repertoire.color})`);
    for (const move of packet.repertoire.moves) {
      out.push(`  ${move.san}: ${move.role}${move.note ? ` — ${move.note}` : ''}`);
    }
  }

  if (packet.personal) {
    out.push(
      '',
      `PERSONAL GAMES`,
      `  ${packet.personal.games} of the user's own games reach this position, scoring ${packet.personal.scorePercent}%.`,
    );
  }

  if (packet.tablebase) {
    out.push(
      '',
      `TABLEBASE (proved, not evaluated)`,
      `  ${packet.tablebase.category}${packet.tablebase.dtz === null ? '' : `, DTZ ${packet.tablebase.dtz}`}`,
      packet.tablebase.best.length > 0 ? `  Best: ${packet.tablebase.best.join(', ')}` : '',
    );
  }

  if (packet.features) {
    out.push('', 'POSITION FEATURES (counted from the board, not judged)');
    out.push(`  ${describeSide('White', packet.features.white)}`);
    out.push(`  ${describeSide('Black', packet.features.black)}`);
  }

  if (packet.notes.length > 0) {
    out.push('', 'USER NOTES');
    for (const note of packet.notes) out.push(`  ${note}`);
  }

  if (packet.modelGames.length > 0) {
    out.push('', 'MODEL GAMES LINKED HERE');
    for (const game of packet.modelGames) out.push(`  ${game}`);
  }

  const missing = (['engine', 'database', 'repertoire', 'tablebase'] as const).filter(
    (source) => !packet.present.includes(source),
  );
  if (missing.length > 0) {
    out.push('', `NO EVIDENCE AVAILABLE FROM: ${missing.join(', ')}`);
  }

  return out.filter((line) => line !== '').join('\n');
}

const describeSide = (name: string, side: PositionFeatures['white']): string => {
  const parts: string[] = [];
  if (side.pawns.isolated.length) parts.push(`isolated ${side.pawns.isolated.join(',')}`);
  if (side.pawns.doubled.length) parts.push(`doubled ${side.pawns.doubled.join(',')}`);
  if (side.pawns.passed.length) parts.push(`passed ${side.pawns.passed.join(',')}`);
  if (side.pawns.backward.length) parts.push(`backward ${side.pawns.backward.join(',')}`);
  if (side.files.open.length) parts.push(`open files ${side.files.open.join('')}`);
  if (side.files.semiOpen.length) parts.push(`semi-open ${side.files.semiOpen.join('')}`);
  if (side.bishopPair) parts.push('bishop pair');
  if (side.castled) parts.push('castled');
  parts.push(`${side.pawns.islands} pawn island(s)`);
  return `${name}: ${parts.join('; ')}`;
};

/** Moves the packet mentions, for checking an answer against it. */
export function citedMoves(packet: EvidencePacket): ReadonlySet<string> {
  const moves = new Set<string>();
  for (const engine of packet.engines) {
    for (const line of engine.lines) for (const move of line.moves) moves.add(move);
  }
  for (const move of packet.database?.moves ?? []) moves.add(move.san);
  for (const move of packet.repertoire?.moves ?? []) moves.add(move.san);
  for (const move of packet.tablebase?.best ?? []) moves.add(move);
  return moves;
}

export type { Uci };
