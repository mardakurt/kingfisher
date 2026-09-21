/**
 * What the clock says about a game, read from the `[%clk]` and `[%emt]`
 * commands the tree keeps on each move.
 *
 * Facts only: how long each move took, which took longest, where the clock
 * fell under a third with no increment to speak of, and what was left at the
 * end. Nothing here says a move was slow *for its position* — that is the
 * player's reading to make, with the position in front of them.
 *
 * A game with no clock commands has no clock facts, and the summary says so
 * (`available: false`) rather than reporting zeros.
 */
import { isTimeTrouble, parseTimeControlTag, type TimeControlMetadata } from '@/chess/clock';
import { mainlinePath } from '@/chess/tree/tree';
import { colorOfPly, moveNumberOfPly, type GameTree, type MoveNode } from '@/chess/tree/types';
import type { Color } from '@/chess/types';

export interface MoveThink {
  readonly ply: number;
  readonly moveNumber: number;
  readonly san: string;
  readonly color: Color;
  /** Seconds spent on the move. */
  readonly seconds: number;
  /** Seconds left on this side's clock after the move, when the tree records it. */
  readonly remainingAfter: number | null;
}

export interface SideClockSummary {
  readonly color: Color;
  /** Moves for which a think time could be read. */
  readonly moves: number;
  readonly totalThinkSeconds: number;
  /** The longest thinks, longest first; at most `LONGEST_THINKS`. */
  readonly longest: readonly MoveThink[];
  /** The first move after which the side was in time trouble, or null. */
  readonly timeTroubleFrom: { readonly moveNumber: number; readonly remaining: number } | null;
  /** The last clock reading recorded for this side. */
  readonly finalRemaining: number | null;
}

export interface ClockSummary {
  /** True when at least one move carries a clock command. */
  readonly available: boolean;
  readonly control: TimeControlMetadata | null;
  readonly w: SideClockSummary;
  readonly b: SideClockSummary;
}

export const LONGEST_THINKS = 3;

const empty = (color: Color): SideClockSummary => ({
  color,
  moves: 0,
  totalThinkSeconds: 0,
  longest: [],
  timeTroubleFrom: null,
  finalRemaining: null,
});

/**
 * Seconds a move took, from what the tree records.
 *
 * `[%emt]` is the answer when it is there. Otherwise the previous reading of
 * the same side's clock, plus the increment the move earned, minus the new
 * reading: with a known control the first move of each side starts from the
 * initial time; without one it cannot be timed and is skipped.
 */
function thinkOf(
  node: MoveNode,
  priorRemaining: number | null,
  control: TimeControlMetadata | null,
): number | null {
  if (typeof node.meta.elapsedSeconds === 'number' && node.meta.elapsedSeconds >= 0) {
    return node.meta.elapsedSeconds;
  }
  const remaining = node.meta.clockSeconds;
  if (typeof remaining !== 'number' || priorRemaining === null) return null;
  const increment = control?.incrementSeconds ?? 0;
  const seconds = priorRemaining + increment - remaining;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 10) / 10;
}

export function clockSummary(tree: GameTree): ClockSummary {
  const control = parseTimeControlTag(tree.headers.TimeControl);
  const path = mainlinePath(tree).slice(1);
  const thinks: Record<Color, MoveThink[]> = { w: [], b: [] };
  const prior: Record<Color, number | null> = {
    w: control?.initialSeconds ?? null,
    b: control?.initialSeconds ?? null,
  };
  const finalRemaining: Record<Color, number | null> = { w: null, b: null };
  const trouble: Record<Color, SideClockSummary['timeTroubleFrom']> = { w: null, b: null };
  let available = false;

  for (const id of path) {
    const node = tree.nodes[id];
    if (!node?.move) continue;
    const color = colorOfPly(node.ply);
    const remaining = typeof node.meta.clockSeconds === 'number' ? node.meta.clockSeconds : null;
    if (remaining !== null || typeof node.meta.elapsedSeconds === 'number') available = true;
    const seconds = thinkOf(node, prior[color], control);
    const moveNumber = moveNumberOfPly(node.ply);
    if (seconds !== null) {
      thinks[color].push({
        ply: node.ply,
        moveNumber,
        san: node.move.san,
        color,
        seconds,
        remainingAfter: remaining,
      });
    }
    if (remaining !== null) {
      finalRemaining[color] = remaining;
      prior[color] = remaining;
      if (!trouble[color] && control && isTimeTrouble({ remaining, moveNumber, control })) {
        trouble[color] = { moveNumber, remaining };
      }
    }
  }

  const side = (color: Color): SideClockSummary => {
    const list = thinks[color];
    if (list.length === 0 && finalRemaining[color] === null) return empty(color);
    return {
      color,
      moves: list.length,
      totalThinkSeconds: Math.round(list.reduce((sum, item) => sum + item.seconds, 0)),
      longest: [...list]
        .sort((a, b) => b.seconds - a.seconds || a.ply - b.ply)
        .slice(0, LONGEST_THINKS),
      timeTroubleFrom: trouble[color],
      finalRemaining: finalRemaining[color],
    };
  };

  return { available, control, w: side('w'), b: side('b') };
}

/** `4:12` or `0:07`, for a think time; hours when it comes to that. */
export function formatThink(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}
