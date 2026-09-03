'use client';

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { Database } from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { IconButton } from '@/components/ui/Button';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useCalculation } from '@/features/calculation/calculation-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import type { WorkspaceModuleId, WorkspaceRegion } from './layout-model';
import { MOVE_TREE_MODULE, WORKSPACE_MODULES, type WorkspaceToolId } from './modules';
import { ModuleTabStrip } from './ModuleTabStrip';
import { ToolContent } from './ToolContent';
import { useModuleAvailability } from './use-module-availability';
import { useWorkspaceArrangement } from './use-arrangement';
import { WORKSPACE_PRESETS } from './presets';

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
}) {
  const wide = useMediaQuery('(min-width: 1100px)');
  const view = useWorkspaceArrangement(workspace, { withMoveTree });
  const { device, arrangement, dockModules, activeDock, foldedFromLower } = view;
  const setActiveModule = useWorkspaceLayout((state) => state.setActiveModule);
  const setDockWidth = useWorkspaceLayout((state) => state.setDockWidth);
  const setDockCollapsed = useWorkspaceLayout((state) => state.setDockCollapsed);
  const pinned = useWorkspaceLayout((state) => state.pinnedTools[workspace]) ?? DEFAULT_PINNED;
  const effectiveLock = useEffectiveLock(locked);
  const availability = useModuleAvailability();
  const openSettingsAt = useUi((state) => state.openSettingsAt);

  const select = (module: WorkspaceModuleId) => setActiveModule(workspace, device, 'dock', module);

  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
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

  const tabs = dockModules.map((id) => ({
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
        <button
          type="button"
          aria-label="Resize workspace tools"
          onPointerDown={resize}
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none"
        />
      ) : (
        <div className="mx-auto my-1 h-1 w-12 rounded-full bg-line-strong" aria-hidden />
      )}
      <WorkspaceLayoutBar workspace={workspace} contextLabel={contextLabel} view={view} />
      <ModuleTabStrip
        tabs={tabs}
        visible={[...(pinned as readonly WorkspaceModuleId[]), ...foldedFromLower]}
        value={activeDock}
        onChange={select}
        actions={
          <button
            type="button"
            onClick={() => setDockCollapsed(workspace, device, true)}
            className="w-9 shrink-0 border-l border-line-subtle text-lg text-tertiary hover:bg-surface-2 hover:text-primary"
            aria-label="Collapse workspace tools"
          >
            {wide ? '›' : '⌄'}
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <RegionBody
          module={activeDock}
          contextLabel={contextLabel}
          contextPanel={contextPanel}
          moveTreePanel={moveTreePanel}
          lock={effectiveLock}
          unavailable={
            activeDock && activeDock !== 'move-tree'
              ? availability(activeDock as WorkspaceToolId)
              : null
          }
          onClose={() => {
            const first = dockModules[0];
            if (first) select(first);
          }}
          onDiagnostics={() => openSettingsAt('diagnostics')}
        />
      </div>
    </aside>
  );
}

const DEFAULT_PINNED: readonly WorkspaceToolId[] = ['engine', 'explorer', 'notes'];

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
}: {
  readonly module: WorkspaceModuleId | null;
  readonly contextLabel: string;
  readonly contextPanel?: ReactNode;
  readonly moveTreePanel?: ReactNode;
  readonly lock?: WorkspaceLock;
  readonly unavailable: string | null;
  readonly onClose: () => void;
  readonly onDiagnostics: () => void;
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
        <ToolContent tool={module as WorkspaceToolId} contextPanel={contextPanel} />
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
function WorkspaceLayoutBar({
  workspace,
  contextLabel,
  view,
}: {
  readonly workspace: string;
  readonly contextLabel: string;
  readonly view: ReturnType<typeof useWorkspaceArrangement>;
}) {
  const { device, arrangement, available, activeDock } = view;
  const setPreset = useWorkspaceLayout((state) => state.setPreset);
  const moveModuleTo = useWorkspaceLayout((state) => state.moveModuleTo);
  const resetWorkspace = useWorkspaceLayout((state) => state.resetWorkspace);
  const saveLayout = useWorkspaceLayout((state) => state.saveLayout);
  const applyLayout = useWorkspaceLayout((state) => state.applyLayout);
  const deleteLayout = useWorkspaceLayout((state) => state.deleteLayout);
  const savedLayouts = useWorkspaceLayout((state) => state.savedLayouts);
  const togglePinned = useWorkspaceLayout((state) => state.togglePinned);
  const pinned = useWorkspaceLayout((state) => state.pinnedTools[workspace]) ?? DEFAULT_PINNED;
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

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-subtle px-2">
      <Menu
        sections={sections}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            id={id}
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex h-6 min-w-0 items-center gap-1.5 rounded-[4px] border border-line px-2 text-2xs text-secondary hover:bg-surface-2 hover:text-primary"
          >
            <span className="text-tertiary">Layout</span>
            <span className="truncate">{modified ? `${presetLabel} (modified)` : presetLabel}</span>
            <span aria-hidden className="text-[9px]">
              ▾
            </span>
          </button>
        )}
      />
      <span className="min-w-0 flex-1" />
      <span className="shrink-0 text-2xs text-tertiary tabular">{available.length} tools</span>
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
    </div>
  );
}

const REGION_NAMES: Record<WorkspaceRegion, string> = {
  dock: 'the side dock',
  lower: 'the lower panel',
  primary: 'the board column',
};
