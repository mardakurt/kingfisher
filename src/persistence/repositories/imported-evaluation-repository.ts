/**
 * Evaluations received from another Kingfisher as a file (Phase 85). Written
 * by importing a file, read by position; an evaluation already held — the
 * same position, engine, depth, first move and time — is not stored twice,
 * so opening the same file twice changes nothing.
 */
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { ImportedEvaluationRecord } from '../domain';
import { assertValid, isImportedEvaluationRecord } from '../validation';
import type { SharedEvaluation } from '@/evidence/exchange';

export interface EvaluationSource {
  readonly file: string;
  readonly from: string | null;
  readonly exportedAt: number;
}

export interface ImportedEvaluationRepository {
  /** What is held for a position, deepest first. */
  atPosition(positionKey: string): Promise<readonly ImportedEvaluationRecord[]>;
  importMany(
    evaluations: readonly SharedEvaluation[],
    source: EvaluationSource,
    now?: number,
  ): Promise<{ readonly added: number; readonly alreadyHeld: number }>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

const identity = (entry: {
  positionKey: string;
  engine: string;
  depth: number;
  pv: readonly string[];
  analysedAt: number;
}) =>
  `${entry.positionKey}\u001f${entry.engine}\u001f${entry.depth}\u001f${entry.pv[0] ?? ''}\u001f${entry.analysedAt}`;

export class LocalImportedEvaluationRepository implements ImportedEvaluationRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async atPosition(positionKey: string): Promise<readonly ImportedEvaluationRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.importedEvaluations,
      'positionKey',
      positionKey,
    );
    return rows
      .map((row) => assertValid(row, isImportedEvaluationRecord, 'imported evaluation'))
      .sort((a, b) => b.depth - a.depth || b.analysedAt - a.analysedAt);
  }

  async importMany(
    evaluations: readonly SharedEvaluation[],
    source: EvaluationSource,
    now = Date.now(),
  ): Promise<{ readonly added: number; readonly alreadyHeld: number }> {
    return this.database.transaction(
      [STORE_NAMES.importedEvaluations],
      'readwrite',
      async (transaction) => {
        let added = 0;
        let alreadyHeld = 0;
        const held = new Map<string, Set<string>>();
        for (const evaluation of evaluations) {
          let known = held.get(evaluation.positionKey);
          if (!known) {
            const rows = await transaction.getAllFromIndex<ImportedEvaluationRecord>(
              STORE_NAMES.importedEvaluations,
              'positionKey',
              evaluation.positionKey,
            );
            known = new Set(rows.map(identity));
            held.set(evaluation.positionKey, known);
          }
          const key = identity(evaluation);
          if (known.has(key)) {
            alreadyHeld += 1;
            continue;
          }
          const record: ImportedEvaluationRecord = {
            id: stableId('evaluation'),
            ...evaluation,
            source: { ...source, importedAt: now },
            createdAt: now,
            updatedAt: now,
            revision: 0,
          };
          assertValid(record, isImportedEvaluationRecord, 'imported evaluation');
          await transaction.put(STORE_NAMES.importedEvaluations, record);
          known.add(key);
          added += 1;
        }
        return { added, alreadyHeld };
      },
    );
  }

  async count(): Promise<number> {
    return (await this.database.getAll<unknown>(STORE_NAMES.importedEvaluations)).length;
  }

  async clear(): Promise<void> {
    await this.database.clear(STORE_NAMES.importedEvaluations);
  }
}
