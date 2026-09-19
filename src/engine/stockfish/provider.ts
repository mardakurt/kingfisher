/**
 * Stockfish compiled to WebAssembly, running in a Web Worker.
 *
 * The build is not bundled with the application: it is GPL-3.0 and ~7 MB, so
 * `npm run engine:install` downloads it into `public/engine/stockfish` and
 * writes a manifest. When the manifest is absent the provider reports itself
 * unavailable with the command to fix it — analysis is never faked.
 *
 * Two networks. The `lite` builds carry the small evaluation network and are
 * what every deployment has; the `full` builds carry Stockfish's full-size
 * network — the one the native binary runs — at 113 MB each, and are listed
 * only where `engine:install -- --full` recorded them (the web deployment;
 * not the Mac application, which has native Stockfish). Since Phase 72 their
 * `.wasm` is not served by the deployment: the manifest names a same-origin
 * bootstrap worker that fetches it from a recorded address with a recorded
 * SHA-256 as the request's integrity, so the deployment carries 36 KB of
 * worker script instead of 226 MB of network (see scripts/install-engine.mjs
 * for why that mattered). One provider instance serves one network, so the
 * registry can offer them as two engines and the engine store can treat them
 * as any other pair.
 */

import { parseOption, parseUciLine } from '../uci';
import {
  DEFAULT_ENGINE_CONFIGURATION,
  EngineError,
  type EngineAvailability,
  type EngineCapabilities,
  type EngineConfiguration,
  type EngineIdentity,
  type EngineOptionSpec,
  type EngineProvider,
  type EngineSession,
} from '../types';
import { UciSession } from '../uci-session';
import { UciWorkerClient } from './worker-client';

/** Which evaluation network a WebAssembly build carries. */
export type StockfishNetwork = 'lite' | 'full';

export interface EngineBuild {
  readonly id: string;
  readonly label: string;
  readonly script: string;
  readonly threads: boolean;
  /** Absent in manifests written before the full network existed: those are lite. */
  readonly network?: StockfishNetwork;
  /** The `.wasm` size, so the selector can say what choosing it downloads. */
  readonly bytes?: number;
  /** Where the `.wasm` is fetched from when it is not served by this origin. */
  readonly wasm?: string;
  /** The SHA-256 the browser holds those bytes to, as `fetch` integrity. */
  readonly sha256?: string;
}

export interface EngineManifest {
  readonly engine: string;
  readonly license: string;
  readonly builds: readonly EngineBuild[];
}

const MANIFEST_URL = '/engine/stockfish/manifest.json';

const INSTALL_HINT = 'Run `npm run engine:install` to download the Stockfish build.';
const FULL_INSTALL_HINT =
  'Run `npm run engine:install -- --full` to download the full-network build.';

const networkOf = (build: EngineBuild): StockfishNetwork => build.network ?? 'lite';

/**
 * How long the worker may take to answer `uci`.
 *
 * The lite build is 7 MB and answers in well under twenty seconds anywhere.
 * The full build is 113 MB: the first time it is chosen the browser has to
 * fetch and compile all of it, which is a couple of minutes on a slow line,
 * and a twenty-second handshake would report "did not respond" about an
 * engine that was still downloading. Later starts hit the HTTP cache.
 */
const HANDSHAKE_TIMEOUT_MS: Record<StockfishNetwork, number> = { lite: 20_000, full: 300_000 };

/**
 * One fetch of the manifest for every provider instance, because two
 * instances (lite and full) asking the same static file twice on every
 * availability check is waste, and a manifest that changed between the two
 * reads would let them disagree about which builds exist.
 */
let manifestPromise: Promise<EngineManifest> | null = null;

