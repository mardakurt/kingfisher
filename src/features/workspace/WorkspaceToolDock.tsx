'use client';

import {
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ChevronDown, ChevronRight, Database, PanelRight } from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { IconButton } from '@/components/ui/Button';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useCalculation } from '@/features/calculation/calculation-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import {
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  type WorkspaceModuleId,
  type WorkspaceRegion,
} from './layout-model';
import { MOVE_TREE_MODULE, WORKSPACE_MODULES, type WorkspaceToolId } from './modules';
import { ModuleTabStrip } from './ModuleTabStrip';
import { ToolContent } from './ToolContent';
import { useModuleAvailability } from './use-module-availability';
import { useWorkspaceArrangement } from './use-arrangement';
import { DEFAULT_PINNED_TOOLS, WORKSPACE_PRESETS } from './presets';

import { DESKTOP_MIN_WIDTH_QUERY, TALL_VIEWPORT_QUERY } from './breakpoints';

export interface WorkspaceLock {
  readonly message: string;
  readonly action?: ReactNode;
  /** Tools that stay usable while the rest are withheld. */
  readonly except?: readonly WorkspaceToolId[];
}

export const moduleLabel = (id: WorkspaceModuleId, contextLabel: string): string => {
  if (id === 'move-tree') return MOVE_TREE_MODULE.label;
  if (id === 'document') return contextLabel;
  return WORKSPACE_MODULES[id].label;
};

/**
 * A running calculation locks every dock from inside it.
 *
 * The alternative — every workspace passing a lock down — is one workspace
 * away from leaking the engine into a session the player asked to be blind. A
 * gate whose enforcement depends on nine call sites remembering is not a gate.
 */
export function useEffectiveLock(locked: WorkspaceLock | undefined): WorkspaceLock | undefined {
  const calculating = useCalculation((state) => state.fen !== null && !state.revealed);
  if (locked) return locked;
  if (!calculating) return undefined;
  return {
    message: 'Evidence is hidden while you calculate. Submit your lines to reveal it.',
    except: ['calculation'] as readonly WorkspaceToolId[],
  };
}

