/**
 * What a board is allowed to do and show.
 *
 * Phase 5 unified the full-size board; Phases 6 to 9 then added Review,
 * Calculation, Guess the Move, Endgame, Preparation, Opening Files and Model
 * Game mode on top of it, each expressing "hide the answer" in its own way —
 * Review by passing `showEvaluationArtifacts={revealed}`, the dock by
 * withholding tool mounts, Calculation by an overlay. Three mechanisms, no
 * single place to check, and nothing stopping a fourth route from forgetting.
 *
 * A capability record is that single place. Two rules make it trustworthy:
 *
 *   1. It is *declared*, never inferred from the pathname. The same document
 *      is editable in Analysis and frozen in a preview card, so behaviour is a
 *      property of the surface, not of the route. An earlier version guessed
 *      from the route and made a game opened from Games read-only in Analysis.
 *
 *   2. Concealment is subtractive and cannot be un-set downstream. A concealing
 *      mode turns capabilities off after the caller's overrides are applied, so
 *      a route cannot re-enable evaluation inside a mode whose whole purpose is
 *      to withhold it — including by accident.
 */

export type BoardSurfaceMode = 'interactive' | 'read-only' | 'preview' | 'training';

export interface BoardCapabilities {
  /** Pieces can be dragged to make a move on the workspace tree. */
  readonly allowMoves: boolean;
  /** Right-drag arrows and right-click highlights can be drawn and cleared. */
  readonly allowAnnotations: boolean;
  /** Stored arrows and highlights are painted at all. */
  readonly showAnnotations: boolean;
  /** Legal destination dots for the piece under the pointer. */
  readonly showLegalHints: boolean;
  /** The evaluation bar and the stored-evaluation graph. */
  readonly showEvaluation: boolean;
  readonly showCoordinates: boolean;
  readonly allowFlip: boolean;
  /** The board controls and position summary beneath the board. */
  readonly allowContextActions: boolean;
  /** Pieces are hidden behind an overlay, as in a blindfold exercise. */
  readonly concealPieces: boolean;
}

const INTERACTIVE: BoardCapabilities = {
  allowMoves: true,
  allowAnnotations: true,
  showAnnotations: true,
  showLegalHints: true,
  showEvaluation: true,
  showCoordinates: true,
  allowFlip: true,
  allowContextActions: true,
  concealPieces: false,
};

const BASE: Record<BoardSurfaceMode, BoardCapabilities> = {
  interactive: INTERACTIVE,
  /* A game you are reading rather than editing: everything visible, nothing changed. */
  'read-only': {
    ...INTERACTIVE,
    allowMoves: false,
    allowAnnotations: false,
  },
  /* A thumbnail in a card. It is a picture of a position, not a workspace. */
  preview: {
    ...INTERACTIVE,
    allowMoves: false,
    allowAnnotations: false,
    showLegalHints: false,
    showEvaluation: false,
    allowFlip: false,
    allowContextActions: false,
  },
  /*
    You are being asked a question. Legal hints narrow the answer, the
    evaluation gives it away, and a stored `!` on the next move is the answer
    written on the board — so all three go, and `showAnnotations` is why this
    is a capability rather than a `showEvaluationArtifacts` flag.
  */
  training: {
    ...INTERACTIVE,
    showLegalHints: false,
    showEvaluation: false,
    showAnnotations: false,
    allowAnnotations: false,
  },
};

export interface BoardCapabilityRequest {
  readonly mode: BoardSurfaceMode;
  /** Narrowing overrides from the surface. */
  readonly overrides?: Partial<BoardCapabilities>;
  /**
   * Withhold every capability that could reveal the answer.
   *
   * Applied last and never reversible by an override. Review, Calculation,
   * Guess the Move and Training all set this; the point of putting it after
   * the overrides is that no future call site can turn evaluation back on
   * inside a concealed session by passing the wrong prop.
   */
  readonly conceal?: boolean;
  /** Also hide the pieces themselves, for blindfold work. */
  readonly concealPieces?: boolean;
}

export function resolveBoardCapabilities(request: BoardCapabilityRequest): BoardCapabilities {
  const base = BASE[request.mode];
  const withOverrides: BoardCapabilities = { ...base, ...(request.overrides ?? {}) };
  if (!request.conceal && !request.concealPieces) return withOverrides;

  return {
    ...withOverrides,
    ...(request.conceal
      ? {
          showEvaluation: false,
          showLegalHints: false,
          showAnnotations: false,
          allowAnnotations: false,
        }
      : {}),
    concealPieces: request.concealPieces === true || withOverrides.concealPieces,
  };
}
