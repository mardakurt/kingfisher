import type { BrowserEnCroissantInspection } from './sqlite-read';

/** The largest En Croissant file a browser reads: the whole file is held in memory. */
export const EN_CROISSANT_BROWSER_LIMIT = 1_000_000_000;

export type BrowserReaderRequest =
  | { readonly type: 'open'; readonly file: Blob }
  | { readonly type: 'page'; readonly after: number; readonly limit: number };

export type BrowserReaderResponse =
  | { readonly type: 'opened'; readonly inspection: BrowserEnCroissantInspection }
  | {
      readonly type: 'page';
      /** The page's convertible games, as PGN. */
      readonly pgn: string;
      readonly converted: number;
      readonly examined: number;
      readonly rejected: readonly { readonly id: number; readonly reason: string }[];
      readonly lastId: number;
      readonly nextAfter: number | null;
    }
  | { readonly type: 'error'; readonly error: string };