export function WorkspaceToolDock({
  workspace,
  className,
  contextLabel = 'Context',
  contextPanel,
  fill = false,
  locked,
  withMoveTree = false,
  moveTreePanel,
  narrow = false,
}: {
  readonly workspace: string;
  readonly className?: string;
  readonly contextLabel?: string;
  readonly contextPanel?: ReactNode;
  /** Fill a route-owned grid track instead of taking the persisted dock width. */
  readonly fill?: boolean;
  /**
   * Hide every tool's evidence behind an explicit choice.
   *
   * Self-analysis needs the computer to be *deliberately* absent, not broken
   * and not merely un-started — so the dock keeps its shape, keeps its tabs
   * visible, and says whose decision this was. Mounting is what is withheld:
   * a locked tool issues no query and starts no engine, which is also why the
   * lock cannot be worked around by switching tabs.
   */
  readonly locked?: WorkspaceLock;
  /** Whether this workspace's move tree can be docked here. */
  readonly withMoveTree?: boolean;
  readonly moveTreePanel?: ReactNode;
  /**
   * Take the minimum policy width rather than the policy's own.
   *
   * The frame asks for this when a rail is open on a display too narrow for
   * a rail, a dock and a board all at their full widths. A width the user
   * dragged is theirs and is kept.
   */
  readonly narrow?: boolean;
}) {
  const wide = useMediaQuery(DESKTOP_MIN_WIDTH_QUERY);
  /*
    The notation is stacked above the tools on any desk-width screen with room
    for both; below 600px (a window dragged small) it becomes the first tab.
  */
  const roomForNotation = useMediaQuery('(min-height: 600px)');
  const tall = useMediaQuery(TALL_VIEWPORT_QUERY);
  const view = useWorkspaceArrangement(workspace, { withMoveTree });
  const { device, dockModules, activeDock, foldedFromLower } = view;
  const chosenWidth = useWorkspaceLayout(
    (state) => state.arrangements[`${device}:${workspace}`]?.dockWidth,
  );
  const arrangement =
    narrow && chosenWidth === undefined
      ? { ...view.arrangement, dockWidth: DOCK_WIDTH_MIN }
      : view.arrangement;
  const setActiveModule = useWorkspaceLayout((state) => state.setActiveModule);
  const setDockWidth = useWorkspaceLayout((state) => state.setDockWidth);
  const setDockCollapsed = useWorkspaceLayout((state) => state.setDockCollapsed);
  const moveModuleTo = useWorkspaceLayout((state) => state.moveModuleTo);
  const pinned =
    useWorkspaceLayout((state) => state.pinnedTools[workspace]) ?? DEFAULT_PINNED_TOOLS;
  const effectiveLock = useEffectiveLock(locked);
  const availability = useModuleAvailability();
  const openSettingsAt = useUi((state) => state.openSettingsAt);

  const select = (module: WorkspaceModuleId) => setActiveModule(workspace, device, 'dock', module);

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!wide) return;
    const startX = event.clientX;
    const startWidth = arrangement.dockWidth;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      setDockWidth(workspace, device, startWidth + startX - next.clientX);
    /*
      `pointerup` and `pointercancel` both end the drag, and `done` removes
      itself. The previous version left `done` registered and ignored
      `pointercancel`, so a drag interrupted by a browser gesture left a live
      `pointermove` listener resizing the dock on every subsequent mouse move.
    */
    const done = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', done);
      target.removeEventListener('pointercancel', done);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', done);
    target.addEventListener('pointercancel', done);
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 16;
    let width: number;
    switch (event.key) {
      case 'ArrowLeft':
        width = arrangement.dockWidth + step;
        break;
      case 'ArrowRight':
        width = arrangement.dockWidth - step;
        break;
      case 'Home':
        width = DOCK_WIDTH_MAX;
        break;
      case 'End':
        width = DOCK_WIDTH_MIN;
        break;
      default:
        return;
    }
    event.preventDefault();
    setDockWidth(workspace, device, width);
  };

  if (arrangement.dockCollapsed) {
    return (
      <aside
        className={cn(
          'flex shrink-0 items-center justify-center border-line-subtle bg-surface-1',
          wide ? 'w-11 border-l' : 'h-11 border-t',
          className,
        )}
      >
        <IconButton
          label="Open workspace tools"
          onClick={() => setDockCollapsed(workspace, device, false)}
        >
          <Database />
        </IconButton>
      </aside>
    );
  }

  /*
    Phase 82: on a desk-width screen the notation is not a tab. It is the
    first section of the panel, always on screen above whichever tool is
    chosen — the move list and the evidence about it read together, as in
    any Mac chess application. Phase 87 extended that from screens 860px tall
    to any with room for both (600px): under the board on a laptop-height
    window it had been a 63px strip. On a phone the dock is one sheet and the
    notation is a tab in it.
  */
  const stackNotation =
    wide && roomForNotation && withMoveTree && dockModules.includes('move-tree');
  const toolModules = stackNotation ? dockModules.filter((id) => id !== 'move-tree') : dockModules;
  const shownTool =
    stackNotation && activeDock === 'move-tree' ? (toolModules[0] ?? null) : activeDock;
  // A research desk renders each tool once. Choosing Engine uses its normal
  // full panel; moving it elsewhere or narrowing the window folds the split.
  const splitEngine =
    wide &&
    roomForNotation &&
    arrangement.dockEngine &&
    dockModules.includes('engine') &&
    shownTool !== 'engine';

  const tabs = toolModules.map((id) => ({
    id,
    label: moduleLabel(id, contextLabel),
    unavailable: id === 'move-tree' ? null : availability(id as WorkspaceToolId),
  }));

  return (
    <aside
      className={cn(
        'relative flex min-h-0 min-w-0 shrink-0 flex-col bg-surface-1',
        wide ? 'border-l border-line-subtle' : 'min-h-[360px] border-t border-line-subtle',
        className,
      )}
      style={wide && !fill ? { width: arrangement.dockWidth } : undefined}
      aria-label="Workspace tools"
      data-workspace-dock={workspace}
    >
      {wide && !fill ? (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize workspace tools"
          aria-orientation="vertical"
          aria-valuemin={DOCK_WIDTH_MIN}
          aria-valuemax={DOCK_WIDTH_MAX}
          aria-valuenow={arrangement.dockWidth}
          aria-valuetext={`${arrangement.dockWidth} pixels`}
          onPointerDown={resize}
          onKeyDown={resizeWithKeyboard}
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none hover:bg-accent/15 focus-visible:bg-accent/20"
        />
      ) : (
        <div className="mx-auto my-1 h-1 w-12 rounded-full bg-line-strong" aria-hidden />
      )}
      {stackNotation ? (
        <NotationSection
          workspace={workspace}
          share={tall ? 'tall' : 'short'}
          compact={Boolean(splitEngine)}
          moveTreePanel={moveTreePanel}
          onMove={(region) => moveModuleTo(workspace, device, 'move-tree', region)}
        />
      ) : null}
      <ModuleTabStrip
        tabs={tabs}
        /*
          The route's own context panel — Journal on Review, Opening tree on
          Preparation, References on Studies — is always in the strip. It is
          the reason that route exists, and putting the most important tab on
          a page behind a More menu is the discoverability failure §26 is
          about, not a cure for it.
        */
        visible={[
          ...(dockModules.includes('document') ? (['document'] as WorkspaceModuleId[]) : []),
          /*
            Phase 72: this order is also the strip's priority when the row is
            too narrow for everything. The lower panel's content — the Move
            Tree, on a phone — outranks a pinned tool: it is the notation.
          */
          ...foldedFromLower,
          /*
            Phase 82: the notation's home is the dock, so on a phone it is no
            longer "folded from the lower panel" — but it is still the
            notation, and it keeps the place in the row it had there.
          */
          ...(!stackNotation && toolModules.includes('move-tree')
            ? (['move-tree'] as WorkspaceModuleId[])
            : []),
          ...(pinned as readonly WorkspaceModuleId[]),
        ]}
        value={shownTool}
        onChange={select}
        actions={
          <>
            <WorkspaceLayoutMenu
              workspace={workspace}
              contextLabel={contextLabel}
              view={view}
              activeTool={shownTool}
            />
            <button
              type="button"
              onClick={() => setDockCollapsed(workspace, device, true)}
              className="w-6 shrink-0 border-l border-line-subtle text-lg text-tertiary transition-colors hover:bg-surface-2 hover:text-primary active:bg-surface-press"
              aria-label="Collapse workspace tools"
            >
              {wide ? '›' : '⌄'}
            </button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <RegionBody
          module={shownTool}
          contextLabel={contextLabel}
          contextPanel={contextPanel}
          moveTreePanel={moveTreePanel}
          lock={effectiveLock}
          unavailable={
            shownTool && shownTool !== 'move-tree'
              ? availability(shownTool as WorkspaceToolId)
              : null
          }
          onClose={() => {
            const first = toolModules[0];
            if (first) select(first);
          }}
          onDiagnostics={() => openSettingsAt('diagnostics')}
        />
      </div>
      {splitEngine ? (
        <section
          aria-label="Engine candidates"
          className="h-[240px] min-h-0 shrink-0 border-t border-line-subtle"
          data-research-engine
        >
          <RegionBody
            module="engine"
            compactEngine
            contextLabel={contextLabel}
            lock={effectiveLock}
            unavailable={availability('engine')}
            onClose={() => select('engine')}
            onDiagnostics={() => openSettingsAt('diagnostics')}
          />
        </section>
      ) : null}
    </aside>
  );
}

