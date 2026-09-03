'use client';

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { Menu, type MenuSection } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import type { WorkspaceModuleId } from './layout-model';
import { MOVE_TREE_MODULE, WORKSPACE_MODULES, type WorkspaceToolId } from './modules';
import { ModuleTabStrip } from './ModuleTabStrip';
import { useModuleAvailability } from './use-module-availability';
import { useWorkspaceArrangement } from './use-arrangement';
import { moduleLabel, RegionBody, useEffectiveLock, type WorkspaceLock } from './WorkspaceToolDock';

/**
 * The optional panel beneath the board.
 *
 * The second of the two regions a module can be moved to, and the reason
 * "move Engine out of the dock" is a real answer rather than a hidden setting.
 * It renders nothing at all when empty, so a workspace nobody has rearranged
 * looks exactly as it did before this existed.
 */
export function WorkspaceLowerPanel({
  workspace,
  contextLabel = 'Context',
  contextPanel,
  locked,
  withMoveTree = false,
  moveTreePanel,
  className,
}: {
  readonly workspace: string;
  readonly contextLabel?: string;
  readonly contextPanel?: ReactNode;
  readonly locked?: WorkspaceLock;
  readonly withMoveTree?: boolean;
  readonly moveTreePanel?: ReactNode;
  readonly className?: string;
}) {
  const view = useWorkspaceArrangement(workspace, { withMoveTree });
  const { device, wide, arrangement, lowerModules, activeLower } = view;
  const setActiveModule = useWorkspaceLayout((state) => state.setActiveModule);
  const setLowerHeight = useWorkspaceLayout((state) => state.setLowerHeight);
  const moveModuleTo = useWorkspaceLayout((state) => state.moveModuleTo);
  const effectiveLock = useEffectiveLock(locked);
  const availability = useModuleAvailability();
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const [dragging, setDragging] = useState(false);

  // On a narrow screen the lower panel's modules are folded into the dock, so
  // there is nothing left for this to render. §9: collapse intelligently
  // rather than reproduce desktop geometry on a phone.
  if (!wide || lowerModules.length === 0) return null;

  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = event.clientY;
    const startHeight = arrangement.lowerHeight;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (next: PointerEvent) =>
      setLowerHeight(workspace, device, startHeight + startY - next.clientY);
    const done = () => {
      setDragging(false);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', done);
      target.removeEventListener('pointercancel', done);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', done);
    target.addEventListener('pointercancel', done);
  };

  const tabs = lowerModules.map((id) => ({
    id,
    label: moduleLabel(id, contextLabel),
    unavailable: id === 'move-tree' ? null : availability(id as WorkspaceToolId),
  }));

  const moveSections: readonly MenuSection[] = activeLower
    ? [
        {
          id: 'move',
          items: (activeLower === 'move-tree'
            ? MOVE_TREE_MODULE.regions
            : WORKSPACE_MODULES[activeLower as WorkspaceToolId].regions
          )
            .filter((region) => region !== 'lower')
            .map((region) => ({
              id: region,
              label:
                region === 'dock'
                  ? `Move ${moduleLabel(activeLower, contextLabel)} to the side dock`
                  : `Move ${moduleLabel(activeLower, contextLabel)} to the board column`,
              run: () => moveModuleTo(workspace, device, activeLower, region),
            })),
        },
      ]
    : [];

  return (
    <section
      className={cn(
        'relative flex shrink-0 flex-col border-t border-line-subtle bg-surface-1',
        className,
      )}
      style={{ height: arrangement.lowerHeight }}
      aria-label="Lower workspace panel"
      data-workspace-lower={workspace}
    >
      <button
        type="button"
        aria-label="Resize the lower panel"
        onPointerDown={resize}
        className={cn(
          'absolute inset-x-0 -top-1 z-20 h-2 cursor-row-resize touch-none',
          dragging && 'bg-accent/30',
        )}
      />
      <ModuleTabStrip
        tabs={tabs}
        visible={lowerModules}
        value={activeLower}
        onChange={(module: WorkspaceModuleId) =>
          setActiveModule(workspace, device, 'lower', module)
        }
        actions={
          moveSections.length > 0 && moveSections[0]!.items.length > 0 ? (
            <Menu
              align="end"
              sections={moveSections}
              trigger={({ toggle, open, id }) => (
                <button
                  type="button"
                  id={id}
                  onClick={toggle}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  aria-label="Move this panel"
                  className="w-9 shrink-0 border-l border-line-subtle text-sm text-tertiary hover:bg-surface-2 hover:text-primary"
                >
                  ⋯
                </button>
              )}
            />
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <RegionBody
          module={activeLower}
          contextLabel={contextLabel}
          contextPanel={contextPanel}
          moveTreePanel={moveTreePanel}
          lock={effectiveLock}
          unavailable={
            activeLower && activeLower !== 'move-tree'
              ? availability(activeLower as WorkspaceToolId)
              : null
          }
          onClose={() => {
            const first = lowerModules[0];
            if (first) setActiveModule(workspace, device, 'lower', first);
          }}
          onDiagnostics={() => openSettingsAt('diagnostics')}
        />
      </div>
    </section>
  );
}
