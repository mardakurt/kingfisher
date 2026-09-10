/**
 * Shared "Open in …" action registry.
 *
 * Phase 30 grew the same buttons on five different surfaces. Each one
 * used a different label, a different shortcut, and a different flow.
 * Phase 31 introduces a single registry so that the Study tab, the
 * Repertoire page, the Explorer and the Analysis surface all use the
 * same button — and a player who learns "Open in Analysis" once has
 * learned it everywhere.
 *
 * The registry is not a plugin system. It is one table, looked up by
 * id, with a small `availability` predicate so an action that requires
 * a FEN does not appear in a place that has no FEN. If a future phase
 * wants plugins, this table is the right place to grow them; the brief
 * says to keep it small now, and we do.
 */

import type { Fen } from '@/chess/types';
import { START_FEN } from '@/chess/fen';

export interface ActionContext {
  /** The position the user is currently on. Falls back to the start position. */
  readonly fen: Fen;
  /** Selected game / chapter / repertoire id, when the action is launched in scope. */
  readonly targetId?: string;
  /** What kind of target the user is on, when the action is launched in scope. */
  readonly targetKind?:
    | 'game'
    | 'chapter'
    | 'repertoire'
    | 'opening-file'
    | 'preparation'
    | 'endgame'
    | 'position'
    | 'training'
    | 'review';
  /**
   * The FEN the search "Search this position" should anchor on, when the
   * user is asking about a particular position. Defaults to the context
   * FEN. Surfaces that need a different anchor (a different move) can
   * override it without changing the context the user is on.
   */
  readonly positionAnchor?: Fen;
}

export interface OpenInAction {
  readonly id: string;
  readonly label: string;
  /** Optional keyboard shortcut, in the same notation as the binding store. */
  readonly shortcut?: string;
  /**
   * What context the action needs to be visible in. The palette and the
   * toolbar use the same predicate, so a missing FEN is one rule, not two.
   */
  readonly availability: (context: ActionContext) => boolean;
  /** Execute the action. The router is passed in so the registry stays UI-agnostic. */
  readonly run: (context: ActionContext, navigate: (href: string) => void) => void;
}

const hasPosition: (context: ActionContext) => boolean = (context) =>
  Boolean(context.fen) && context.fen !== START_FEN;

const withAnchor = (context: ActionContext): Fen => context.positionAnchor ?? context.fen;

/**
 * The single, authoritative list of "Open in …" actions. New entries
 * here appear everywhere; the order here is the order the surfaces show.
 */
export const OPEN_IN_ACTIONS: readonly OpenInAction[] = [
  {
    id: 'open.analysis',
    label: 'Open in Analysis',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/analysis?fen=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
  {
    id: 'open.explorer',
    label: 'Open in Explorer',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/openings?fen=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
  {
    id: 'open.databases',
    label: 'Search databases from here',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/games?q=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
  {
    id: 'open.study',
    label: 'Add to Study',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/studies/new?fen=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
  {
    id: 'open.repertoire',
    label: 'Add to Repertoire',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/repertoire?add=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
  {
    id: 'open.training',
    label: 'Create training from position',
    availability: hasPosition,
    run: (context, navigate) => {
      const url = `/training?newFrom=${encodeURIComponent(withAnchor(context))}`;
      navigate(url);
    },
  },
];

export function openInAction(id: string): OpenInAction | undefined {
  return OPEN_IN_ACTIONS.find((action) => action.id === id);
}

export function availableOpenInActions(context: ActionContext): readonly OpenInAction[] {
  return OPEN_IN_ACTIONS.filter((action) => action.availability(context));
}
