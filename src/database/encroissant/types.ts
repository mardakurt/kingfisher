export interface EnCroissantInspection {
  readonly file: string;
  readonly format: string;
  readonly supported: boolean;
  readonly reason?: string;
  readonly version?: string;
  readonly title?: string | null;
  readonly games?: number;
  readonly firstDate?: string | null;
  readonly lastDate?: string | null;
  readonly sizeBytes: number;
}
export interface EnCroissantGame {
  readonly id: number;
  readonly white: string | null;
  readonly black: string | null;
  readonly event: string | null;
  readonly site: string | null;
  readonly date: string | null;
  readonly time: string | null;
  readonly round: string | null;
  readonly whiteElo: number | null;
  readonly blackElo: number | null;
  readonly result: string | null;
  readonly timeControl: string | null;
  readonly eco: string | null;
  readonly plyCount: number | null;
  readonly fen: string | null;
  readonly moves: string;
}
export interface EnCroissantPage {
  readonly games: readonly EnCroissantGame[];
  readonly nextAfter: number | null;
}
