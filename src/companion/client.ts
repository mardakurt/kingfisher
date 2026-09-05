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
  /** Registered by path through Settings, rather than installed from the catalogue. */
  readonly custom: boolean;
  readonly author?: string;
  /**
   * What the companion measured when it installed this engine.
   *
   * Absent for engines the companion did not install and interrogate — a
   * build-time install, or one the user registered by path. Absent means
   * unknown, and unknown is not the same as supported.
   */
  readonly capabilities?: EngineCapabilities;
}

export interface RegisteredEngine {
  readonly id: string;
  readonly name: string;
  /** What the engine itself reported at handshake, before any override name. */
  readonly detectedName: string | null;
  readonly author: string | null;
}

export interface CompanionDatabaseEntry {
  readonly key: string;
  readonly name: string;
  readonly games: number | null;
  readonly file: string;
  readonly bytes: number | null;
  /** The file's mtime. Null when it could not be read. */
  readonly modifiedAt?: number | null;
}

/** One game with everything a second collection needs to store it. */
export interface CompanionExportedGame {
  readonly summary: Record<string, unknown>;
  readonly plyCount: number | null;
  readonly pgn: string | null;
  readonly positions: readonly Record<string, unknown>[];
}

/** Enough of a game to decide whether another collection holds it too. */
export interface CompanionDuplicateKey {
  readonly id: string;
  readonly fingerprint: string;
  readonly white: string;
  readonly black: string;
  readonly date?: string;
  readonly event?: string;
  readonly round?: string;
  readonly result: string;
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
  readonly platform?: string;
  readonly managed?: readonly CatalogueEngine[];
}

/**
 * What an engine turned out to be able to do.
 *
 * Measured at install time by running the engine, never declared in a table —
 * see `companion/src/engine-verify.mjs`. Two builds of the same version can
 * differ, and a catalogue that claimed otherwise would be wrong about exactly
 * the cases that matter.
 */
export interface EngineCapabilities {
  readonly multipv: boolean;
  readonly searchmoves: boolean;
  readonly wdl: boolean;
  readonly syzygy: boolean;
  readonly threads: boolean;
  readonly hash: boolean;
}

export interface EngineCheck {
  readonly ok: boolean;
  readonly error: string | null;
}

export interface ManagedEngineRecord {
  readonly id: string;
  readonly name: string;
  readonly reportedName: string | null;
  readonly author: string | null;
  readonly version: string | null;
  readonly license: string;
  readonly source: string;
  readonly binary: string;
  /** True when Kingfisher downloaded it; false when it found one already installed. */
  readonly managed: boolean;
  readonly installedAt: number;
  readonly sha256: string | null;
  readonly capabilities: EngineCapabilities;
  readonly checks: Readonly<Record<string, EngineCheck>>;
}

export interface EngineInstallProgress {
  readonly id: string;
  readonly phase: 'starting' | 'downloading' | 'checking' | 'verifying' | 'done';
  readonly bytes: number;
  readonly total: number;
  readonly message: string;
}

export interface CatalogueEngine {
  readonly id: string;
  readonly name: string;
  readonly version: string | null;
  readonly family: string;
  readonly kind: 'wasm' | 'binary' | 'system';
  readonly license: string;
  readonly source: string;
  readonly notes: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  /** How to get a `system` engine, when it is not on the machine. */
  readonly installHint: string | null;
  readonly downloadUrl: string | null;
  readonly sha256: string | null;
  readonly installed: boolean;
  readonly installing: boolean;
  readonly progress: EngineInstallProgress | null;
  readonly record: ManagedEngineRecord | null;
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

  /**
   * Registers a UCI engine executable the user selected explicitly.
   *
   * The companion resolves the path, confirms it is a real executable file,
   * and runs a full UCI handshake (uci → uciok → isready → readyok) before
   * accepting it — so this rejects truthfully rather than accepting a path
   * to something that merely happens to be executable.
   */
  engineCatalogue(
    signal?: AbortSignal,
  ): Promise<{ platform: string; engines: readonly CatalogueEngine[] }> {
    return this.request('/engine/catalogue', undefined, signal);
  }

  /**
   * Begin installing a catalogue engine.
   *
   * Returns as soon as the download has started rather than when it has
   * finished: a 115 MB engine outlives any sensible request timeout, and
   * `installProgress` is how the UI follows it.
   */
  installEngine(engine: string): Promise<{ started: boolean; engine: CatalogueEngine | null }> {
    return this.request('/engine/install', { engine });
  }

