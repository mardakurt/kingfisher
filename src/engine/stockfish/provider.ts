/**
 * Stockfish compiled to WebAssembly, running in a Web Worker.
 *
 * The build is not bundled with the application: it is GPL-3.0 and ~7 MB, so
 * `npm run engine:install` downloads it into `public/engine/stockfish` and
 * writes a manifest. When the manifest is absent the provider reports itself
 * unavailable with the command to fix it — analysis is never faked.
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

const MANIFEST_URL = '/engine/stockfish/manifest.json';

interface EngineBuild {
  readonly id: string;
  readonly label: string;
  readonly script: string;
  readonly threads: boolean;
}

interface EngineManifest {
  readonly engine: string;
  readonly license: string;
  readonly builds: readonly EngineBuild[];
}

const INSTALL_HINT = 'Run `npm run engine:install` to download the Stockfish build.';

/** Multi-threaded WASM needs SharedArrayBuffer, which needs cross-origin isolation. */
const supportsThreads = (): boolean =>
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof globalThis.crossOriginIsolated === 'boolean' &&
  globalThis.crossOriginIsolated;

export class StockfishWasmProvider implements EngineProvider {
  readonly id = 'stockfish-wasm';
  readonly name = 'Stockfish (WebAssembly)';
  readonly kind = 'wasm' as const;

  private manifest: EngineManifest | null = null;

  async checkAvailability(): Promise<EngineAvailability> {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      return {
        available: false,
        reason: 'This browser has no WebAssembly or Web Worker support.',
        remedy: 'Use a current version of Chrome, Firefox, Safari or Edge.',
      };
    }
    try {
      const manifest = await this.loadManifest();
      if (manifest.builds.length === 0) {
        return {
          available: false,
          reason: 'No engine builds are installed.',
          remedy: INSTALL_HINT,
        };
      }
      return { available: true };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'The engine manifest could not be read.',
        remedy: INSTALL_HINT,
      };
    }
  }

  async create(configuration: Partial<EngineConfiguration> = {}): Promise<EngineSession> {
    const manifest = await this.loadManifest();
    const build = selectBuild(manifest.builds);
    if (!build) throw new EngineError('No usable engine build is installed.', INSTALL_HINT);

    const client = await UciWorkerClient.start(build.script);
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

  private async loadManifest(): Promise<EngineManifest> {
    if (this.manifest) return this.manifest;
    const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) throw new EngineError('The Stockfish build is not installed.', INSTALL_HINT);
    const manifest = (await response.json()) as EngineManifest;
    this.manifest = manifest;
    return manifest;
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
