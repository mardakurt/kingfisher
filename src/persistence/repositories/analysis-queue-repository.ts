import { stableId } from '../ids';
import { onlyKey } from '../indexeddb/key-range';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type {
  AnalysisQueueJobRecord,
  AnalysisQueueStatus,
  StoredEngineEvidenceRecord,
} from '../domain';
import { assertValid, isAnalysisQueueJobRecord, isStoredEngineEvidenceRecord } from '../validation';

export type EnqueueAnalysisInput = Omit<
  AnalysisQueueJobRecord,
  'id' | 'status' | 'nextIndex' | 'createdAt' | 'updatedAt' | 'ownerId' | 'heartbeatAt'
>;

export interface AnalysisQueueRepository {
  list(): Promise<readonly AnalysisQueueJobRecord[]>;
  enqueue(input: EnqueueAnalysisInput): Promise<AnalysisQueueJobRecord>;
  claimNext(ownerId: string, now?: number): Promise<AnalysisQueueJobRecord | null>;
  update(
    id: string,
    update: Partial<Omit<AnalysisQueueJobRecord, 'id' | 'gameId' | 'createdAt'>>,
  ): Promise<AnalysisQueueJobRecord>;
  recoverInterrupted(now?: number, staleAfterMs?: number): Promise<number>;
  saveEvidence(evidence: StoredEngineEvidenceRecord): Promise<void>;
  evidenceForGame(gameId: string): Promise<readonly StoredEngineEvidenceRecord[]>;
  /**
   * Everything stored about one canonical position, from any game.
   *
   * Keyed by position rather than by game on purpose: a transposition is the
   * same position, and evidence gathered while analysing one game is evidence
   * about the position, not about that game. The decision journal reads this
   * to put a stored search beside a judgement recorded before it.
   */
  evidenceForPosition(positionKey: string): Promise<readonly StoredEngineEvidenceRecord[]>;
  countEvidence(jobId: string): Promise<number>;
}

export class LocalAnalysisQueueRepository implements AnalysisQueueRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly AnalysisQueueJobRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.analysisQueue);
    return rows
      .map((row) => assertValid(row, isAnalysisQueueJobRecord, 'analysis queue job'))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async enqueue(input: EnqueueAnalysisInput): Promise<AnalysisQueueJobRecord> {
    const now = Date.now();
    const job: AnalysisQueueJobRecord = {
      ...input,
      id: stableId('analysis-job'),
      status: 'queued',
      nextIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.analysisQueue, job);
    return job;
  }

  async claimNext(ownerId: string, now = Date.now()): Promise<AnalysisQueueJobRecord | null> {
    return this.database.transaction([STORE_NAMES.analysisQueue], 'readwrite', async (tx) => {
      const rows = await tx.getAllFromIndex<unknown>(STORE_NAMES.analysisQueue, 'status', 'queued');
      const jobs = rows
        .map((row) => assertValid(row, isAnalysisQueueJobRecord, 'analysis queue job'))
        .sort((a, b) => a.createdAt - b.createdAt);
      const current = jobs[0];
      if (!current) return null;
      const claimed: AnalysisQueueJobRecord = {
        ...current,
        status: 'running',
        ownerId,
        heartbeatAt: now,
        updatedAt: now,
        error: undefined,
      };
      await tx.put(STORE_NAMES.analysisQueue, claimed);
      return claimed;
    });
  }

  async update(
    id: string,
    update: Partial<Omit<AnalysisQueueJobRecord, 'id' | 'gameId' | 'createdAt'>>,
  ): Promise<AnalysisQueueJobRecord> {
    return this.database.transaction([STORE_NAMES.analysisQueue], 'readwrite', async (tx) => {
      const raw = await tx.get<unknown>(STORE_NAMES.analysisQueue, id);
      if (!raw) throw new Error('That analysis job no longer exists.');
      const current = assertValid(raw, isAnalysisQueueJobRecord, 'analysis queue job');
      const next: AnalysisQueueJobRecord = { ...current, ...update, updatedAt: Date.now() };
      await tx.put(STORE_NAMES.analysisQueue, next);
      return next;
    });
  }

  async recoverInterrupted(now = Date.now(), staleAfterMs = 30_000): Promise<number> {
    return this.database.transaction([STORE_NAMES.analysisQueue], 'readwrite', async (tx) => {
      const rows = await tx.getAllFromIndex<unknown>(
        STORE_NAMES.analysisQueue,
        'status',
        'running',
      );
      let recovered = 0;
      for (const raw of rows) {
        const job = assertValid(raw, isAnalysisQueueJobRecord, 'analysis queue job');
        if ((job.heartbeatAt ?? 0) > now - staleAfterMs) continue;
        await tx.put(STORE_NAMES.analysisQueue, {
          ...job,
          status: 'paused' as AnalysisQueueStatus,
          ownerId: undefined,
          heartbeatAt: undefined,
          updatedAt: now,
        });
        recovered += 1;
      }
      return recovered;
    });
  }

  async saveEvidence(evidence: StoredEngineEvidenceRecord): Promise<void> {
    await this.database.put(STORE_NAMES.engineEvidence, evidence);
  }

  async evidenceForGame(gameId: string): Promise<readonly StoredEngineEvidenceRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.engineEvidence,
      'gameId',
      gameId,
    );
    return rows.map((row) => assertValid(row, isStoredEngineEvidenceRecord, 'engine evidence'));
  }

  async evidenceForPosition(positionKey: string): Promise<readonly StoredEngineEvidenceRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.engineEvidence,
      'positionKey',
      positionKey,
    );
    return rows.map((row) => assertValid(row, isStoredEngineEvidenceRecord, 'engine evidence'));
  }

  countEvidence(jobId: string): Promise<number> {
    return this.database.countRange(STORE_NAMES.engineEvidence, 'jobId', onlyKey(jobId));
  }
}
