import type { GameDatabase } from './database.mjs';

export interface ImportState {
  readonly phase: 'starting' | 'importing' | 'indexing' | 'done' | 'stopped' | 'failed';
  readonly kind: 'pgn' | 'chessbase';
  readonly file: string;
  readonly bytes: number;
  readonly bulk: boolean;
  readonly workers: number;
  readonly read: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly failures: readonly { id: number; reason: string }[];
  readonly peakRssBytes: number;
  readonly elapsedMs: number;
  readonly indexMs: number;
  readonly stopped: boolean;
  readonly error?: string;
}

export declare class ImportFileError extends Error {}
export declare function kitFile(): string;
export declare function ensureKit(): Promise<string>;
export declare function describeSource(file: string): {
  kind: 'pgn' | 'chessbase';
  file: string;
  bytes: number;
  files?: Record<string, string>;
};
export declare function runImport(
  database: GameDatabase,
  options: {
    file: string;
    workers?: number;
    keepPositions?: boolean;
    licence?: string;
    note?: string;
  },
  onProgress?: (state: ImportState) => void,
  signal?: AbortSignal,
): Promise<ImportState>;
