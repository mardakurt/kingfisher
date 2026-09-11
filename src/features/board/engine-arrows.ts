/**
 * Engine best-move arrows.
 *
 * A separate annotation layer from the PGN shapes the user draws: same
 * coordinates, same orientation, but a distinct visual identity so a player
 * never confuses the engine's opinion with their own. Two engines at once get
 * two identities. Engines that happen to recommend the same move are rendered
 * side-by-side rather than as one solid line, because "they agree" is the
 * point.
 */

import { useMemo } from 'react';

import type { San, Square, Uci } from '@/chess/types';
import type { Score } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

/**
 * The two stable visual identities for engine arrows.
 *
 * `engine-a` is solid blue; `engine-b` is dashed orange. Colour alone is not
 * enough to tell them apart (PART AK): the line style is the second channel.
 * The assignment is by slot, not by engine name, so swapping which engine runs
 * on which side of the comparison does not silently swap the user's colour
 * associations mid-session.
 */
export type EngineArrowIdentity = 'engine-a' | 'engine-b';

export interface EngineArrow {
  readonly kind: 'arrow';
  readonly identity: EngineArrowIdentity;
  readonly engineName: string;
  readonly from: Square;
  readonly to: Square;
  /**
   * Whether this arrow is paired with another engine's arrow for the same
   * move. The renderer uses it to nudge the line off the centre so two
   * engines agreeing do not paint over each other.
   */
  readonly agreedWith?: EngineArrowIdentity;
  /**
   * The move as written in standard algebraic notation, for the hover
   * tooltip. The renderer still draws the arrow by UCI squares; this is
   * what the user reads.
   */
  readonly san?: San;
  /** Evaluation the engine reported at the head of the line. */
  readonly score?: Score;
  /** Search depth when the line was produced. */
  readonly depth?: number;
}

export interface EngineArrowStyle {
  readonly color: string;
  readonly dashArray: string | null;
  readonly label: string;
}

/**
 * The visual identities, resolved through CSS custom properties so the
 * palette follows the board theme (PART AV). `var(--engine-a-color)` and
 * `var(--engine-b-color)` are declared by the theme that paints them.
 */
export const ENGINE_ARROW_STYLES: Readonly<Record<EngineArrowIdentity, EngineArrowStyle>> = {
  'engine-a': {
    color: 'var(--engine-a-color, #2f7dff)',
    dashArray: null,
    label: 'Engine A',
  },
  'engine-b': {
    color: 'var(--engine-b-color, #f08a1c)',
    dashArray: '0.32 0.22',
    label: 'Engine B',
  },
};

const identityForSlot = (slot: 'primary' | 'secondary'): EngineArrowIdentity =>
  slot === 'primary' ? 'engine-a' : 'engine-b';

/**
 * Parse a UCI move into its origin and destination squares.
 *
 * A UCI move is `[from][to][promotion?]`. We only need the first two. Castling
 * is encoded king-side (`e1g1`) and the rendered arrow follows the king.
 */
