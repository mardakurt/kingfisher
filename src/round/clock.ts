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
import { mainlinePath, nodePath } from '@/chess/tree/tree';
import {
  colorOfPly,
  moveNumberOfPly,
  type GameTree,
  type MoveNode,
  type NodeId,
} from '@/chess/tree/types';
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

export interface ClocksAt {
  /** Seconds on each side's clock at this point of the line, or null when not recorded. */
  readonly w: number | null;
  readonly b: number | null;
  /** How long the move that reached this point took, when the tree can say. */
  readonly lastThink: { readonly color: Color; readonly seconds: number } | null;
}

/**
 * Both clocks as they stood after the move at `nodeId`, read along the line
 * that reaches it — a variation inherits the clocks of the game it left, and
 * a move of its own with no reading leaves the last one standing.
 *
 * Before a side has moved its clock is the control's starting time when the
 * TimeControl tag gives one, and unknown otherwise. Null when nothing on the
 * line, nor the tag, says anything about time: a game without clocks shows
 * no clocks rather than two dashes.
 */
export function clocksAt(tree: GameTree, nodeId: NodeId): ClocksAt | null {
  const control = parseTimeControlTag(tree.headers.TimeControl);
  const remaining: Record<Color, number | null> = {
    w: control?.initialSeconds ?? null,
    b: control?.initialSeconds ?? null,
  };
  let recorded = false;
  let lastThink: ClocksAt['lastThink'] = null;
  for (const id of nodePath(tree, nodeId).slice(1)) {
    const node = tree.nodes[id];
    if (!node?.move) continue;
    const color = colorOfPly(node.ply);
    const reading = typeof node.meta.clockSeconds === 'number' ? node.meta.clockSeconds : null;
    if (reading !== null || typeof node.meta.elapsedSeconds === 'number') recorded = true;
    const seconds = thinkOf(node, remaining[color], control);
    lastThink = seconds === null ? null : { color, seconds };
    if (reading !== null) remaining[color] = reading;
  }
  if (!recorded && !treeHasClock(tree)) return null;
  return { w: remaining.w, b: remaining.b, lastThink };
}

/**
 * Seconds each move of the main line took, in order, with null where the
 * tree cannot say — the column a time chart draws per ply. Empty when the
 * game records no clocks at all.
 */
export function mainlineThinkTimes(
  tree: GameTree,
): readonly { readonly nodeId: NodeId; readonly seconds: number | null }[] {
  if (!treeHasClock(tree)) return [];
  const control = parseTimeControlTag(tree.headers.TimeControl);
  const prior: Record<Color, number | null> = {
    w: control?.initialSeconds ?? null,
    b: control?.initialSeconds ?? null,
  };
  return mainlinePath(tree)
    .slice(1)
    .map((nodeId) => {
      const node = tree.nodes[nodeId];
      if (!node?.move) return { nodeId, seconds: null };
      const color = colorOfPly(node.ply);
      const seconds = thinkOf(node, prior[color], control);
      if (typeof node.meta.clockSeconds === 'number') prior[color] = node.meta.clockSeconds;
      return { nodeId, seconds };
    });
}

/** Whether any move anywhere in the tree carries a clock command. */
function treeHasClock(tree: GameTree): boolean {
  return Object.values(tree.nodes).some(
    (node) =>
      typeof node.meta.clockSeconds === 'number' || typeof node.meta.elapsedSeconds === 'number',
  );
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
