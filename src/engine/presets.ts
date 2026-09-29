/**
 * Analysis presets.
 *
 * Browsers run on everything from a phone to a workstation, so the presets
 * choose conservatively and scale threads to what the machine actually reports
 * rather than assuming. A preset is a starting point the user can override;
 * "Custom" exists so overriding does not silently masquerade as a preset.
 *
 * Depth and time are deliberately left infinite for everything but Quick. A
 * study board is not a correspondence server: the user watches the search and
 * stops it, and a hard depth cap mostly means the engine stops thinking while
 * they are still looking at the position.
 */

import type { AnalysisLimit } from './types';

export type EnginePresetId = 'quick' | 'standard' | 'deep' | 'custom';

export interface EnginePreset {
  readonly id: EnginePresetId;
  readonly name: string;
  readonly description: string;
  readonly multiPv: number;
  readonly hashMb: number;
  /** Fraction of reported cores to use, clamped by `maxThreads`. */
  readonly threadShare: number;
  readonly limit: AnalysisLimit;
}

export const ENGINE_PRESETS: readonly EnginePreset[] = [
  {
    id: 'quick',
    name: 'Quick',
    description: 'A fast opinion while moving through a game.',
    multiPv: 2,
    hashMb: 32,
    threadShare: 0.25,
    limit: { kind: 'movetime', ms: 2_000 },
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Three lines, running until you stop it.',
    multiPv: 3,
    hashMb: 64,
    threadShare: 0.5,
    limit: { kind: 'infinite' },
  },
  {
    id: 'deep',
    name: 'Deep',
    description: 'Five lines and a large hash, for a critical position.',
    multiPv: 5,
    hashMb: 256,
    threadShare: 0.75,
    limit: { kind: 'infinite' },
  },
];

export const enginePreset = (id: EnginePresetId): EnginePreset | null =>
  ENGINE_PRESETS.find((preset) => preset.id === id) ?? null;

/**
 * The three values a preset owns, and the only ones it owns.
 *
 * Threads are deliberately not here: `resolveThreads` scales them to the
 * machine, so a preset exported on a 16-core workstation and imported on a
 * four-core laptop cannot agree about threads without one of them lying.
 */
export interface PresetOwnedValues {
  readonly multiPv: number;
  readonly hashMb: number;
  readonly limit: AnalysisLimit;
}

/**
 * Does this preset still describe these values?
 *
 * `kind: 'infinite'` and `kind: 'infinite'` are the same limit; anything else
 * must match on its own terms, so "infinite" and "3000 nodes" are different
 * choices and a preset that named one cannot be said to describe the other.
 */
export function presetDescribes(preset: EnginePreset, values: PresetOwnedValues): boolean {
  if (preset.multiPv !== values.multiPv) return false;
  if (preset.hashMb !== values.hashMb) return false;
  if (preset.limit.kind !== values.limit.kind) return false;
  if (preset.limit.kind === 'infinite' && values.limit.kind === 'infinite') return true;
  return JSON.stringify(preset.limit) === JSON.stringify(values.limit);
}

/**
 * Keep the preset honest when preferences are written wholesale.
 *
 * A preset is a *label* for the values, not a second source of truth: every
 * control that changes MultiPV, hash or the limit sets the preset to `custom`
 * for exactly that reason, and Settings says so in as many words — "The value
 * is always what the engine runs with; a preset only fills it in."
 *
 * Settings import was the one path that wrote preferences without holding to
 * that, so a file naming `deep` while carrying a one-thread, two-line engine
 * left the dialog reading **Deep** over settings that were not Deep. Nothing in
 * the interface could tell the user their engine was not configured as the
 * preset beside it said. The label is corrected here, at the boundary, using
 * the values that will actually be in force: the incoming ones where the file
 * supplies them, this machine's defaults where it does not.
 *
 * Threads are not consulted, for the reason above.
 */
export function reconcileEnginePreset(
  incoming: Readonly<Record<string, unknown>>,
  defaults: PresetOwnedValues,
): Record<string, unknown> {
  const declared = incoming.enginePreset;
  if (typeof declared !== 'string') return { ...incoming };
  if (declared === 'custom') return { ...incoming };
  const preset = enginePreset(declared as EnginePresetId);
  // A preset this build has never heard of keeps whatever it was: refusing to
  // invent a meaning for it is better than guessing at one.
  if (!preset) return { ...incoming };

  const effective: PresetOwnedValues = {
    multiPv: typeof incoming.engineMultiPv === 'number' ? incoming.engineMultiPv : defaults.multiPv,
    hashMb: typeof incoming.engineHashMb === 'number' ? incoming.engineHashMb : defaults.hashMb,
    limit:
      incoming.engineLimit && typeof incoming.engineLimit === 'object'
        ? (incoming.engineLimit as AnalysisLimit)
        : defaults.limit,
  };

  if (presetDescribes(preset, effective)) return { ...incoming };
  return { ...incoming, enginePreset: 'custom' };
}

/**
 * Threads for a preset on this machine.
 *
 * Always leaves a core for the interface: an engine that saturates every core
 * makes the board stutter, and a stuttering board is worse than a slightly
 * slower search.
 */
export function resolveThreads(preset: EnginePreset, cores: number, maxThreads: number): number {
  const usable = Math.max(1, Math.min(cores, maxThreads));
  const share = Math.floor(usable * preset.threadShare);
  return Math.max(1, Math.min(share, usable - 1 || 1, maxThreads));
}

export function detectCores(): number {
  if (typeof navigator === 'undefined') return 1;
  const reported = navigator.hardwareConcurrency;
  return Number.isFinite(reported) && reported > 0 ? Math.floor(reported) : 1;
}
