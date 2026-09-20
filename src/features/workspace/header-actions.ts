/**
 * Which of a route's header actions fit beside its title.
 *
 * The workspace header has one rule that every route used to meet by hand:
 * the common controls (Position, Set up, search, theme, settings) never
 * shrink, and whatever a route adds beside them is taken from the title. Two
 * routes broke it in Phase 73 — Repertoire's title read "Rep…" at 1440 px,
 * Training's disappeared at 1280 px — and each was fixed by hand-shortening
 * labels at one breakpoint, which a route that adds a fourth action would
 * meet again.
 *
 * This is the rule, in one place, as a pure function the frame applies from
 * measurements: first every action with a short label uses it, then actions
 * fold from the end into a "⋯" menu until the title has its floor. The order
 * a route lists its actions in is their priority; the first is kept longest.
 * Exported without React so the decision is testable without a browser.
 */

export interface HeaderActionWidths {
  /** Width with the full label, as drawn. */
  readonly full: number;
  /** Width with the short label; absent when the action has none. */
  readonly short?: number;
}

export interface FitHeaderActionsInput {
  /** Action ids in priority order (first is kept longest). */
  readonly ids: readonly string[];
  readonly widthOf: (id: string) => HeaderActionWidths | undefined;
  /** Room for the actions after the title's floor and the common controls. */
  readonly available: number;
  /** The "⋯" button's width, drawn when anything folds. */
  readonly moreWidth: number;
  /** Space between adjacent items. */
  readonly gap?: number;
}

export interface FitHeaderActions {
  /** Ids drawn in the row, in the route's order. */
  readonly shown: readonly string[];
  /** Ids in the "⋯" menu, in the route's order. */
  readonly folded: readonly string[];
  /** Whether the shown actions use their short labels. */
  readonly compact: boolean;
}

/** What an unmeasured action is assumed to take, before its first paint. */
export const ACTION_WIDTH_ESTIMATE = 120;

export function fitHeaderActions({
  ids,
  widthOf,
  available,
  moreWidth,
  gap = 6,
}: FitHeaderActionsInput): FitHeaderActions {
  if (ids.length === 0) return { shown: [], folded: [], compact: false };
  // Unmeasured (the first render, or before layout): draw everything, full.
  if (!Number.isFinite(available) || available < 0) {
    return { shown: ids, folded: [], compact: false };
  }

  const cost = (id: string, compact: boolean): number => {
    const widths = widthOf(id);
    if (!widths) return ACTION_WIDTH_ESTIMATE + gap;
    return (compact ? (widths.short ?? widths.full) : widths.full) + gap;
  };
  const total = (compact: boolean) => ids.reduce((sum, id) => sum + cost(id, compact), 0);

  if (total(false) <= available) return { shown: ids, folded: [], compact: false };
  if (total(true) <= available) return { shown: ids, folded: [], compact: true };

  // Something folds, so the "⋯" button is in the row and takes its share.
  // Compact labels stay: a row that had to fold has no room for long ones.
  const budget = available - (moreWidth + gap);
  const shown: string[] = [];
  let used = 0;
  for (const id of ids) {
    const next = used + cost(id, true);
    if (next > budget) break;
    shown.push(id);
    used = next;
  }
  const kept = new Set(shown);
  return { shown, folded: ids.filter((id) => !kept.has(id)), compact: true };
}