export const uciToArrow = (uci: Uci): { from: Square; to: Square } | null => {
  if (typeof uci !== 'string' || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
  return { from: from as Square, to: to as Square };
};

export interface EngineArrowInput {
  readonly primary: {
    readonly analysis: {
      readonly bestMove?: Uci;
      readonly depth?: number;
      readonly lines: readonly {
        readonly moves: readonly Uci[];
        readonly san?: readonly San[];
        readonly score?: Score;
      }[];
    } | null;
    readonly analysedFen: string | null;
    readonly identity: { readonly name: string } | null;
  };
  readonly secondary: {
    readonly analysis: {
      readonly bestMove?: Uci;
      readonly depth?: number;
      readonly lines: readonly {
        readonly moves: readonly Uci[];
        readonly san?: readonly San[];
        readonly score?: Score;
      }[];
    } | null;
    readonly analysedFen: string | null;
    readonly identity: { readonly name: string } | null;
  };
  readonly comparing: boolean;
}

/**
 * Pure-function form, exercised by the tests.
 *
 * Returns an empty array when the preference is off, when no engine slot has
 * produced a snapshot for the current position, or when the snapshot is
 * stale — its `fen` is not the position the workspace is on. The latter is a
 * chess correctness invariant (PART AA / AB): a stale engine result must
 * never leave an arrow on a new position, however briefly, however loud the
 * engine is about being right.
 */
export function computeEngineArrows(
  input: EngineArrowInput,
  currentFen: string | null,
  show: boolean,
): readonly EngineArrow[] {
  if (!show || !currentFen) return [];
  const targetKey = positionKey(currentFen);

  const collect = (
    slot: 'primary' | 'secondary',
    slotInput: EngineArrowInput['primary'],
  ): {
    identity: EngineArrowIdentity;
    uci: Uci;
    engineName: string;
    san?: San;
    score?: Score;
    depth?: number;
  } | null => {
    const { analysis, analysedFen, identity } = slotInput;
    if (!analysis || !analysedFen) return null;
    if (positionKey(analysedFen) !== targetKey) return null;
    // Prefer the engine's reported bestMove; fall back to the first PV
    // move. Either is fine; the engine's `bestmove` is a stronger claim
    // because it has decided.
    const uci = analysis.bestMove ?? analysis.lines[0]?.moves[0];
    if (!uci) return null;
    const head = analysis.lines.find((line) => line.moves[0] === uci) ?? analysis.lines[0];
    const name = identity?.name ?? 'Engine';
    return {
      identity: identityForSlot(slot),
      uci,
      engineName: name,
      ...(head?.san?.[0] ? { san: head.san[0] } : {}),
      ...(head?.score !== undefined ? { score: head.score } : {}),
      ...(analysis.depth ? { depth: analysis.depth } : {}),
    };
  };

  const primary = collect('primary', input.primary);
  const secondary = input.comparing ? collect('secondary', input.secondary) : null;
  if (!primary && !secondary) return [];

  const arrows: EngineArrow[] = [];
  const primaryArrow = primary ? uciToArrow(primary.uci) : null;
  const secondaryArrow = secondary ? uciToArrow(secondary.uci) : null;
  const agree = !!(
    primary &&
    secondary &&
    primaryArrow &&
    secondaryArrow &&
    primary.uci === secondary.uci
  );

  if (primary && primaryArrow) {
    arrows.push({
      kind: 'arrow',
      identity: primary.identity,
      engineName: primary.engineName,
      from: primaryArrow.from,
      to: primaryArrow.to,
      ...(primary.san ? { san: primary.san } : {}),
      ...(primary.score ? { score: primary.score } : {}),
      ...(primary.depth !== undefined ? { depth: primary.depth } : {}),
      ...(agree ? { agreedWith: 'engine-b' } : {}),
    });
  }
  if (secondary && secondaryArrow) {
    arrows.push({
      kind: 'arrow',
      identity: secondary.identity,
      engineName: secondary.engineName,
      from: secondaryArrow.from,
      to: secondaryArrow.to,
      ...(secondary.san ? { san: secondary.san } : {}),
      ...(secondary.score ? { score: secondary.score } : {}),
      ...(secondary.depth !== undefined ? { depth: secondary.depth } : {}),
      ...(agree ? { agreedWith: 'engine-a' } : {}),
    });
  }
  return arrows;
}

/**
 * Compute the engine arrows to draw on the board for the current position.
 *
 * A thin React wrapper around `computeEngineArrows`: the subscription
 * selectors are isolated here so the test can exercise the logic without a
 * renderer.
 */
export function useEngineArrows(currentFen: string | null): readonly EngineArrow[] {
  const show = usePreferences((state) => state.showEngineArrows);
  const primaryAnalysis = useEngine((state) => state.primary.analysis);
  const primaryAnalysedFen = useEngine((state) => state.primary.analysedFen);
  const primaryIdentity = useEngine((state) => state.primary.identity);
  const comparing = useEngine((state) => state.comparing);
  const secondaryAnalysis = useEngine((state) => state.secondary.analysis);
  const secondaryAnalysedFen = useEngine((state) => state.secondary.analysedFen);
  const secondaryIdentity = useEngine((state) => state.secondary.identity);

  return useMemo(
    () =>
      computeEngineArrows(
        {
          primary: {
            analysis: primaryAnalysis,
            analysedFen: primaryAnalysedFen,
            identity: primaryIdentity,
          },
          secondary: {
            analysis: secondaryAnalysis,
            analysedFen: secondaryAnalysedFen,
            identity: secondaryIdentity,
          },
          comparing,
        },
        currentFen,
        show,
      ),
    [
      comparing,
      currentFen,
      primaryAnalysis,
      primaryAnalysedFen,
      primaryIdentity,
      secondaryAnalysis,
      secondaryAnalysedFen,
      secondaryIdentity,
      show,
    ],
  );
}
