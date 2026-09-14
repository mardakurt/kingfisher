'use client';

/**
 * The one page every board route is.
 *
 * Kingfisher has eleven routes with a board on them, and until this existed
 * each one laid itself out by hand: its own header, its own three-column grid
 * with its own column widths, its own idea of where the dock went and whether
 * it could be resized, its own `wide` breakpoint handling. They drifted the way
 * eleven copies of anything drift. Review pinned the dock to a 360px grid
 * track nobody could drag; Studies put the board behind a 300px chapter list
 * that could not be folded; Endgame sized its rail in viewport units and
 * Opening Files in different ones; only Analysis let the user set up a
 * position from its toolbar. A user who learned one page had learned one page.
 *
 * This frame is the Analysis page, made into the structure every route
 * renders. What a route contributes is exactly what makes it that route:
 *
 *  - a **title** (or, for Analysis, its document toolbar),
 *  - the **actions** that belong to its subject — New study, Prepare, Save
 *    this position,
 *  - an optional **banner** under the header — a session bar, a filter row,
 * - an optional **rail**: the route's own list, on the left, collapsible,
 *  - the **board**, or an **empty** state when it has nothing to show,
 *  - a strip **below the board** for what the route knows about the position,
 *  - and its **context panel** in the dock — Journal, References, Opening
 *    tree — under the label the route gives it.
 *
 * Everything else is the same on every page, by construction: the board
 * column with the move tree, the lower panel, the resizable dock and its tab
 * strip, the position menu, position setup, command search, theme and
 * settings. A fix here is a fix on every page, which is the whole reason the
 * frame exists.
 *
 * The frame owns no chess state. It reads the workspace context like any tool
 * and renders the canonical board surface; the route decides what is on the
 * board through the analysis store, exactly as before.
 */

import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import { createTree } from '@/chess/tree/tree';
import {
  Board,
  ChevronRight,
  PanelLeft,
  PanelRight,
  Moon,
  Search,
  Settings,
  Sun,
  Target,
} from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { MoveTreePanel } from '@/features/movetree/MoveTreePanel';
import { NavButton } from '@/features/shell/NavButton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import type { BoardCapabilities, BoardSurfaceMode } from './board-capabilities';
import { CanonicalBoardSurface } from './CanonicalBoardSurface';
import { useWorkspaceArrangement } from './use-arrangement';
import { usePositionActions, type UsePositionActionsOptions } from './usePositionActions';
import { WorkspaceLowerPanel } from './WorkspaceLowerPanel';
import { WorkspaceToolDock, type WorkspaceLock } from './WorkspaceToolDock';

export interface WorkspaceRail {
  /** What the list is, for the collapsed strip and assistive technology. */
  readonly label: string;
  readonly content: ReactNode;
  /** Controls beside the label — a "+" for a new chapter, a filter. */
  readonly actions?: ReactNode;
  /** Width on a wide screen. Defaults to a chapter-list width. */
  readonly width?: number;
  /**
   * The content carries its own heading, so the rail draws no header row.
   * Review's rail is a tab strip; a "REVIEW QUEUE" bar above a "Queue" tab
   * above a "REVIEW QUEUE" panel heading said the same thing three times.
   */
  readonly headerless?: boolean;
}

export interface WorkspaceBoardOptions {
  readonly mode?: BoardSurfaceMode;
  readonly showContext?: boolean;
  readonly showEvaluationArtifacts?: boolean;
  readonly capabilities?: Partial<BoardCapabilities>;
  readonly conceal?: boolean;
  readonly concealPieces?: boolean;
}

