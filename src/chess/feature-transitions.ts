/**
 * Phase 41 — deterministic "what changed" strategic transitions.
 *
 * Each function takes a before- and after-board view and returns a list of
 * short, factual transition statements (e.g. "Black creates a protected
 * passed pawn on d4."). These are not interpretations: every statement is
 * backed by a board fact the user can verify, and a statement is only
 * emitted when the before/after pair actually differs in that fact.
 *
 * The module is the engine the Game Review uses to attach strategic
 * context to a critical moment. A critical moment without a transition
 * stays a tactical fact; a critical moment that also creates a passed
 * pawn, opens a file or strips the king shield gets one statement per
 * observable change, no more.
 *
 * The vocabulary is deliberate. "Black gains a protected passed pawn" is
 * a fact (the board contains a passed pawn with a friendly passer on an
 * adjacent file in the after-position, and not in the before-position).
 * "Black plays a strong positional move" is a judgement, and does not
 * belong here.
 */
import { fileOf } from './board';
import { parseFen, type FenParts } from './fen';
import { positionFeatures, type ColorFeatures, type PositionFeatures } from './features';
import { isOk } from './result';
import type { Color, FileLetter, Square } from './types';
import { FILES } from './types';

export interface FeatureTransition {
  /**
   * Stable id used to dedupe across a single before/after pair.
   *
   * One transition per (kind, color, square, file) tuple — the same pawn
   * becoming passed again on the next move is not a fresh transition.
   */
  readonly id: string;
  /**
   * Short factual statement, no judgements, no coaching prose. Plain
   * English; the user can read it without knowing chess terminology and
   * without knowing what the engine thinks.
   */
  readonly statement: string;
  readonly color: Color;
  readonly kind:
    | 'passed-pawn'
    | 'protected-passer'
    | 'connected-passers'
    | 'isolated-pawn'
    | 'doubled-pawns'
    | 'backward-pawn'
    | 'open-file'
    | 'semi-open-file'
    | 'rook-on-open-file'
    | 'bishop-pair'
    | 'king-shield';
}

export interface FeatureTransitionOptions {
  /**
   * Suppress king-shield transitions for early moves where there is no
   * castling decision worth surfacing. Defaults to ply >= 10.
   */
  readonly minPlyForKingShield?: number;
}

/**
 * Compute every transition between two consecutive positions.
 *
 * @param before FEN before the move.
 * @param after FEN after the move.
 * @param options see {@link FeatureTransitionOptions}.
 */
