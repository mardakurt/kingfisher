/**
 * The browser's view of the local companion.
 *
 * The native capabilities shipped by the companion go through here: native
 * engines and SQLite databases. Nothing else in the application knows the
 * companion exists — it is reached through the same engine and database
 * interfaces as everything else, which is why the application still works
 * with the companion switched off. Tablebases use their own provider boundary;
 * the current implementation is remote rather than a companion route.
 *
 * Configuration is a URL and a token the user pastes from the terminal that
 * started the companion. The token is deliberately not discoverable: there is
 * no handshake that hands it out, because anything that could hand it to
 * Kingfisher could hand it to any other page too.
 */

import { withTimeout } from '@/database/retry';

export interface CompanionConfig {
  readonly url: string;
  readonly token: string;
}

export interface CompanionEngineEntry {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly license?: string;
}

export interface CompanionDatabaseEntry {
  readonly key: string;
  readonly name: string;
  readonly games: number | null;
  readonly file: string;
  readonly bytes: number | null;
}

/** Whether the derived explorer aggregates still agree with the source rows. */
export interface CompanionAggregateIntegrity {
  readonly positions: number;
  readonly aggregatedPositions: number;
  readonly aggregateRows: number;
  readonly filteredCacheKeys: number;
  readonly filteredAggregateRows: number;
  readonly consistent: boolean;
}

export interface CompanionStatus {
  readonly engines: readonly CompanionEngineEntry[];
  readonly databases: readonly CompanionDatabaseEntry[];
  readonly sessions: readonly { readonly id: string; readonly engine: string }[];
}

/** Generous: a position query over a hundred thousand games is real work. */
const REQUEST_TIMEOUT_MS = 20_000;

export class CompanionError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'CompanionError';
  }
}

/** Parse the pairing URL the companion prints: `http://host:port#token=…`. */
export function parsePairing(value: string): CompanionConfig | null {
  try {
    const url = new URL(value.trim());
    const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
    if (!token) return null;
    return { url: `${url.protocol}//${url.host}`, token };
  } catch {
    return null;
  }
}

export class CompanionClient {
  constructor(private readonly config: CompanionConfig) {}

  get baseUrl(): string {
    return this.config.url;
  }

  private async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${this.config.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        /*
          A deadline as well as the caller's signal. Loopback usually fails
          fast, but a companion that has wedged rather than exited accepts the
          connection and never answers — and with no timeout that request never
          settles and the panel waits forever.
        */
        signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new CompanionError(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'The companion accepted the request but did not answer.'
          : 'The companion is not reachable.',
        'Start it with `npm run companion`, then check the address in Settings → Companion.',
      );
    }
    if (response.status === 401) {
      throw new CompanionError(
        'The companion rejected this token.',
        'A new token is printed every time the companion starts; paste the current one.',
      );
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({ error: response.statusText }));
      throw new CompanionError(String(detail.error ?? 'The companion refused the request.'));
    }
    return (await response.json()) as T;
  }

  status(signal?: AbortSignal): Promise<CompanionStatus> {
    return this.request<CompanionStatus>('/status', undefined, signal);
  }

  startEngine(engine: string): Promise<{ session: string; engine: string }> {
    return this.request('/engine/start', { engine });
  }

  send(session: string, line: string): Promise<unknown> {
    return this.request('/engine/send', { session, line });
  }

  stopEngine(session: string): Promise<unknown> {
    return this.request('/engine/stop', { session });
  }

  /**
   * Engine output, as Server-Sent Events.
   *
   * `EventSource` cannot set an Authorization header, so the token travels as a
   * query parameter here. That is acceptable *only* because the companion is
   * loopback-bound: the URL never leaves the machine, and there is no proxy or
   * server log between the two ends to leak it into.
   */
  stream(session: string): EventSource {
    const url = new URL(`${this.config.url}/engine/stream`);
    url.searchParams.set('session', session);
    url.searchParams.set('token', this.config.token);
    return new EventSource(url.toString());
  }

  // --- Database --------------------------------------------------------------

  createDatabase(name: string): Promise<{ key: string; name: string }> {
    return this.request('/db/create', { name });
  }

  importGames(key: string, games: unknown[]): Promise<{ imported: number; duplicates: number }> {
    return this.request('/db/import', { key, games });
  }

  searchGames<T>(key: string, query: unknown): Promise<T> {
    return this.request('/db/search', { key, query });
  }

  explore<T>(key: string, positionKey: string, limit?: number, filters?: unknown): Promise<T> {
    return this.request('/db/explore', { key, positionKey, limit, filters });
  }

  gamesAtPosition<T>(key: string, positionKey: string, limit?: number): Promise<T> {
    return this.request('/db/games-at', { key, positionKey, limit });
  }

  searchStructures<T>(key: string, query: unknown): Promise<T> {
    return this.request('/db/structure-search', { key, query });
  }

  deleteGames(
    key: string,
    selection: { readonly fingerprints: readonly string[] } | { readonly query: unknown },
  ): Promise<{ deleted: number; integrity: CompanionAggregateIntegrity }> {
    return this.request('/db/delete-games', { key, ...selection });
  }

  clearDatabase(key: string): Promise<{ deleted: number; integrity: CompanionAggregateIntegrity }> {
    return this.request('/db/clear', { key });
  }

  deleteDatabase(key: string): Promise<{ deleted: boolean }> {
    return this.request('/db/delete', { key });
  }

  databaseIntegrity(key: string): Promise<CompanionAggregateIntegrity> {
    return this.request('/db/integrity', { key });
  }

  rebuildAggregates(key: string): Promise<CompanionAggregateIntegrity> {
    return this.request('/db/rebuild-aggregates', { key });
  }

  /** A page of positions in an older collection with no structural identity. */
  unindexedPositions(
    key: string,
    limit?: number,
  ): Promise<{
    positions: readonly { positionKey: string }[];
    remaining: number;
  }> {
    return this.request('/db/unindexed-positions', { key, limit });
  }

  /** Store identities the browser computed. See `structure-backfill.ts`. */
  indexStructures(
    key: string,
    entries: readonly {
      positionKey: string;
      pawnSkeleton: string;
      structureSignature?: string;
      structureClaims?: readonly string[];
      fen?: string;
    }[],
  ): Promise<{ updated: number; remaining: number }> {
    return this.request('/db/index-structures', { key, entries });
  }

  gameContent(key: string, id: string): Promise<{ pgn: string | null }> {
    return this.request('/db/content', { key, id });
  }
}