export interface WorkspaceFrameProps {
  /** The layout key: which module set and which stored arrangement. */
  readonly workspace: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: ReactNode;
  /**
   * Replaces the title block. Analysis uses this for New / Import / Export and
   * its document header; every other route has a title and actions.
   */
  readonly toolbar?: ReactNode;
  /** The route's own actions, right of the title. */
  readonly actions?: ReactNode;
  /** A full-width strip between the header and the workspace. */
  readonly banner?: ReactNode;
  readonly rail?: WorkspaceRail;
  /** How the canonical board behaves here. */
  readonly board?: WorkspaceBoardOptions;
  /** A route-owned board region instead of the canonical surface — Training's answer board. */
  readonly boardSlot?: ReactNode;
  /** Shown in place of the board when the route has nothing open. */
  readonly empty?: ReactNode;
  /**
   * Replaces everything under the header — rail, board and dock.
   *
   * For the one thing a route may show that is not a position: the openings
   * library, which is an index. The header, and so the position menu and
   * setup, stay; the arrangement underneath is untouched for when the route
   * comes back to its board.
   */
  readonly takeover?: ReactNode;
  /** A strip under the board and above the lower panel. */
  readonly belowBoard?: ReactNode;
  readonly contextLabel?: string;
  readonly contextPanel?: ReactNode;
  readonly locked?: WorkspaceLock;
  /** Whether the notation panel is part of this workspace. Default: yes. */
  readonly withMoveTree?: boolean;
  /** Position-menu options this route contributes. */
  readonly position?: Omit<UsePositionActionsOptions, 'fen' | 'label'> & {
    readonly label?: string;
  };
  /** What to do when a `?fen=` query hands this route a position. */
  readonly onPositionFromUrl?: () => void;
  readonly className?: string;
  readonly children?: ReactNode;
}

const DEFAULT_RAIL_WIDTH = 240;
const LAPTOP_RAIL_WIDTH = 220;