export function loadStockfishManifest(): Promise<EngineManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!response.ok)
        throw new EngineError('The Stockfish build is not installed.', INSTALL_HINT);
      return (await response.json()) as EngineManifest;
    })().catch((error: unknown) => {
      // A failed read is not cached: the next check asks again.
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

/** The builds in a manifest that carry `network`. */
export const buildsForNetwork = (
  builds: readonly EngineBuild[],
  network: StockfishNetwork,
): readonly EngineBuild[] => builds.filter((build) => networkOf(build) === network);

/** Multi-threaded WASM needs SharedArrayBuffer, which needs cross-origin isolation. */
const supportsThreads = (): boolean =>
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof globalThis.crossOriginIsolated === 'boolean' &&
  globalThis.crossOriginIsolated;

export class StockfishWasmProvider implements EngineProvider {
  readonly id: string;
  readonly name: string;
  readonly kind = 'wasm' as const;
  readonly network: StockfishNetwork;

  constructor(network: StockfishNetwork = 'lite') {
    this.network = network;
    this.id = network === 'full' ? 'stockfish-wasm-full' : 'stockfish-wasm';
    this.name =
      network === 'full' ? 'Stockfish (WebAssembly, full network)' : 'Stockfish (WebAssembly)';
  }

  private get installHint(): string {
    return this.network === 'full' ? FULL_INSTALL_HINT : INSTALL_HINT;
  }

  async checkAvailability(): Promise<EngineAvailability> {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      return {
        available: false,
        reason: 'This browser has no WebAssembly or Web Worker support.',
        remedy: 'Use a current version of Chrome, Firefox, Safari or Edge.',
      };
    }
    try {
      const manifest = await loadStockfishManifest();
      if (buildsForNetwork(manifest.builds, this.network).length === 0) {
        return {
          available: false,
          reason:
            this.network === 'full'
              ? 'This deployment did not install the full-network build.'
              : 'No engine builds are installed.',
          remedy: this.installHint,
        };
      }
      return { available: true };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'The engine manifest could not be read.',
        remedy: this.installHint,
      };
    }
  }

  async create(configuration: Partial<EngineConfiguration> = {}): Promise<EngineSession> {
    const manifest = await loadStockfishManifest();
    const build = selectBuild(buildsForNetwork(manifest.builds, this.network));
    if (!build) throw new EngineError('No usable engine build is installed.', this.installHint);

    const client = await UciWorkerClient.start(build.script, HANDSHAKE_TIMEOUT_MS[this.network]);
    const { identity, options } = await readIdentity(client);
    const capabilities = deriveCapabilities(options, build);

    const session = new UciSession(client, identity, options, capabilities);
    await session.configure({
      ...DEFAULT_ENGINE_CONFIGURATION,
      threads: build.threads ? (configuration.threads ?? DEFAULT_ENGINE_CONFIGURATION.threads) : 1,
      ...configuration,
    });
    return session;
  }
}

function selectBuild(builds: readonly EngineBuild[]): EngineBuild | undefined {
  if (supportsThreads()) {
    const threaded = builds.find((build) => build.threads);
    if (threaded) return threaded;
  }
  return builds.find((build) => !build.threads) ?? builds[0];
}

/**
 * The worker replays the `uci` handshake so we can capture the engine's name
 * and its option list, which is what tells us what it can actually do.
 */
async function readIdentity(
  client: UciWorkerClient,
): Promise<{ identity: EngineIdentity; options: EngineOptionSpec[] }> {
  const options: EngineOptionSpec[] = [];
  let name = 'Unknown engine';
  let author: string | undefined;

  const done = new Promise<void>((resolve) => {
    const stop = client.onLine((line) => {
      const message = parseUciLine(line);
      if (message.kind === 'id') {
        if (message.name) name = message.name;
        if (message.author) author = message.author;
      } else if (message.kind === 'option') {
        options.push(message.spec);
      } else if (message.kind === 'other' && line.startsWith('option ')) {
        const spec = parseOption(line);
        if (spec) options.push(spec);
      } else if (message.kind === 'uciok') {
        stop();
        resolve();
      }
    });
  });

  client.send('uci');
  await Promise.race([done, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);

  return { identity: { name, ...(author ? { author } : {}) }, options };
}

function deriveCapabilities(
  options: readonly EngineOptionSpec[],
  build: EngineBuild,
): EngineCapabilities {
  const find = (name: string) =>
    options.find((option) => option.name.toLowerCase() === name.toLowerCase());

  const threads = find('Threads');
  const hash = find('Hash');

  return {
    multiPv: Boolean(find('MultiPV')),
    /*
      Part of the UCI `go` command rather than an option, so there is nothing
      to find in the option list. Every engine that speaks UCI at all accepts
      it; a provider that wraps something which does not would report false.
    */
    searchMoves: true,
    threads: build.threads && Boolean(threads),
    hash: Boolean(hash),
    syzygy: Boolean(find('SyzygyPath')),
    // NNUE is compiled into these builds and cannot be switched off.
    nnue: true,
    maxThreads: build.threads ? (threads?.max ?? 1) : 1,
    maxHashMb: hash?.max ?? 1024,
  };
}
