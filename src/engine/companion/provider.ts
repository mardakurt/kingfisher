/**
 * Native engines, reached through the local companion.
 *
 * The provider's only jobs are to prove the engine can start and to describe
 * what it can do. Everything after that is `UciSession`, which is the same code
 * that drives the WebAssembly build.
 *
 * Capabilities are read from the engine's own `option` lines rather than
 * assumed. This matters more than it sounds: Lc0 has no `Hash` and no `Use
 * NNUE`, its `Threads` default is 0, and it takes a `WeightsFile` that no
 * alpha-beta engine has. Writing capability tables by hand would encode those
 * differences as folklore; asking the engine keeps them true.
 */

import { parseUciOptions } from '../uci';
import { UciSession } from '../uci-session';
import {
  EngineError,
  type EngineAvailability,
  type EngineCapabilities,
  type EngineConfiguration,
  type EngineIdentity,
  type EngineOptionSpec,
  type EngineProvider,
  type EngineSession,
} from '../types';
import { CompanionTransport } from './transport';
import { companionClient } from '@/companion/session';

export interface NativeEngineDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly license?: string;
}

/** What an engine's declared options say it can do. */
export function capabilitiesFrom(options: readonly EngineOptionSpec[]): EngineCapabilities {
  const byName = new Map(options.map((option) => [option.name.toLowerCase(), option]));
  const threads = byName.get('threads');
  const hash = byName.get('hash');
  return {
    multiPv: byName.has('multipv'),
    threads: threads !== undefined,
    hash: hash !== undefined,
    syzygy: byName.has('syzygypath'),
    // Lc0 is a neural engine without an NNUE toggle; the option's absence is
    // not the same as the engine being non-neural, so this stays literal.
    nnue: byName.has('use nnue'),
    maxThreads: threads?.max && threads.max > 0 ? threads.max : 1,
    maxHashMb: hash?.max && hash.max > 0 ? Math.min(hash.max, 4096) : 16,
  };
}

export class CompanionEngineProvider implements EngineProvider {
  readonly kind = 'native' as const;

  constructor(private readonly descriptor: NativeEngineDescriptor) {}

  get id(): string {
    return this.descriptor.id;
  }

  get name(): string {
    return this.descriptor.name;
  }

  async checkAvailability(): Promise<EngineAvailability> {
    const client = companionClient();
    if (!client) {
      return {
        available: false,
        reason: 'This engine runs as a native process, which needs the local companion.',
        remedy: 'Start it with `npm run companion` and pair it in Settings → Companion.',
      };
    }
    try {
      const status = await client.status();
      const known = status.engines.some((engine) => engine.id === this.descriptor.id);
      if (known) return { available: true };
      return {
        available: false,
        reason: `The companion does not have ${this.descriptor.name} installed.`,
        remedy: 'Run `npm run engines:install`, then restart the companion.',
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'The companion is not reachable.',
        remedy: 'Start it with `npm run companion`.',
      };
    }
  }

  async create(configuration: Partial<EngineConfiguration> = {}): Promise<EngineSession> {
    const client = companionClient();
    if (!client) {
      throw new EngineError(
        'The local companion is not configured.',
        'Start it with `npm run companion` and pair it in Settings → Companion.',
      );
    }

    const transport = await CompanionTransport.start(client, this.descriptor.id);
    try {
      const banner = await handshake(transport);
      const session = new UciSession(
        transport,
        banner.identity,
        banner.options,
        capabilitiesFrom(banner.options),
      );
      await session.configure(configuration);
      return session;
    } catch (error) {
      transport.dispose();
      throw error;
    }
  }
}

/** Send `uci`, collect the option list, and wait for `uciok`. */
async function handshake(transport: CompanionTransport): Promise<{
  identity: EngineIdentity;
  options: readonly EngineOptionSpec[];
}> {
  const lines: string[] = [];
  const collect = transport.onLine((line) => lines.push(line));
  try {
    transport.send('uci');
    await transport.waitFor((line) => line.trim() === 'uciok', 25_000, 'uciok');
  } finally {
    collect();
  }

  const name = lines
    .find((line) => line.startsWith('id name '))
    ?.slice(8)
    .trim();
  const author = lines
    .find((line) => line.startsWith('id author '))
    ?.slice(10)
    .trim();
  return {
    identity: { name: name ?? 'Unknown engine', ...(author ? { author } : {}) },
    options: parseUciOptions(lines),
  };
}
