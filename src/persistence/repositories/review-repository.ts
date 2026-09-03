/**
 * The decision journal and the review queue.
 *
 * Two stores with one purpose: keeping a record of what the player thought
 * before the computer told them, and a work list of positions worth thinking
 * about again. Both follow the revision discipline of ADR 0019, because both
 * are things two tabs can be editing.
 *
 * One rule is enforced here rather than left to the UI: a decision's
 * pre-reveal fields are frozen once `revealedAt` is set. The value of this
 * journal is entirely that its entries were written without the engine, and a
 * record that can be edited afterwards is worth nothing as evidence about the
 * player's own judgement. Themes and notes taken *after* reveal are the
 * exception, and they are the only exception.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { onlyKey } from '../indexeddb/key-range';
import { STORE_NAMES } from '../schema/migrations';
import type {
  DecisionCandidate,
  DecisionConfidence,
  DecisionRecord,
  EvaluationEstimate,
  ReviewCategory,
  ReviewItemRecord,
  ReviewItemSource,
  ReviewSignal,
  ReviewStatus,
  ScheduleState,
} from '../domain';
import { StaleDecisionWriteError, StaleReviewItemWriteError } from '../domain';
import type { Color, Fen, San, Uci } from '@/chess/types';
import type { NodeId } from '@/chess/tree/types';
import { assertValid, isDecisionRecord, isReviewItemRecord } from '../validation';

export interface CreateDecisionInput {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly gameId?: string;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  readonly ply?: number;
  readonly chosenUci?: Uci;
  readonly chosenSan?: San;
  readonly candidates?: readonly DecisionCandidate[];
  readonly estimate?: EvaluationEstimate;
  readonly plan?: string;
  readonly calculationNotes?: string;
  readonly confidence?: DecisionConfidence;
}

/** What a decision still accepts once the evidence has been revealed. */
export interface AnnotateDecisionInput {
  readonly themes?: readonly string[];
  readonly calculationNotes?: string;
}

export interface CreateReviewItemInput {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly source: ReviewItemSource;
  readonly gameId?: string;
  readonly gameLabel?: string;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  readonly ply?: number;
  readonly category?: ReviewCategory;
  readonly reason?: string;
  readonly signals?: readonly ReviewSignal[];
}

export interface ReviewRepository {
  // --- Decisions -----------------------------------------------------------
  listDecisions(limit?: number): Promise<readonly DecisionRecord[]>;
  getDecision(id: string): Promise<DecisionRecord | null>;
  decisionsForPosition(positionKey: string): Promise<readonly DecisionRecord[]>;
  decisionsForGame(gameId: string): Promise<readonly DecisionRecord[]>;
  createDecision(input: CreateDecisionInput, now?: number): Promise<DecisionRecord>;
  /** Edit the pre-reveal answers. Refused once the evidence has been seen. */
  updateDecision(
    id: string,
    expectedRevision: number,
    input: CreateDecisionInput,
  ): Promise<DecisionRecord>;
  /** Stamp the reveal. Idempotent: a second call keeps the first timestamp. */
  revealDecision(id: string, expectedRevision: number, now?: number): Promise<DecisionRecord>;
  /** The only write allowed after reveal. */
  annotateDecision(
    id: string,
    expectedRevision: number,
    input: AnnotateDecisionInput,
  ): Promise<DecisionRecord>;
  deleteDecision(id: string): Promise<void>;

  // --- Review queue --------------------------------------------------------
  listReviewItems(status?: ReviewStatus): Promise<readonly ReviewItemRecord[]>;
  getReviewItem(id: string): Promise<ReviewItemRecord | null>;
  reviewItemsForPosition(positionKey: string): Promise<readonly ReviewItemRecord[]>;
  /** Creates, or returns the existing entry for the same position and source. */
  upsertReviewItem(input: CreateReviewItemInput, now?: number): Promise<ReviewItemRecord>;
  updateReviewItem(
    id: string,
    expectedRevision: number,
    update: Partial<
      Pick<
        ReviewItemRecord,
        'status' | 'themes' | 'category' | 'decisionId' | 'trainingItemId' | 'reviewedAt'
      >
    >,
  ): Promise<ReviewItemRecord>;
  /**
   * Set or clear when this position should be thought about again.
   *
   * Separate from `updateReviewItem` because clearing is a real choice —
   * "never schedule this" — and a partial update cannot express the difference
   * between "leave the schedule alone" and "remove it".
   */
  scheduleReviewItem(
    id: string,
    expectedRevision: number,
    schedule: ScheduleState | undefined,
  ): Promise<ReviewItemRecord>;
  deleteReviewItem(id: string): Promise<void>;
}

export const reviewIdentityKey = (positionKey: string, gameId?: string, nodeId?: string): string =>
  `${positionKey}${gameId ?? ''}${nodeId ?? ''}`;

