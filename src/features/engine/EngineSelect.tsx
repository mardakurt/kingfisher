'use client';

/**
 * The engine selector, for one slot.
 *
 * One component for the single-engine panel and for both columns of the
 * comparison, so the two cannot offer different lists. Until this existed the
 * one-engine panel had no selector at all — the engine could be changed only
 * by switching to Two engines, choosing there, and switching back — and the
 * comparison's selector listed every engine the build could drive, including
 * the ones this machine could not run, with nothing to say which was which.
 *
 * Every option says whether it can start here. A native engine needs the
 * companion and needs to be installed; the option says so instead of letting
 * the user pick it and read an error in the panel a moment later.
 */

import { useCompanionStatus } from '@/companion/useCompanion';
import { useVisibleEngineDefinitions } from '@/engine/use-engines';
import { cn } from '@/lib/cn';
import { useEngine, type SlotId } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

export function EngineSelect({
  slot,
  label,
  className,
}: {
  readonly slot: SlotId;
  readonly label: string;
  readonly className?: string;
}) {
  const engineId = useEngine((state) => state[slot].engineId);
  const selectEngine = useEngine((state) => state.selectEngine);
  const set = usePreferences((state) => state.set);
  const definitions = useVisibleEngineDefinitions();
  const companion = useCompanionStatus();
  const installed = new Set((companion.data?.engines ?? []).map((engine) => engine.id));
  const paired = companion.data !== undefined;

  return (
    <select
      aria-label={label}
      value={engineId}
      onChange={(event) => {
        void selectEngine(slot, event.target.value);
        set(slot === 'primary' ? 'primaryEngineId' : 'secondaryEngineId', event.target.value);
      }}
      data-engine-select={slot}
      className={cn(
        'h-6 min-w-0 max-w-full truncate rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary outline-none focus:border-accent/60',
        className,
      )}
    >
      {definitions.map((definition) => {
        const native = definition.transport === 'native';
        const note = !native
          ? ''
          : !paired
            ? ' — needs the companion'
            : installed.has(definition.id)
              ? ''
              : ' — not installed';
        return (
          <option key={definition.id} value={definition.id}>
            {definition.name}
            {note}
          </option>
        );
      })}
    </select>
  );
}
