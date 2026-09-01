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
