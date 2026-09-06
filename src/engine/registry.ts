/**
 * Which engines this build knows about.
 *
 * An engine appears here only if Kingfisher can actually start it, drive it and
 * stop it. There is no aspirational entry and no greyed-out placeholder for
 * something that might work later: a selector listing an engine that cannot run
 * is worse than a shorter selector, because the user spends their time finding
 * out rather than analysing.
 *
 * `stockfish-wasm` always exists — it needs nothing but the browser. The native
 * ones are discovered from the companion at runtime, because what is installed
 * is a property of the machine and not of this file.
 */

import { CompanionEngineProvider } from './companion/provider';
import { StockfishWasmProvider } from './stockfish/provider';
import type { EngineProvider } from './types';

/**
 * How an engine searches. Shown to the user, because it explains disagreement.
 *
 * `'unknown'` is for a custom-registered engine: this build has never seen it
 * before and has no source to read a search paradigm from, so it is left
 * unstated rather than guessed. A wrong guess here is worse than a blank,
 * because it would misrepresent *why* two engines disagree.
 */
export type EngineFamily = 'alphabeta' | 'neural' | 'unknown';

export interface EngineDefinition {
  readonly id: string;
  readonly name: string;
  readonly family: EngineFamily;
  readonly transport: 'worker' | 'native';
  readonly license: string;
  readonly source: string;
  readonly notes?: string;
  /**
   * Companion platform identifiers this engine publishes a build for.
   *
   * Absent means "anywhere" — the browser engine, and any engine the user
   * registered by path. Present and not matching means the selector should
   * not offer it here; see `setEnginePlatform`.
   */
  readonly platforms?: readonly string[];
  readonly provider: EngineProvider;
}

const STOCKFISH_WASM: EngineDefinition = {
  id: 'stockfish-wasm',
  name: 'Stockfish 18',
  family: 'alphabeta',
  transport: 'worker',
  license: 'GPL-3.0-or-later',
  source: 'https://github.com/official-stockfish/Stockfish',
  notes: 'WebAssembly. Runs in the browser with no companion.',
  provider: new StockfishWasmProvider(),
};

/** Definitions for the native engines the installer knows how to install. */
const NATIVE: readonly Omit<EngineDefinition, 'provider'>[] = [
  {
    id: 'lc0',
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'],
    name: 'Lc0',
    family: 'neural',
    transport: 'native',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/LeelaChessZero/lc0',
    notes: 'Neural network with Monte-Carlo search. Judges positions differently to Stockfish.',
  },
  {
    id: 'stormphrax',
    platforms: ['darwin-arm64', 'linux-x64', 'win32-x64'],
    name: 'Stormphrax 8',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/Ciekce/Stormphrax',
    notes: 'Reports win/draw/loss alongside its evaluation.',
  },
  {
    id: 'stockfish-native',
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'],
    name: 'Stockfish 18 (native)',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/official-stockfish/Stockfish',
    notes: 'Native Stockfish 18. Performance depends on the machine and analysis settings.',
  },
  {
    id: 'viridithas',
    platforms: ['darwin-arm64', 'linux-x64', 'linux-arm64', 'win32-x64'],
    name: 'Viridithas 20',
    family: 'alphabeta',
    transport: 'native',
    license: 'AGPL-3.0-only',
    source: 'https://github.com/cosmobobak/viridithas',
    notes: 'An independent NNUE engine written in Rust, with its own evaluation.',
  },
  {
    id: 'halogen',
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'],
    name: 'Halogen 16',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/KierenP/Halogen',
    notes: 'A compact independent engine; the smallest native download in the catalogue.',
  },
  {
    id: 'plentychess',
    platforms: ['darwin-arm64', 'linux-arm64', 'linux-x64', 'win32-x64'],
    name: 'PlentyChess 8',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0',
    source: 'https://github.com/Yoshie2000/PlentyChess',
    notes: 'An actively developed independent NNUE engine with portable release builds.',
  },
  {
    id: 'berserk',
    platforms: ['win32-x64'],
    name: 'Berserk 14',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0',
    source: 'https://github.com/jhonnold/berserk',
    notes: 'Official Windows release. Capabilities are measured at installation.',
  },
  {
    id: 'koivisto',
    platforms: ['linux-x64', 'win32-x64'],
    name: 'Koivisto 9.0',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0',
    source: 'https://github.com/Luecx/Koivisto',
    notes: 'Historical stable 2023 release; not an actively updated engine.',
  },
  {
    id: 'obsidian',
    platforms: ['win32-x64'],
    name: 'Obsidian 16.0',
    family: 'alphabeta',
    transport: 'native',
    license: 'GPL-3.0',
    source: 'https://github.com/gab8192/Obsidian',
    notes: 'Windows AVX2 release. Installation requires confirmed CPU support.',
  },
];