export class LocalReviewRepository implements ReviewRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  // --- Decisions -----------------------------------------------------------

  async listDecisions(limit = 200): Promise<readonly DecisionRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.decisions);
    return rows
      .map((row) => assertValid(row, isDecisionRecord, 'decision'))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getDecision(id: string): Promise<DecisionRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.decisions, id);
    return raw === undefined ? null : assertValid(raw, isDecisionRecord, 'decision');
  }

  async decisionsForPosition(positionKey: string): Promise<readonly DecisionRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.decisions,
      'positionKey',
      positionKey,
    );
    return rows
      .map((row) => assertValid(row, isDecisionRecord, 'decision'))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async decisionsForGame(gameId: string): Promise<readonly DecisionRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.decisions,
      'gameId',
      gameId,
    );
    return rows
      .map((row) => assertValid(row, isDecisionRecord, 'decision'))
      .sort((a, b) => (a.ply ?? 0) - (b.ply ?? 0) || a.createdAt - b.createdAt);
  }

  async createDecision(input: CreateDecisionInput, now = Date.now()): Promise<DecisionRecord> {
    const record: DecisionRecord = {
      id: stableId('decision'),
      positionKey: input.positionKey,
      fen: input.fen,
      sideToMove: input.sideToMove,
      ...(input.gameId ? { gameId: input.gameId } : {}),
      ...(input.chapterId ? { chapterId: input.chapterId } : {}),
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
      ...(input.ply !== undefined ? { ply: input.ply } : {}),
      ...(input.chosenUci ? { chosenUci: input.chosenUci } : {}),
      ...(input.chosenSan ? { chosenSan: input.chosenSan } : {}),
      candidates: input.candidates ?? [],
      ...(input.estimate ? { estimate: input.estimate } : {}),
      ...(input.plan?.trim() ? { plan: input.plan.trim() } : {}),
      ...(input.calculationNotes?.trim()
        ? { calculationNotes: input.calculationNotes.trim() }
        : {}),
      ...(input.confidence ? { confidence: input.confidence } : {}),
      themes: [],
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.decisions, record);
    return record;
  }

  async updateDecision(
    id: string,
    expectedRevision: number,
    input: CreateDecisionInput,
  ): Promise<DecisionRecord> {
    return this.write(id, expectedRevision, (current) => {
      /*
        The refusal that gives this journal its value. After reveal the player
        has seen the engine, and a "correction" made then is no longer a record
        of their own judgement — it is a record of the engine's, wearing the
        player's name.
      */
      if (current.revealedAt !== undefined) {
        throw new Error('This decision was already revealed; its answers are kept as they were.');
      }
      return {
        ...current,
        ...(input.chosenUci ? { chosenUci: input.chosenUci } : { chosenUci: undefined }),
        ...(input.chosenSan ? { chosenSan: input.chosenSan } : { chosenSan: undefined }),
        candidates: input.candidates ?? current.candidates,
        estimate: input.estimate,
        plan: input.plan?.trim() || undefined,
        calculationNotes: input.calculationNotes?.trim() || undefined,
        confidence: input.confidence,
      };
    });
  }

  async revealDecision(
    id: string,
    expectedRevision: number,
    now = Date.now(),
  ): Promise<DecisionRecord> {
    return this.write(id, expectedRevision, (current) =>
      // Idempotent: the first reveal is the one that happened.
      current.revealedAt === undefined ? { ...current, revealedAt: now } : current,
    );
  }

  async annotateDecision(
    id: string,
    expectedRevision: number,
    input: AnnotateDecisionInput,
  ): Promise<DecisionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      ...(input.themes ? { themes: normalizeThemes(input.themes) } : {}),
      ...(input.calculationNotes === undefined
        ? {}
        : { calculationNotes: input.calculationNotes.trim() || undefined }),
    }));
  }

  async deleteDecision(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.decisions, id);
  }

  private async write(
    id: string,
    expectedRevision: number,
    change: (current: DecisionRecord) => DecisionRecord,
  ): Promise<DecisionRecord> {
    return this.database.transaction([STORE_NAMES.decisions], 'readwrite', async (transaction) => {
      const raw = await transaction.get<unknown>(STORE_NAMES.decisions, id);
      if (raw === undefined) throw new Error('That decision record no longer exists.');
      const current = assertValid(raw, isDecisionRecord, 'decision');
      if (current.revision !== expectedRevision) {
        throw new StaleDecisionWriteError(current, expectedRevision);
      }
      const next: DecisionRecord = {
        ...change(current),
        updatedAt: Date.now(),
        revision: current.revision + 1,
      };
      await transaction.put(STORE_NAMES.decisions, next);
      return next;
    });
  }

  // --- Review queue --------------------------------------------------------

  async listReviewItems(status?: ReviewStatus): Promise<readonly ReviewItemRecord[]> {
    const rows =
      status === undefined
        ? await this.database.getAll<unknown>(STORE_NAMES.reviewItems)
        : await this.database.getAllFromIndex<unknown>(STORE_NAMES.reviewItems, 'status', status);
    return rows
      .map((row) => assertValid(row, isReviewItemRecord, 'review item'))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getReviewItem(id: string): Promise<ReviewItemRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.reviewItems, id);
    return raw === undefined ? null : assertValid(raw, isReviewItemRecord, 'review item');
  }

  async reviewItemsForPosition(positionKey: string): Promise<readonly ReviewItemRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.reviewItems,
      'positionKey',
      positionKey,
    );
    return rows.map((row) => assertValid(row, isReviewItemRecord, 'review item'));
  }

  async upsertReviewItem(
    input: CreateReviewItemInput,
    now = Date.now(),
  ): Promise<ReviewItemRecord> {
    const identityKey = reviewIdentityKey(input.positionKey, input.gameId, input.nodeId);
    return this.database.transaction(
      [STORE_NAMES.reviewItems],
      'readwrite',
      async (transaction) => {
        const existing = await transaction.getAllFromIndex<unknown>(
          STORE_NAMES.reviewItems,
          'identityKey',
          identityKey,
        );
        const first = existing[0];
        if (first !== undefined) {
          /*
            Suggesting review candidates again must not disturb work already
            done. An entry the player has reviewed, converted or ignored is
            left exactly as it is; an untouched one has its reason refreshed,
            because the evidence behind it may have improved.
          */
          const current = assertValid(first, isReviewItemRecord, 'review item');
          if (current.status !== 'unreviewed' || input.source !== 'suggested') return current;
          const refreshed: ReviewItemRecord = {
            ...current,
            ...(input.reason ? { reason: input.reason } : {}),
            signals: input.signals ?? current.signals,
            revision: current.revision + 1,
          };
          await transaction.put(STORE_NAMES.reviewItems, refreshed);
          return refreshed;
        }

        const record: ReviewItemRecord = {
          id: stableId('review'),
          identityKey,
          positionKey: input.positionKey,
          fen: input.fen,
          sideToMove: input.sideToMove,
          source: input.source,
          ...(input.gameId ? { gameId: input.gameId } : {}),
          ...(input.gameLabel ? { gameLabel: input.gameLabel } : {}),
          ...(input.chapterId ? { chapterId: input.chapterId } : {}),
          ...(input.nodeId ? { nodeId: input.nodeId } : {}),
          ...(input.ply !== undefined ? { ply: input.ply } : {}),
          ...(input.category ? { category: input.category } : {}),
          status: 'unreviewed',
          ...(input.reason ? { reason: input.reason } : {}),
          signals: input.signals ?? [],
          themes: [],
          createdAt: now,
          revision: 0,
        };
        await transaction.put(STORE_NAMES.reviewItems, record);
        return record;
      },
    );
  }

  async scheduleReviewItem(
    id: string,
    expectedRevision: number,
    schedule: ScheduleState | undefined,
  ): Promise<ReviewItemRecord> {
    return this.database.transaction(
      [STORE_NAMES.reviewItems],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.reviewItems, id);
        if (raw === undefined) throw new Error('That review item no longer exists.');
        const current = assertValid(raw, isReviewItemRecord, 'review item');
        if (current.revision !== expectedRevision) {
          throw new StaleReviewItemWriteError(current, expectedRevision);
        }
        // Deleting the property rather than storing `undefined`: an absent
        // schedule is the representation of "not scheduled", and IndexedDB
        // would happily store the key with an undefined value.
        const { schedule: _previous, ...rest } = current;
        const next: ReviewItemRecord = {
          ...rest,
          ...(schedule ? { schedule } : {}),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.reviewItems, next);
        return next;
      },
    );
  }

  async updateReviewItem(
    id: string,
    expectedRevision: number,
    update: Partial<
      Pick<
        ReviewItemRecord,
        'status' | 'themes' | 'category' | 'decisionId' | 'trainingItemId' | 'reviewedAt'
      >
    >,
  ): Promise<ReviewItemRecord> {
    return this.database.transaction(
      [STORE_NAMES.reviewItems],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.reviewItems, id);
        if (raw === undefined) throw new Error('That review item no longer exists.');
        const current = assertValid(raw, isReviewItemRecord, 'review item');
        if (current.revision !== expectedRevision) {
          throw new StaleReviewItemWriteError(current, expectedRevision);
        }
        const next: ReviewItemRecord = {
          ...current,
          ...update,
          ...(update.themes ? { themes: normalizeThemes(update.themes) } : {}),
          // Leaving 'unreviewed' is what "reviewed" means; stamp it once.
          ...(update.status !== undefined &&
          update.status !== 'unreviewed' &&
          current.reviewedAt === undefined
            ? { reviewedAt: update.reviewedAt ?? Date.now() }
            : {}),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.reviewItems, next);
        return next;
      },
    );
  }

  async deleteReviewItem(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.reviewItems, id);
  }

  /** Exposed for the improvement summary, which counts rather than lists. */
  countReviewedWithTheme(theme: string): Promise<number> {
    return this.database.countRange(STORE_NAMES.reviewItems, 'themes', onlyKey(theme));
  }
}

/** Trimmed, de-duplicated, order preserved: a theme list is a set, not a log. */
export function normalizeThemes(themes: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const theme of themes) {
    const slug = theme.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
