/**
 * Local Syzygy tablebases, through the companion.
 *
 * Preferred over the network when it can actually answer, which is a narrower
 * condition than "the user has files": the position has to be within the piece
 * limit the companion derived from the tables on disk, *and* there has to be a
 * local probe server configured to read them. Either missing means this
 * provider declines and the remote one answers — with the provenance saying
 * so, because "where did this proof come from" is a question a professional is
 * entitled to a straight answer to.
 *
 * Declining is not failing. A companion with five-piece tables asked about a
 * six-piece position is behaving correctly, and the caller's next step is the
 * fallback rather than an error message.
 */

import { asSan, asUci, type Fen } from '@/chess/types';
import { companionClient } from '@/companion/session';

import {
  moveRank,
  type TablebaseCategory,
  type TablebaseMove,
  type TablebaseProvider,
  type TablebaseResult,
} from './types';

export interface LocalTablebaseStatus {
  readonly configured: boolean;
  readonly path: string | null;
  readonly exists: boolean;
  readonly error?: string;
  readonly maxPieces: number;
  /** Material configurations with a WDL table present. */
  readonly wdl: readonly string[];
  /** Material with a DTZ table; a subset in the common partial download. */
  readonly dtz: readonly string[];
  /** Whether a probe server is configured to read those files. */
  readonly canProbe: boolean;
}

export const EMPTY_STATUS: LocalTablebaseStatus = {
  configured: false,
  path: null,
  exists: false,
  maxPieces: 0,
  wdl: [],
  dtz: [],
  canProbe: false,
};

const CATEGORIES = new Set<TablebaseCategory>([
  'win',
  'cursed-win',
  'draw',
  'blessed-loss',
  'loss',
  'checkmate',
  'stalemate',
]);

const asCategory = (value: unknown): TablebaseCategory =>
  CATEGORIES.has(value as TablebaseCategory) ? (value as TablebaseCategory) : 'draw';

/**
 * A provider backed by the companion's local tables.
 *
 * `maxPieces` is filled in from the companion's own scan rather than assumed,
 * so `eligibleForTablebase` refuses positions this machine genuinely cannot
 * answer instead of making a request that will fail.
 */
export class CompanionTablebaseProvider implements TablebaseProvider {
  readonly id = 'companion-syzygy';
  readonly name = 'Local Syzygy';

  constructor(private status: LocalTablebaseStatus = EMPTY_STATUS) {}

  get maxPieces(): number {
    return this.status.canProbe ? this.status.maxPieces : 0;
  }

  /** Refresh what this machine can answer. Cheap: one directory scan. */
  async refresh(): Promise<LocalTablebaseStatus> {
    const client = companionClient();
    if (!client) {
      this.status = EMPTY_STATUS;
      return this.status;
    }
    try {
      this.status = await client.tablebaseStatus();
    } catch {
      // A companion that is paired but not answering is the same as no local
      // tables for this purpose: decline, and let the remote provider work.
      this.status = EMPTY_STATUS;
    }
    return this.status;
  }

  async probe(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult> {
    const client = companionClient();
    if (!client) throw new Error('The companion is not connected.');
    const response = await client.probeTablebase(fen, signal);
    const raw = response.result as {
      category?: string;
      dtz?: number | null;
      dtm?: number | null;
      checkmate?: boolean;
      stalemate?: boolean;
      moves?: readonly Record<string, unknown>[];
    };

    const moves: TablebaseMove[] = (raw.moves ?? []).map((move) => ({
      uci: asUci(String(move.uci ?? '')),
      san: asSan(String(move.san ?? '')),
      category: asCategory(move.category),
      dtz: typeof move.dtz === 'number' ? move.dtz : null,
      dtm: typeof move.dtm === 'number' ? move.dtm : null,
      zeroing: Boolean(move.zeroing),
      checkmate: Boolean(move.checkmate),
      stalemate: Boolean(move.stalemate),
    }));
    moves.sort(
      (a, b) =>
        moveRank(a.category) - moveRank(b.category) || Math.abs(a.dtz ?? 0) - Math.abs(b.dtz ?? 0),
    );

    return {
      fen,
      category: asCategory(raw.category),
      dtz: typeof raw.dtz === 'number' ? raw.dtz : null,
      dtm: typeof raw.dtm === 'number' ? raw.dtm : null,
      checkmate: Boolean(raw.checkmate),
      stalemate: Boolean(raw.stalemate),
      moves,
      // The provenance the panel prints. Never merged with the remote one.
      source: this.name,
    };
  }
}

/**
 * Which provider should answer a position, and why.
 *
 * Returned as a decision with a reason rather than as a provider, so the panel
 * can say "answered locally" or "local tables do not cover seven pieces"
 * instead of silently producing a result whose origin the reader has to guess.
 */
export interface TablebaseChoice {
  readonly provider: TablebaseProvider;
  readonly local: boolean;
  readonly reason: string;
}

export function chooseTablebaseProvider(
  pieceCount: number,
  local: CompanionTablebaseProvider,
  remote: TablebaseProvider,
  status: LocalTablebaseStatus,
): TablebaseChoice | null {
  if (status.canProbe && pieceCount <= status.maxPieces && pieceCount >= 2) {
    return {
      provider: local,
      local: true,
      reason: `Answered from local tables on this machine (up to ${status.maxPieces} pieces).`,
    };
  }
  if (pieceCount >= 2 && pieceCount <= remote.maxPieces) {
    return {
      provider: remote,
      local: false,
      reason: status.configured
        ? status.canProbe
          ? `Local tables cover ${status.maxPieces} pieces; this position has ${pieceCount}. Answered by ${remote.name}.`
          : `Local tables are configured but no local probe server is running. Answered by ${remote.name}.`
        : `Answered by ${remote.name}.`,
    };
  }
  return null;
}