const definitions = new Map<string, EngineDefinition>([[STOCKFISH_WASM.id, STOCKFISH_WASM]]);
for (const entry of NATIVE) {
  definitions.set(entry.id, { ...entry, provider: new CompanionEngineProvider(entry) });
}

/**
 * Which of the catalogue's engines this machine could actually run.
 *
 * Three of the engines in `NATIVE` publish Windows-only builds. Listing them
 * in a selector on a Mac is offering a choice that cannot be made: picking one
 * gets an error, and the row was never anything but noise. So the selector
 * asks the companion what platform it is on and drops the engines with no
 * build for it. `engineDefinition(id)` is deliberately *not* filtered — an
 * analysis already running under an engine must not become nameless because
 * the profile moved between machines.
 */
let runnableHere: ReadonlySet<string> | null = null;

export function setEnginePlatform(platform: string | null): void {
  runnableHere =
    platform === null
      ? null
      : new Set(
          [STOCKFISH_WASM, ...NATIVE]
            .filter((entry) => !entry.platforms || entry.platforms.includes(platform))
            .map((entry) => entry.id),
        );
}

/** Ids added by `syncCustomEngineDefinitions`, so a routine refresh knows what it owns. */
const customIds = new Set<string>();

export interface DiscoveredCustomEngine {
  readonly id: string;
  readonly name: string;
  readonly license?: string;
  readonly author?: string;
}

/**
 * Engines registered through Settings → Companion, as reported by the
 * companion's own `/status`.
 *
 * Mirrors `setDynamicDatabaseProviders`: what is registered is a property of
 * the machine and is discovered at runtime, not declared in this file. An id
 * that is no longer reported (unregistered, or the companion swapped) is
 * removed; one still reported but already present is left alone, so a live
 * session's provider is never replaced out from under it by a routine
 * status refresh.
 */
export function syncCustomEngineDefinitions(entries: readonly DiscoveredCustomEngine[]): void {
  const seen = new Set(entries.map((entry) => entry.id));
  for (const id of [...customIds]) {
    if (seen.has(id)) continue;
    definitions.delete(id);
    customIds.delete(id);
  }
  for (const entry of entries) {
    customIds.add(entry.id);
    if (definitions.has(entry.id)) continue;
    definitions.set(entry.id, {
      id: entry.id,
      name: entry.name,
      family: 'unknown',
      transport: 'native',
      license: entry.license ?? 'Unknown — not declared by the engine or the user.',
      source: 'Registered locally through Settings → Companion.',
      notes: entry.author
        ? `By ${entry.author}. Capabilities are read from its own UCI options, the same as any other engine.`
        : 'Capabilities are read from its own UCI options, the same as any other engine.',
      provider: new CompanionEngineProvider({
        id: entry.id,
        name: entry.name,
        license: entry.license,
      }),
    });
  }
}

export const engineDefinitions = (): readonly EngineDefinition[] => [...definitions.values()];

/**
 * The engines worth offering on this machine.
 *
 * Everything the companion has never told us about is kept: a custom engine
 * the user registered by path, and every engine at all before the companion
 * has answered. Silence is not evidence that an engine cannot run.
 */
export const runnableEngineDefinitions = (): readonly EngineDefinition[] =>
  [...definitions.values()].filter(
    (entry) => runnableHere === null || customIds.has(entry.id) || runnableHere.has(entry.id),
  );

export const engineDefinition = (id: string): EngineDefinition | undefined => definitions.get(id);

export const engineProviders = (): readonly EngineProvider[] =>
  [...definitions.values()].map((entry) => entry.provider);

export const defaultEngineProvider = (): EngineProvider => STOCKFISH_WASM.provider;

export const DEFAULT_ENGINE_ID = STOCKFISH_WASM.id;

export const engineProviderById = (id: string): EngineProvider | undefined =>
  definitions.get(id)?.provider;
