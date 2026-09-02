import type { GameRecord, PositionRecord } from './types';

export interface PreparedLocalGame {
  readonly game: GameRecord;
  readonly positions: readonly PositionRecord[];
}

export interface PreparedSqliteGame {
  readonly game: {
    readonly fingerprint: string;
    readonly white: string;
    readonly black: string;
    readonly whiteKey: string;
    readonly blackKey: string;
    readonly result: string;
    readonly date?: string;
    readonly year?: number;
    readonly event?: string;
    readonly site?: string;
    readonly round?: string;
    readonly whiteRating?: number;
    readonly blackRating?: number;
    readonly eco?: string;
    readonly opening?: string;
    readonly plyCount: number;
    readonly importedAt: number;
  };
  readonly pgn: string;
  readonly positions: readonly {
    readonly positionKey: string;
    readonly ply: number;
    readonly moveUci: string;
    readonly moveSan: string;
    readonly mover: 'w' | 'b';
  }[];
}

export type PgnImportTarget = 'local' | 'sqlite';

export type PgnWorkerRequest =
  | {
      readonly type: 'start';
      readonly source: string | Blob;
      readonly target: PgnImportTarget;
      readonly batchSize: number;
    }
  | { readonly type: 'ack'; readonly batchId: number };

export type PgnWorkerMessage =
  | { readonly type: 'progress'; readonly parsed: number; readonly issues: number }
  | {
      readonly type: 'batch';
      readonly batchId: number;
      readonly parsed: number;
      readonly issues: number;
      readonly batch: readonly PreparedLocalGame[] | readonly PreparedSqliteGame[];
    }
  | { readonly type: 'done'; readonly total: number; readonly issues: number }
  | { readonly type: 'error'; readonly error: string };