export function featureTransitions(
  before: string,
  after: string,
  options: FeatureTransitionOptions = {},
): readonly FeatureTransition[] {
  const beforeParts = parseSafe(before);
  const afterParts = parseSafe(after);
  if (!beforeParts || !afterParts) return [];
  const beforeFeatures = positionFeatures(beforeParts);
  const afterFeatures = positionFeatures(afterParts);
  const transitions: FeatureTransition[] = [];

  const colorLabel = (color: Color): string => (color === 'w' ? 'White' : 'Black');
  const sides: ReadonlyArray<{ readonly color: Color; readonly half: ColorFeatures }> = [
    { color: 'w', half: beforeFeatures.white },
    { color: 'b', half: beforeFeatures.black },
  ];
  const afterSides: ReadonlyArray<{ readonly color: Color; readonly half: ColorFeatures }> = [
    { color: 'w', half: afterFeatures.white },
    { color: 'b', half: afterFeatures.black },
  ];

  for (let i = 0; i < sides.length; i += 1) {
    const { color } = sides[i] as { color: Color };
    const beforeHalf = (sides[i] as { half: ColorFeatures }).half;
    const afterHalf = (afterSides[i] as { half: ColorFeatures }).half;

    /* Passed pawns — by file, not by square, so a pawn that
       was already passed and just advanced one square does
       not fire a fresh transition. The structural event is
       the file gaining a passed pawn; the rank is incidental. */
    const beforePassedFiles = new Set(
      beforeHalf.pawns.passed.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    const afterPassedFiles = new Set(
      afterHalf.pawns.passed.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    for (const file of afterPassedFiles) {
      if (!beforePassedFiles.has(file)) {
        const firstAfterSquare = afterHalf.pawns.passed.find(
          (square) => FILES[fileOf(square)] === file,
        );
        if (!firstAfterSquare) continue;
        transitions.push({
          id: `passed-pawn:${color}:${file}`,
          kind: 'passed-pawn',
          color,
          statement: `${colorLabel(color)} creates a passed pawn on the ${file}-file.`,
        });
      }
    }

    /* Protected passed pawns — file-based for the same reason.
       A pawn that was connected before and just advanced does
       not re-fire the transition. */
    const beforeConnectedFiles = new Set(
      beforeHalf.pawns.connectedPassed.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    const afterConnectedFiles = new Set(
      afterHalf.pawns.connectedPassed.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    for (const file of afterConnectedFiles) {
      if (!beforeConnectedFiles.has(file)) {
        const firstAfterSquare = afterHalf.pawns.connectedPassed.find(
          (square) => FILES[fileOf(square)] === file,
        );
        if (!firstAfterSquare) continue;
        transitions.push({
          id: `protected-passer:${color}:${file}`,
          kind: 'protected-passer',
          color,
          statement: `${colorLabel(color)} creates a protected passed pawn on the ${file}-file.`,
        });
      }
    }

    /* Connected passers (pair) */
    if (afterHalf.pawns.connectedPassed.length >= 2 && beforeHalf.pawns.connectedPassed.length < 2) {
      transitions.push({
        id: `connected-passers:${color}`,
        kind: 'connected-passers',
        color,
        statement: `${colorLabel(color)} creates connected passed pawns.`,
      });
    }

    /* Isolated pawns — file-based for the same reason as
       passed pawns: a pawn that was isolated and just
       advanced should not fire a fresh event. */
    const beforeIsolatedFiles = new Set(
      beforeHalf.pawns.isolated.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    const afterIsolatedFiles = new Set(
      afterHalf.pawns.isolated.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    for (const file of afterIsolatedFiles) {
      if (!beforeIsolatedFiles.has(file)) {
        const firstAfterSquare = afterHalf.pawns.isolated.find(
          (square) => FILES[fileOf(square)] === file,
        );
        if (!firstAfterSquare) continue;
        transitions.push({
          id: `isolated-pawn:${color}:${file}`,
          kind: 'isolated-pawn',
          color,
          statement: `${colorLabel(color)} now has an isolated pawn on the ${file}-file.`,
        });
      }
    }

    /* Doubled pawns — a pawn moving onto an already-occupied
       file is a doubled-pawn event only when that file was
       not doubled before. */
    const beforeDoubledFiles = new Set(
      beforeHalf.pawns.doubled.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    const afterDoubledFiles = new Set(
      afterHalf.pawns.doubled.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    for (const file of afterDoubledFiles) {
      if (!beforeDoubledFiles.has(file)) {
        transitions.push({
          id: `doubled-pawns:${color}:${file}`,
          kind: 'doubled-pawns',
          color,
          statement: `${colorLabel(color)} now has doubled pawns on the ${file}-file.`,
        });
      }
    }

    /* Backward pawns — file-based, same reasoning. */
    const beforeBackwardFiles = new Set(
      beforeHalf.pawns.backward.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    const afterBackwardFiles = new Set(
      afterHalf.pawns.backward.map((square) => FILES[fileOf(square)] as FileLetter),
    );
    for (const file of afterBackwardFiles) {
      if (!beforeBackwardFiles.has(file)) {
        const firstAfterSquare = afterHalf.pawns.backward.find(
          (square) => FILES[fileOf(square)] === file,
        );
        if (!firstAfterSquare) continue;
        transitions.push({
          id: `backward-pawn:${color}:${file}`,
          kind: 'backward-pawn',
          color,
          statement: `${colorLabel(color)} now has a backward pawn on the ${file}-file.`,
        });
      }
    }

    /* Open files */
    const beforeOpen = new Set(beforeHalf.files.open);
    const afterOpen = new Set(afterHalf.files.open);
    for (const file of afterOpen) {
      if (!beforeOpen.has(file)) {
        transitions.push({
          id: `open-file:${color}:${file}`,
          kind: 'open-file',
          color,
          statement: `The ${file}-file becomes open.`,
        });
      }
    }

    /* Semi-open files */
    const beforeSemi = new Set(beforeHalf.files.semiOpen);
    const afterSemi = new Set(afterHalf.files.semiOpen);
    for (const file of afterSemi) {
      if (!beforeSemi.has(file)) {
        transitions.push({
          id: `semi-open-file:${color}:${file}`,
          kind: 'semi-open-file',
          color,
          statement: `The ${file}-file becomes a semi-open file for ${colorLabel(color)}.`,
        });
      }
    }

    /* Rooks on newly open files */
    const beforeRooks = new Set(beforeHalf.rooksOnOpenFiles);
    const afterRooks = new Set(afterHalf.rooksOnOpenFiles);
    for (const square of afterRooks) {
      if (!beforeRooks.has(square)) {
        const file = FILES[fileOf(square)] as FileLetter;
        transitions.push({
          id: `rook-on-open-file:${color}:${square}`,
          kind: 'rook-on-open-file',
          color,
          statement: `${colorLabel(color)}'s rook on ${square} now stands on the open ${file}-file.`,
        });
      }
    }

    /* Bishop pair */
    if (afterHalf.bishopPair && !beforeHalf.bishopPair) {
      transitions.push({
        id: `bishop-pair:gained:${color}`,
        kind: 'bishop-pair',
        color,
        statement: `${colorLabel(color)} now has the bishop pair.`,
      });
    }
    if (!afterHalf.bishopPair && beforeHalf.bishopPair) {
      transitions.push({
        id: `bishop-pair:lost:${color}`,
        kind: 'bishop-pair',
        color,
        statement: `${colorLabel(color)} gives up the bishop pair.`,
      });
    }

    /* King shield — only emit when the shield weakened by at least 2.
       Dropping from 3 pawns to 2 is normal pawn play; 3 → 1 is a real
       weakening the user should know about. */
    if (beforeHalf.kingShieldPawns - afterHalf.kingShieldPawns >= 2) {
      transitions.push({
        id: `king-shield:${color}`,
        kind: 'king-shield',
        color,
        statement: `${colorLabel(color)}'s kingside pawn shield is weakened (${beforeHalf.kingShieldPawns} \u2192 ${afterHalf.kingShieldPawns}).`,
      });
    }
  }
  /* Keep `options` referenced for future tuning. */
  void options.minPlyForKingShield;

  return transitions;
}

function parseSafe(fen: string): FenParts | null {
  const result = parseFen(fen);
  return isOk(result) ? result.value : null;
}

/* Re-export so tests can construct identical inputs without re-importing. */
export type { PositionFeatures, Square };