/**
 * The body of one region: whichever module it shows, or the reason it cannot.
 *
 * Shared by the dock and the lower panel so a module behaves identically
 * wherever it has been moved to — the whole point of a placement model is
 * that moving a panel does not change what it does.
 */
export function RegionBody({
  module,
  contextLabel,
  contextPanel,
  moveTreePanel,
  lock,
  unavailable,
  onClose,
  onDiagnostics,
  compactEngine = false,
}: {
  readonly module: WorkspaceModuleId | null;
  readonly contextLabel: string;
  readonly contextPanel?: ReactNode;
  readonly moveTreePanel?: ReactNode;
  readonly lock?: WorkspaceLock;
  readonly unavailable: string | null;
  readonly onClose: () => void;
  readonly onDiagnostics: () => void;
  readonly compactEngine?: boolean;
}) {
  if (!module) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-tertiary">
        No tools are placed here. Move one in from the layout menu.
      </div>
    );
  }

  const withheld =
    lock &&
    module !== 'document' &&
    module !== 'move-tree' &&
    !(lock.except ?? []).includes(module as WorkspaceToolId);

  if (withheld) return <LockedTool message={lock.message} action={lock.action} />;

  // Availability is reported in the body rather than by hiding the tab, so a
  // user looking for the tablebase finds it and learns the rule. §29.
  if (unavailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="max-w-[34ch] text-xs leading-relaxed text-secondary">{unavailable}</p>
      </div>
    );
  }

  return (
    /*
      Keyed by module so switching tabs resets a boundary that has caught: a
      tool that failed once should be tried again on its own next visit rather
      than staying broken until the whole dock remounts.

      The tab strip is outside the boundary on purpose — it has to survive so
      the user can leave a tool that will not load. §36.
    */
    <ErrorBoundary
      key={module}
      label={moduleLabel(module, contextLabel)}
      onClose={onClose}
      closeLabel="Close tool"
      onDiagnostics={onDiagnostics}
    >
      {module === 'move-tree' ? (
        (moveTreePanel ?? null)
      ) : (
        <ToolContent
          tool={module as WorkspaceToolId}
          contextPanel={contextPanel}
          compactEngine={compactEngine}
        />
      )}
    </ErrorBoundary>
  );
}

