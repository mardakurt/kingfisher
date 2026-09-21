/**
 * What a ChessBase database says about itself and its games, as Kingfisher
 * reads it. Only fields Kingfisher uses are modelled; everything else in the
 * files is skipped, not guessed at.
 */

export interface ChessBaseHeader {
  /** 1-based id, as ChessBase numbers games. */
  readonly id: number;
  /** A guiding text rather than a chess game. */
  readonly text: boolean;
  readonly deleted: boolean;
  readonly movesOffset: number;
  /** 0 when the game has no annotations. */
  readonly annotationsOffset: number;
  readonly whiteId: number;
  readonly blackId: number;
  readonly tournamentId: number;
  readonly annotatorId: number;
  readonly sourceId: number;
  /** PGN-style date, `????.??.??` parts allowed, or null when unset. */
  readonly date: string | null;
  readonly result: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** Line evaluation NAG when the "result" is a line rather than a game. */
  readonly lineEvaluation: number;
  readonly round: number;
  readonly subround: number;
  readonly whiteElo: number;
  readonly blackElo: number;
  /** `B97`, or null when unset. Chess960 start positions land here too and are reported as null. */
  readonly eco: string | null;
  readonly chess960: boolean;
  readonly annotationFlags: number;
  readonly moves: number;
}

export interface ChessBasePlayer {
  readonly lastName: string;
  readonly firstName: string;
  readonly games: number;
}

export interface ChessBaseTournament {
  readonly title: string;
  readonly place: string;
  readonly date: string | null;
  readonly nation: number;
  readonly rounds: number;
  readonly games: number;
}

export interface ChessBaseNamed {
  readonly name: string;
  readonly games: number;
}

export interface ChessBaseSource extends ChessBaseNamed {
  readonly publisher: string;
  readonly date: string | null;
}

export interface ChessBaseTeam extends ChessBaseNamed {
  readonly year: number;
  readonly nation: number;
}

/** The files a database is made of, by lower-case extension without the dot. */
export type ChessBaseFiles = ReadonlyMap<string, Uint8Array>;

export interface ChessBaseInspection {
  readonly supported: boolean;
  readonly reason?: string;
  /** Base name shared by the files, e.g. `twic1600`. */
  readonly name: string;
  readonly games: number;
  readonly texts: number;
  readonly deleted: number;
  readonly players: number;
  readonly tournaments: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Source titles from the .cbs file, the database's own statement of where its games came from. */
  readonly sources: readonly string[];
  readonly sizeBytes: number;
  /** Extensions that were present. */
  readonly files: readonly string[];
}