export function WorkspaceFrame({
  workspace,
  title,
  subtitle,
  icon,
  toolbar,
  actions,
  banner,
  rail,
  board,
  boardSlot,
  empty,
  takeover,
  belowBoard,
  contextLabel = 'Context',
  contextPanel,
  locked,
  withMoveTree = true,
  position,
  onPositionFromUrl,
  className,
  children,
}: WorkspaceFrameProps) {
  const view = useWorkspaceArrangement(workspace, { withMoveTree });
  const { wide } = view;
  const setRailCollapsed = useWorkspaceLayout((state) => state.setRailCollapsed);
  /*
    The board is the thing that grows. A rail beside a dock is two fixed
    columns, and on a laptop they left the board the smallest thing on the
    page — 364px at 1280x720 on Endgame, against the 450px floor
    `e2e/board-size.spec.ts` holds every route to. So the width policy: while
    a rail is open on a display narrower than 1600px the dock takes its
    minimum width, and below 1400px the rail itself is capped at 220px. The
    rail stays open, because a page's own list is what the page is for; a
    choice to fold it is stored and wins.
  */
  const laptop = useMediaQuery('(max-width: 1399px)');
  const narrowDock = useMediaQuery('(max-width: 1599px)');
  const railCollapsed = rail ? (view.arrangement.railCollapsed ?? false) : false;
  const dockNarrow = Boolean(rail) && !railCollapsed && narrowDock;
  const railWidth = rail
    ? laptop
      ? Math.min(rail.width ?? DEFAULT_RAIL_WIDTH, LAPTOP_RAIL_WIDTH)
      : (rail.width ?? DEFAULT_RAIL_WIDTH)
    : 0;

  const moveTreePanel = withMoveTree ? <MoveTreePanel withHeader={false} /> : undefined;

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      data-workspace-frame={workspace}
      data-rail={rail ? (railCollapsed ? 'collapsed' : 'open') : undefined}
    >
      <Suspense fallback={null}>
        <PositionFromUrl onPosition={onPositionFromUrl} />
      </Suspense>
      <FrameHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        toolbar={toolbar}
        actions={actions}
        position={position}
        railToggle={
          rail && wide && !takeover ? (
            <IconButton
              label={railCollapsed ? `Show ${rail.label}` : `Hide ${rail.label}`}
              onClick={() => setRailCollapsed(workspace, view.device, !railCollapsed)}
              active={!railCollapsed}
              className="-ml-1"
            >
              {railCollapsed ? <PanelRight /> : <PanelLeft />}
            </IconButton>
          ) : undefined
        }
      />
      {banner}
      {takeover ?? (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            wide && 'flex-row overflow-hidden',
          )}
        >
          {rail ? (
            <Rail
              rail={rail}
              width={railWidth}
              wide={wide}
              collapsed={railCollapsed}
              onCollapse={(value) => setRailCollapsed(workspace, view.device, value)}
            />
          ) : null}

          <section
            className="flex min-h-[620px] min-w-0 flex-1 flex-col wide:min-h-0"
            data-workspace-board-column
          >
            {empty ? (
              <div className="flex min-h-[420px] flex-1 items-center justify-center px-4">
                {empty}
              </div>
            ) : (
              (boardSlot ?? (
                <CanonicalBoardSurface
                  mode={board?.mode ?? 'interactive'}
                  showContext={board?.showContext ?? true}
                  showEvaluationArtifacts={board?.showEvaluationArtifacts ?? false}
                  {...(board?.capabilities ? { capabilities: board.capabilities } : {})}
                  conceal={board?.conceal ?? false}
                  concealPieces={board?.concealPieces ?? false}
                  className="min-h-[460px] flex-1 px-2 py-2 sm:px-3 wide:min-h-0"
                />
              ))
            )}
            {belowBoard}
            {/*
            Exactly one region claims the move tree. `moveTreeInPrimary` is
            false unless the user pinned the notation back into the board
            column, so the default layout puts it in the lower panel.
          */}
            {withMoveTree && view.moveTreeInPrimary && !empty ? (
              <div className="h-[210px] shrink-0 border-t border-line-subtle">
                <ErrorBoundary label="The move list">
                  <MoveTreePanel />
                </ErrorBoundary>
              </div>
            ) : null}
            {empty ? null : (
              <WorkspaceLowerPanel
                workspace={workspace}
                contextLabel={contextLabel}
                contextPanel={contextPanel}
                locked={locked}
                withMoveTree={withMoveTree}
                moveTreePanel={moveTreePanel}
              />
            )}
          </section>

          <WorkspaceToolDock
            workspace={workspace}
            contextLabel={contextLabel}
            contextPanel={contextPanel}
            locked={locked}
            withMoveTree={withMoveTree}
            moveTreePanel={moveTreePanel}
            narrow={dockNarrow}
          />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The header every route shares.
 *
 * Left: navigation, then either the route's identity or its toolbar. Right:
 * the route's own actions, then the controls that are the same everywhere —
 * the position menu, position setup, command search, theme and settings.
 *
 * Position setup is a *button*, not a menu entry. Adding and removing pieces
 * is how an endgame study, a training position and a "what if the bishop were
 * on d3" question all begin, and it was reachable from one route out of
 * eleven, two menus deep.
 */
function FrameHeader({
  title,
  subtitle,
  icon,
  toolbar,
  actions,
  position,
  railToggle,
}: Pick<WorkspaceFrameProps, 'title' | 'subtitle' | 'icon' | 'toolbar' | 'actions' | 'position'> & {
  readonly railToggle?: ReactNode;
}) {
  const fen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? START_FEN);
  const documentTitle = useAnalysis((state) => state.document.title);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const setPositionSetupOpen = useUi((state) => state.setPositionSetupOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const positionActions = usePositionActions({
    ...(position ?? {}),
    fen,
    label: position?.label ?? documentTitle ?? title,
  });

  return (
    <header
      className="flex min-h-14 min-w-0 shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-4"
      data-workspace-header
    >
      <NavButton />
      {/* Folds the route's own list, so the board can have its width. */}
      {railToggle}
      {toolbar ?? (
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="shrink-0 text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-primary">{title}</h1>
            {subtitle ? (
              <p className="hidden truncate text-xs text-tertiary sm:block">{subtitle}</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {actions}
        <span className="mx-1 hidden h-4 w-px bg-line-subtle sm:block" />
        <Menu
          sections={positionActions.sections}
          trigger={({ open, toggle, id }) => (
            <Button
              id={id}
              aria-label="Position actions"
              aria-haspopup="menu"
              aria-expanded={open}
              active={open}
              icon={<Target />}
              onClick={toggle}
            >
              {/*
                Position and Set up are the buttons a person reaches for first
                on a workspace. Hiding their labels at any width below a 1500
                px monitor made them icon-only on most laptops and every iPad,
                which left the icon to do all the work — and the icon, on its
                own, did not. `xs` is the breakpoint above which the sidebar
                has not collapsed out of the way and there is room for a short
                label next to the icon. Both labels together still leave space
                for the toolbar at 1080 px, the smallest size the workspaces
                ship at.
              */}
              <span className="hidden xs:inline">Position</span>
            </Button>
          )}
        />
        <Button
          aria-label="Set up position — add or remove pieces"
          title="Set up position — add or remove pieces"
          icon={<Board />}
          onClick={() => setPositionSetupOpen(true)}
          data-position-setup
        >
          <span className="hidden xs:inline">Set up</span>
        </Button>
        {/*
          Search commands keeps a longer label than Position or Set up, so the
          threshold for it is wider: at `mid` (900 px) the rest of the toolbar
          has the room it needs without the search button pushing the theme
          toggle off the right edge. Below that the icon and the kbd stay, so
          the shortcut is still discoverable.
        */}
        <button
          type="button"
          onClick={toggleCommandPalette}
          aria-label="Search commands"
          className="flex h-9 shrink-0 items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-3 text-xs text-tertiary transition-colors hover:border-line-strong hover:text-secondary"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden mid:inline">Search commands</span>
          <kbd className="hidden rounded-[3px] border border-line bg-surface-1 px-1 font-mono text-[10px] mid:inline">
            ⌘K
          </kbd>
        </button>
        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
        <IconButton label="Settings (⌘,)" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
      </div>
    </header>
  );
}

/**
 * The route's own list, beside the board.
 *
 * On a wide screen it is a column of the route's width with a fold control;
 * folded, it is a 36px strip carrying its label sideways so the user knows
 * what they folded. On a narrow screen it goes *after* the board, because the
 * board is what the page is for and the list is how you get to the next one.
 */
function Rail({
  rail,
  width,
  wide,
  collapsed,
  onCollapse,
}: {
  readonly rail: WorkspaceRail;
  readonly width: number;
  readonly wide: boolean;
  readonly collapsed: boolean;
  readonly onCollapse: (value: boolean) => void;
}) {
  if (wide && collapsed) {
    return (
      <aside
        className="flex w-9 shrink-0 flex-col items-center border-r border-line-subtle bg-surface-1 py-1"
        aria-label={rail.label}
        data-workspace-rail="collapsed"
      >
        <IconButton label={`Show ${rail.label}`} onClick={() => onCollapse(false)}>
          <ChevronRight />
        </IconButton>
        <span
          className="mt-2 text-2xs font-medium tracking-[0.08em] text-tertiary uppercase [writing-mode:vertical-rl]"
          aria-hidden
        >
          {rail.label}
        </span>
      </aside>
    );
  }
  return (
    <aside
      className={cn(
        'relative flex min-h-0 min-w-0 shrink-0 flex-col bg-surface-1',
        wide ? 'border-r border-line-subtle' : 'order-3 min-h-[320px] border-t border-line-subtle',
      )}
      style={wide ? { width } : undefined}
      aria-label={rail.label}
      data-workspace-rail="open"
    >
      {rail.headerless ? null : (
        <header className="density-pad-x flex h-8 shrink-0 items-center gap-2 border-b border-line-subtle px-2.5">
          <span className="min-w-0 flex-1 truncate text-2xs font-medium tracking-[0.08em] text-tertiary uppercase">
            {rail.label}
          </span>
          {rail.actions}
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{rail.content}</div>
    </aside>
  );
}

/**
 * A position handed over in the address.
 *
 * "Open in Analysis", "Open in Explorer" and the command palette have all
 * navigated to `/analysis?fen=…` and `/openings?fen=…` since Phase 9, and no
 * route ever read the parameter: the command opened the page and left the
 * board wherever it was. Every route now consumes it in one place. A position
 * already on the board is left alone — the tree and cursor are worth more
 * than a fresh root — and the parameter is removed once read so a reload
 * does not re-apply it over later work.
 */
function PositionFromUrl({ onPosition }: { readonly onPosition?: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get('fen');
  const openDocument = useAnalysis((state) => state.openDocument);
  const notify = useUi((state) => state.notify);
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!requested || applied.current === requested) return;
    applied.current = requested;
    const parsed = Position.fromFen(requested);
    if (!parsed.ok) {
      notify({ tone: 'error', message: 'The address carried a position Kingfisher cannot play.' });
    } else {
      const current = useAnalysis.getState();
      const onBoard = current.tree.nodes[current.currentId]?.fen;
      if (!onBoard || positionKey(onBoard) !== positionKey(parsed.value.fen)) {
        openDocument({
          tree: createTree(parsed.value.fen, { Event: 'Analysis', Result: '*' }),
          document: { kind: 'untitled', title: 'Untitled analysis' },
        });
      }
      onPosition?.();
    }
    const rest = new URLSearchParams(params.toString());
    rest.delete('fen');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [notify, onPosition, openDocument, params, pathname, requested, router]);

  return null;
}