function LockedTool({
  message,
  action,
}: {
  readonly message: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      role="status"
    >
      <span aria-hidden className="text-xl text-tertiary/60">
        ◔
      </span>
      <p className="max-w-[34ch] text-xs leading-relaxed text-secondary">{message}</p>
      {action}
    </div>
  );
}

/**
 * Presets, saved layouts, panel moves, pinning and reset — in one menu.
 *
 * All of it in one place because these are the same kind of decision ("what
 * is on my screen"), and because §8 asks that recovering from a bad layout
 * never require clearing localStorage by hand. Reset is two clicks from
 * anywhere a layout can be broken.
 */
/**
 * The layout menu: presets, moving and pinning the shown tool, saved layouts.
 *
 * Until Phase 87 this was a row of its own above the tool tabs — "Layout
 * Analysis ▾ … 22 tools" — 36px of every dock's height spent on a control
 * used rarely and a count nobody acts on. It is now one icon at the end of
 * the tab row; its accessible name still says which layout is in force.
 */
function WorkspaceLayoutMenu({
  workspace,
  contextLabel,
  view,
  activeTool,
}: {
  readonly workspace: string;
  readonly contextLabel: string;
  readonly view: ReturnType<typeof useWorkspaceArrangement>;
  /** The tool the strip shows, which is not the notation when it is stacked. */
  readonly activeTool: WorkspaceModuleId | null;
}) {
  const { device, arrangement } = view;
  const activeDock = activeTool;
  const setPreset = useWorkspaceLayout((state) => state.setPreset);
  const moveModuleTo = useWorkspaceLayout((state) => state.moveModuleTo);
  const resetWorkspace = useWorkspaceLayout((state) => state.resetWorkspace);
  const saveLayout = useWorkspaceLayout((state) => state.saveLayout);
  const applyLayout = useWorkspaceLayout((state) => state.applyLayout);
  const deleteLayout = useWorkspaceLayout((state) => state.deleteLayout);
  const savedLayouts = useWorkspaceLayout((state) => state.savedLayouts);
  const togglePinned = useWorkspaceLayout((state) => state.togglePinned);
  const pinned =
    useWorkspaceLayout((state) => state.pinnedTools[workspace]) ?? DEFAULT_PINNED_TOOLS;
  const preset = useWorkspaceLayout((state) => state.preset);
  const [saving, setSaving] = useState(false);

  const movable = activeDock
    ? activeDock === 'move-tree'
      ? MOVE_TREE_MODULE.regions
      : WORKSPACE_MODULES[activeDock as WorkspaceToolId].regions
    : [];
  const otherRegions = movable.filter((region) => region !== 'dock');

  const sections: MenuSection[] = [
    {
      id: 'presets',
      items: WORKSPACE_PRESETS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        run: () => setPreset(workspace, device, entry.id),
      })),
    },
  ];

  if (activeDock && otherRegions.length > 0) {
    sections.push({
      id: 'move',
      items: otherRegions.map((region) => ({
        id: `move-${region}`,
        label: `Move ${moduleLabel(activeDock, contextLabel)} to ${REGION_NAMES[region]}`,
        run: () => moveModuleTo(workspace, device, activeDock, region),
      })),
    });
  }

  if (activeDock && activeDock !== 'move-tree') {
    sections.push({
      id: 'pin',
      items: [
        {
          id: 'pin-toggle',
          label: pinned.includes(activeDock as WorkspaceToolId)
            ? `Unpin ${moduleLabel(activeDock, contextLabel)}`
            : `Pin ${moduleLabel(activeDock, contextLabel)}`,
          run: () => togglePinned(workspace, activeDock as WorkspaceToolId),
        },
      ],
    });
  }

  if (savedLayouts.length > 0) {
    sections.push({
      id: 'saved',
      items: savedLayouts.flatMap((entry) => [
        {
          id: entry.id,
          label: entry.name,
          run: () => applyLayout(entry.id, workspace, device),
        },
      ]),
    });
  }

  sections.push({
    id: 'manage',
    items: [
      { id: 'save', label: 'Save layout as…', run: () => setSaving(true) },
      ...savedLayouts.map((entry) => ({
        id: `delete-${entry.id}`,
        label: `Delete “${entry.name}”`,
        danger: true,
        run: () => deleteLayout(entry.id),
      })),
      {
        id: 'reset',
        label: 'Reset layout',
        danger: true,
        run: () => resetWorkspace(workspace, device),
      },
    ],
  });

  const presetLabel = WORKSPACE_PRESETS.find((entry) => entry.id === preset)?.label ?? 'Custom';
  // A dock whose arrangement differs from the preset it was seeded from should
  // not go on claiming to be that preset.
  const modified = Object.keys(arrangement.placement).length > 0 || arrangement.dockCollapsed;

  const layoutName = modified ? `${presetLabel} (modified)` : presetLabel;

  return (
    <>
      <Menu
        sections={sections}
        align="end"
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            id={id}
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`Layout: ${layoutName}`}
            title={`Layout: ${layoutName}`}
            data-layout-menu
            className="flex h-full w-6 shrink-0 items-center justify-center border-l border-line-subtle text-tertiary transition-colors hover:bg-surface-2 hover:text-primary active:bg-surface-press"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        )}
      />
      <PromptDialog
        open={saving}
        title="Save layout"
        description="Panel placement and sizes only — never which document or position is open."
        label="Name"
        placeholder="Tournament Prep"
        confirmLabel="Save layout"
        onSubmit={(value) => {
          saveLayout(value, workspace, device);
          setSaving(false);
        }}
        onCancel={() => setSaving(false)}
      />
    </>
  );
}

