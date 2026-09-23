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

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import { createTree } from '@/chess/tree/tree';
import {
  Board,
  ChevronRight,
  PanelLeft,
  PanelRight,
  Search,
  Settings,
  Target,
} from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { MoveTreePanel } from '@/features/movetree/MoveTreePanel';
import { HeaderActions, type RouteAction } from './HeaderActions';
import { NavButton } from '@/features/shell/NavButton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import type { BoardCapabilities, BoardSurfaceMode } from './board-capabilities';
import { CanonicalBoardSurface } from './CanonicalBoardSurface';
import { useWorkspaceArrangement } from './use-arrangement';
import { usePositionActions, type UsePositionActionsOptions } from './usePositionActions';
import { WorkspaceTabStrip } from '@/features/tabs/WorkspaceTabStrip';
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
  /**
   * The route's own actions, right of the title, folded to fit.
   *
   * Listed in priority order: the first is kept in the row longest. When the
   * header is too narrow for the title's floor, actions take their short
   * labels first and then fold from the end into a "⋯" menu — the rule the
   * frame applies for every route, so no route shortens its own labels at a
   * breakpoint it guessed. Anything that is not a plain button (a segmented
   * control, a status, a select) goes in `actions` and is never folded.
   */
  readonly routeActions?: readonly RouteAction[];
  /** Route header content that is not a foldable action. */
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
  routeActions,
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
        routeActions={routeActions}
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
      <WorkspaceTabStrip />
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
                  /*
                    Air around the board — but only where it costs the board
                    nothing it needs. On a short screen the padding stays
                    tight, because 1280x720 is height-bound and every pixel
                    of margin comes out of the board; and Maximum stays tight
                    everywhere, because the board as large as it will go is
                    what that policy promises.
                  */
                  className={cn(
                    'min-h-[460px] flex-1 px-2 py-2 sm:px-3 wide:min-h-0 [@media(max-height:859px)]:py-1',
                    view.priority !== 'maximum' &&
                      '[@media(min-height:860px)]:sm:px-5 [@media(min-height:860px)]:sm:py-4',
                  )}
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
/**
 * How much of the title is protected from the route's actions.
 *
 * The route's *name* is never squeezed below its own width (up to this);
 * the subtitle is descriptive and truncates first, because folding an
 * action to keep every word of "Audit repertoire · White · 0 prepared
 * positions" on screen would be the wrong trade — measured, it cost
 * "Review repertoire" its place in the row at 1280 px.
 */
const TITLE_FLOOR = 200;

function FrameHeader({
  title,
  subtitle,
  icon,
  toolbar,
  routeActions,
  actions,
  position,
  railToggle,
}: Pick<
  WorkspaceFrameProps,
  'title' | 'subtitle' | 'icon' | 'toolbar' | 'routeActions' | 'actions' | 'position'
> & {
  readonly railToggle?: ReactNode;
}) {
  const header = useRef<HTMLElement>(null);
  /*
    Room for the route's actions: the header's content box, less everything
    left of the title, the title's floor, and everything right of the actions
    (the route's other content and the common controls). Independent of what
    the actions currently draw — their own row is subtracted back out — so
    the fold settles rather than oscillates. Negative until measured, which
    draws everything.
  */
  const [available, setAvailable] = useState(-1);
  const measure = useCallback(() => {
    const element = header.current;
    if (!element) return;
    const titleBlock = element.querySelector<HTMLElement>('[data-header-title]');
    const trailing = element.querySelector<HTMLElement>('[data-header-trailing]');
    /*
      A route that supplies its own `toolbar` has no title block, and there is
      no title floor to protect — the toolbar sizes itself. Refusing to
      measure in that case left `available` at -1 for ever, and with a
      negative number `HeaderActions` never counts itself measured and paints
      the whole row invisible: Preparation's Favourite and My games have been
      present, laid out and unseeable since the fold was introduced. Only the
      trailing block is actually required, because it is what the room is
      measured against.
    */
    if (!trailing) {
      setAvailable(-1);
      return;
    }
    const style = getComputedStyle(element);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const inner = element.clientWidth - paddingLeft - paddingRight;
    const contentLeft = element.getBoundingClientRect().left + paddingLeft;
    const titleLeft = titleBlock
      ? titleBlock.getBoundingClientRect().left - contentLeft
      : /* No title block: the leading content is the toolbar, and what is
           left is measured from where the trailing block begins. */
        trailing.getBoundingClientRect().left - contentLeft;
    // The name clips itself, so the block's own scrollWidth is only the room
    // it was given; the h1 knows the text. Only the name is protected.
    const name = titleBlock?.querySelector<HTMLElement>('h1');
    const titleNeed = titleBlock ? Math.min(TITLE_FLOOR, name?.scrollWidth ?? 0) : 0;
    const row = element.querySelector<HTMLElement>('[data-header-actions]');
    const others = trailing.offsetWidth - (row?.offsetWidth ?? 0);
    const next = Math.floor(inner - titleLeft - titleNeed - others - 12);
    setAvailable((current) => (current === next ? current : next));
  }, []);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  /*
    And again whenever the route's actions change.

    The header is full width, so its own box never resizes and the observer
    above never fires; the room was therefore measured once, while the action
    row was absent, and a route that gains an action later (Preparation gains
    three the moment a session is chosen) kept a number computed without it.
    With `available` too small, `HeaderActions` never counts itself measured
    and paints the whole row `visibility: hidden` — present, laid out,
    clickable by nothing. Phase 75 fixed the same class of fault from the
    other side; this is the side where the actions arrive late.
  */
  const actionIds = routeActions?.map((action) => action.id).join('|') ?? '';
  useLayoutEffect(() => {
    measure();
  }, [actionIds, measure]);

  const fen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? START_FEN);
  const documentTitle = useAnalysis((state) => state.document.title);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const setPositionSetupOpen = useUi((state) => state.setPositionSetupOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const positionActions = usePositionActions({
    ...(position ?? {}),
    fen,
    label: position?.label ?? documentTitle ?? title,
  });

  return (
    <header
      ref={header}
      className="flex min-h-14 min-w-0 shrink-0 items-center gap-1.5 bg-surface-1 px-2 sm:px-4"
      data-workspace-header
      data-titlebar-drag=""
    >
      <NavButton />
      {/* Folds the route's own list, so the board can have its width. */}
      {railToggle}
      {toolbar ?? (
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="shrink-0 text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          ) : null}
          <div className="min-w-0" data-header-title>
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-primary">
              {title}
            </h1>
            {subtitle ? (
              <p className="hidden truncate text-xs text-tertiary sm:block">{subtitle}</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5" data-header-trailing>
        {routeActions ? (
          <HeaderActions actions={routeActions} available={available} onMeasured={measure} />
        ) : null}
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
          className="flex h-8 shrink-0 items-center gap-2 rounded-[8px] bg-surface-2 px-3 text-xs text-tertiary transition-colors hover:bg-surface-3 hover:text-secondary"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden mid:inline">Search commands</span>
          <kbd className="hidden rounded-[5px] bg-surface-1 px-1 font-mono text-[10px] mid:inline">
            ⌘K
          </kbd>
        </button>
        {/* Phase 82: the theme switch lives at the foot of the sidebar (and
            in the phone's navigation drawer), where a Mac application keeps
            such a control; a second copy here cost the route its actions. */}
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
          className="mt-2 text-2xs font-semibold text-tertiary [writing-mode:vertical-rl]"
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
          <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-tertiary">
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