  installProgress(engine: string): Promise<{
    engine: CatalogueEngine | null;
    progress: EngineInstallProgress | null;
    error: string | null;
  }> {
    return this.request(`/engine/install-progress?engine=${encodeURIComponent(engine)}`);
  }

  uninstallEngine(engine: string): Promise<{ removed: boolean }> {
    return this.request('/engine/uninstall', { engine });
  }

  registerEngine(executablePath: string, args?: readonly string[]): Promise<RegisteredEngine> {
    return this.request('/engine/register', { path: executablePath, args: args ?? [] });
  }

  unregisterEngine(engine: string): Promise<{ deleted: boolean }> {
    return this.request('/engine/unregister', { engine });
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

  /** A bounded page of complete games, for copying to another collection. */
  exportPage(
    key: string,
    after: string | null,
    limit: number,
    query?: unknown,
  ): Promise<{ games: readonly CompanionExportedGame[]; nextAfter: string | null }> {
    return this.request('/db/export-page', { key, after, limit, query: query ?? null });
  }

  /** Which of these fingerprints the collection already holds. */
  haveFingerprints(
    key: string,
    fingerprints: readonly string[],
  ): Promise<{ present: readonly string[] }> {
    return this.request('/db/have-fingerprints', { key, fingerprints });
  }

  /** Identity keys for every game, paged, for cross-collection duplicate search. */
  duplicateKeys(
    key: string,
    after: string | null,
    limit: number,
  ): Promise<{ games: readonly CompanionDuplicateKey[]; nextAfter: string | null }> {
    return this.request('/db/duplicate-keys', { key, after, limit });
  }

  /** Rename the collection as it is displayed. The file is never moved. */
  renameDatabase(key: string, name: string): Promise<{ key: string; name: string }> {
    return this.request('/db/rename', { key, name });
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

  /**
   * A page of games this opening index has not classified.
   *
   * `after` is the last id of the previous page, so the walk resumes with an
   * index seek rather than an OFFSET that grows with the collection.
   */
  unclassifiedGames(
    key: string,
    digest: string,
    limit: number,
    after: string | null,
  ): Promise<{
    games: readonly {
      id: string;
      positionKeys: readonly string[];
      /** Position before the game's last stored move, for replaying it. */
      finalFen?: string;
      finalMoveUci?: string;
    }[];
    nextAfter: string | null;
  }> {
    return this.request('/db/unclassified-games', { key, digest, limit, after });
  }

  classificationRemaining(
    key: string,
    digest: string,
  ): Promise<{ remaining: number; total: number; classified: number }> {
    return this.request('/db/classification-remaining', { key, digest });
  }

  /** Store classifications the browser computed. See `classify-games.ts`. */
  applyClassification(
    key: string,
    entries: readonly {
      id: string;
      classification?: { eco: string; name: string; variation?: string; ply: number };
      classifiedWith: string;
    }[],
  ): Promise<{ updated: number; remaining: number }> {
    return this.request('/db/apply-classification', { key, entries });
  }

  /** What Syzygy tables this machine actually has, read from the files. */
  tablebaseStatus(): Promise<{
    configured: boolean;
    path: string | null;
    exists: boolean;
    error?: string;
    maxPieces: number;
    wdl: readonly string[];
    dtz: readonly string[];
    canProbe: boolean;
    probeLimit?: number;
    prober?: 'helper' | 'server' | null;
    helper?: {
      built: boolean;
      running: boolean;
      largest: number;
      restarts: number;
      reason?: string;
    };
  }> {
    return this.request('/tablebase/status');
  }

  /**
   * Choose the Syzygy directory, and start the helper on it.
   *
   * An empty path clears the setting. The companion resolves and validates the
   * directory before it is stored; the browser only ever sends what the user
   * typed or picked.
   */
  configureTablebase(directory: string): Promise<{
    configured: boolean;
    path?: string;
    available?: boolean;
    running?: boolean;
    built?: boolean;
    largest?: number;
    reason?: string;
    scan?: { maxPieces: number; wdl: readonly string[]; dtz: readonly string[] };
  }> {
    return this.request('/tablebase/configure', { path: directory });
  }

  probeTablebase(fen: string, signal?: AbortSignal): Promise<{ source: string; result: unknown }> {
    return this.request('/tablebase/probe', { fen }, signal);
  }

  gameContent(key: string, id: string): Promise<{ pgn: string | null }> {
    return this.request('/db/content', { key, id });
  }
}