const REGION_NAMES: Record<WorkspaceRegion, string> = {
  dock: 'the side dock',
  lower: 'the lower panel',
  primary: 'the board column',
};

const NOTATION_FOLDED_KEY = 'kingfisher.notation-folded';
const notationFoldedListeners = new Set<() => void>();

function readNotationFolded(): boolean {
  try {
    return window.localStorage.getItem(NOTATION_FOLDED_KEY) === 'true';
  } catch {
    // Storage refused: the section is open, which is the default.
    return false;
  }
}

function writeNotationFolded(value: boolean): void {
  try {
    window.localStorage.setItem(NOTATION_FOLDED_KEY, String(value));
  } catch {
    // Not remembered, and so not folded: the one state storage can hold.
  }
  for (const listener of notationFoldedListeners) listener();
}

function subscribeNotationFolded(listener: () => void): () => void {
  notationFoldedListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    notationFoldedListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * The notation, as the first section of the side panel.
 *
 * A disclosure rather than a tab: folding it gives the tools below the whole
 * height, and opening it again brings back the same list at the same move.
 * Whether it is folded is remembered per browser — a view preference, not a
 * workspace arrangement, so it is not carried in a saved layout or a backup.
 */
function NotationSection({
  workspace,
  share,
  moveTreePanel,
  onMove,
  compact = false,
}: {
  readonly workspace: string;
  /** A laptop-height window gives the notation a third of the column, not two fifths. */
  readonly share: 'tall' | 'short';
  readonly moveTreePanel?: ReactNode;
  readonly onMove: (region: WorkspaceRegion) => void;
  readonly compact?: boolean;
}) {
  const folded = useSyncExternalStore(subscribeNotationFolded, readNotationFolded, () => false);
  const toggle = () => writeNotationFolded(!folded);
  const Chevron = folded ? ChevronRight : ChevronDown;

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col border-b border-line-subtle',
        folded
          ? 'shrink-0'
          : compact
            ? 'min-h-[140px] flex-[0_0_22%]'
            : share === 'tall'
              ? 'min-h-[160px] flex-[0_0_38%]'
              : 'min-h-[140px] flex-[0_0_34%]',
      )}
      aria-label="Notation"
      data-notation-section={workspace}
      data-folded={folded ? 'true' : undefined}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 px-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!folded}
          className="-ml-1 flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-control)] px-1 text-left text-xs font-semibold text-primary hover:bg-surface-2"
        >
          <Chevron className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          Notation
        </button>
        <Menu
          align="end"
          sections={[
            {
              id: 'move',
              items: [
                {
                  id: 'move-lower',
                  label: 'Move Notation to the lower panel',
                  run: () => onMove('lower'),
                },
                {
                  id: 'move-primary',
                  label: 'Move Notation to the board column',
                  run: () => onMove('primary'),
                },
              ],
            },
          ]}
          trigger={({ toggle: open, open: isOpen, id }) => (
            <button
              type="button"
              id={id}
              onClick={open}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              aria-label="Move the notation"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-sm text-tertiary transition-colors hover:bg-surface-2 hover:text-primary active:bg-surface-press"
            >
              ⋯
            </button>
          )}
        />
      </div>
      {folded ? null : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary label="The move list">{moveTreePanel ?? null}</ErrorBoundary>
        </div>
      )}
    </section>
  );
}
