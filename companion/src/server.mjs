/**
 * The companion's HTTP surface.
 *
 * Small on purpose. Every route is either "run an engine" or "query a database";
 * anything that could be done in the browser is done in the browser. Requests
 * carry resource *keys*, never filesystem paths.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGUE, DIGESTS, PLATFORM } from '../../scripts/engine-catalogue.mjs';
import { GameDatabase } from './database.mjs';
import { handshakeUci, validateExecutable } from './custom-engines.mjs';
import { EngineHost } from './engines.mjs';
import { ManagedEngines } from './managed-engines.mjs';
import { probeLocalTablebase, scanTablebaseDirectory } from './tablebase.mjs';
import { TablebaseHelper } from './tbprobe-helper.mjs';
import {
  allowedOrigins,
  createToken,
  databaseKey,
  engineKey,
  HOST,
  PathRegistry,
  presentedToken,
  tokenMatches,
} from './security.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DATA_DIR = process.env.KINGFISHER_COMPANION_DATA_DIR
  ? path.resolve(process.env.KINGFISHER_COMPANION_DATA_DIR)
  : path.join(ROOT, 'companion', 'data');
const MANIFEST = path.join(ROOT, 'public', 'engine', 'manifest.json');
const IMPORTS = path.join(DATA_DIR, 'databases.json');
const CUSTOM_ENGINES = path.join(DATA_DIR, 'custom-engines.json');
const MANAGED_ENGINES = path.join(DATA_DIR, 'managed-engines.json');
const ENGINE_DIR = path.join(ROOT, 'engines');

const PORT = Number(process.env.KINGFISHER_COMPANION_PORT ?? 4321);
/*
  Local tablebases, both halves configured by environment rather than by the
  browser: a request body must never choose a filesystem path, and the endpoint
  the companion will call out to is a machine-level decision.
*/
let TABLEBASE_DIR = process.env.KINGFISHER_TABLEBASE_PATH
  ? path.resolve(process.env.KINGFISHER_TABLEBASE_PATH)
  : null;
const TABLEBASE_ENDPOINT = process.env.KINGFISHER_TABLEBASE_ENDPOINT ?? null;
const TABLEBASE_CONFIG = path.join(DATA_DIR, 'tablebase.json');
const TABLEBASE_MANIFEST = path.join(ROOT, 'public', 'engine', 'tablebase.json');
const TOKEN = process.env.KINGFISHER_COMPANION_TOKEN ?? createToken();
const ORIGINS = allowedOrigins(PORT);

/**
 * The managed probe helper, built by `npm run tablebase:install`.
 *
 * Constructed unconditionally and started only when a directory is configured:
 * a companion on a machine with no helper and no tables is a normal
 * installation, and it says so through `/tablebase/status` rather than by
 * failing to boot.
 */
function tablebaseBinary() {
  try {
    const manifest = JSON.parse(readFileSync(TABLEBASE_MANIFEST, 'utf8'));
    return existsSync(manifest.helper) ? manifest.helper : null;
  } catch {
    return null;
  }
}

const tablebase = new TablebaseHelper(tablebaseBinary());

/**
 * The directory the user last chose, re-validated on every start.
 *
 * Same rule as custom engines and SQLite collections: a path that no longer
 * exists — an unplugged external drive, most realistically — is dropped rather
 * than left as a dead setting that fails at the moment somebody needs it.
 */
function loadTablebaseDirectory() {
  if (TABLEBASE_DIR) return;
  if (!existsSync(TABLEBASE_CONFIG)) return;
  try {
    const stored = JSON.parse(readFileSync(TABLEBASE_CONFIG, 'utf8'));
    if (stored.path && existsSync(stored.path)) TABLEBASE_DIR = stored.path;
  } catch {
    // A corrupt settings file is not a reason to refuse to start.
  }
}

const engineRegistry = new PathRegistry();
const databaseRegistry = new PathRegistry();
const engines = new EngineHost(engineRegistry);
/** The last failure per engine id, so a poll after a crash says what happened. */
const installFailures = new Map();
/**
 * Engines Kingfisher can install for itself.
 *
 * Kept separate from the build-time manifest that `npm run engines:install`
 * writes, and from the custom engines a user pointed at: three different
 * provenances, three records, one registry. Merging them into one file would
 * make "where did this engine come from" unanswerable, which is the question
 * the trust model turns on.
 */
const managed = new ManagedEngines({
  catalogue: CATALOGUE,
  digests: DIGESTS,
  platform: PLATFORM,
  engineDir: ENGINE_DIR,
  recordFile: MANAGED_ENGINES,
  registry: engineRegistry,
});
const open = new Map();

/** Engines the installer wrote. Only these can ever be spawned. */
function loadEngines() {
  if (!existsSync(MANIFEST)) return;
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const entry of manifest.engines ?? []) {
    if (entry.transport !== 'native' || !entry.binary) continue;
    const binary = path.resolve(ROOT, entry.binary);
    if (!existsSync(binary)) continue;
    engineRegistry.register(entry.id, binary, {
      name: entry.name,
      version: entry.version,
      args: entry.args ?? [],
      cwd: path.dirname(binary),
      license: entry.license,
    });
  }
}

/**
 * Custom engines a user registered in an earlier run.
 *
 * Re-validated against the filesystem on every start, exactly like
 * `loadDatabases`: a binary that was uninstalled or lived on removable media
 * is silently dropped from the registry rather than left as a dead entry
 * that fails the moment someone tries to start it.
 */
function loadCustomEngines() {
  if (!existsSync(CUSTOM_ENGINES)) return;
  for (const entry of JSON.parse(readFileSync(CUSTOM_ENGINES, 'utf8'))) {
    if (!existsSync(entry.path)) continue;
    engineRegistry.register(entry.key, entry.path, {
      name: entry.name,
      args: entry.args ?? [],
      cwd: path.dirname(entry.path),
      custom: true,
    });
  }
}

const saveCustomEngines = () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    CUSTOM_ENGINES,
    JSON.stringify(
      engineRegistry
        .list()
        .filter((entry) => entry.custom)
        .map(({ key, path: file, name, args }) => ({ key, path: file, name, args })),
      null,
      2,
    ),
  );
};

function loadDatabases() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(IMPORTS)) return;
  for (const entry of JSON.parse(readFileSync(IMPORTS, 'utf8'))) {
    if (existsSync(entry.path)) databaseRegistry.register(entry.key, entry.path, entry);
  }
}

const saveDatabases = () =>
  writeFileSync(
    IMPORTS,
    JSON.stringify(
      databaseRegistry.list().map(({ key, path: file, name }) => ({ key, path: file, name })),
      null,
      2,
    ),
  );

const database = (key) => {
  if (!open.has(key)) open.set(key, new GameDatabase(databaseRegistry.resolve(key).path));
  return open.get(key);
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      // A companion request is a query or a batch of games, never a stream.
      if (body.length > 64 * 1024 * 1024) reject(new Error('Request too large.'));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Malformed JSON body.'));
      }
    });
    request.on('error', reject);
  });

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return true;
  }
  // No origin header at all is a non-browser client (curl, a test); allowed,
  // because the token is still required and the socket is still loopback.
  return origin === undefined;
}

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

  if (!cors(request, response)) return json(response, 403, { error: 'Origin not allowed.' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }

  // `/health` is the only unauthenticated route, and it says nothing except
  // that a companion is here — enough to pair, useless to anyone else.
  if (url.pathname === '/health' && request.method === 'GET') {
    return json(response, 200, { name: 'kingfisher-companion', version: 1, requiresToken: true });
  }

  if (!tokenMatches(TOKEN, presentedToken(request, url))) {
    return json(response, 401, { error: 'A valid companion token is required.' });
  }

  try {
    return await route(url, request, response);
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : 'Failed.' });
  }
});

async function route(url, request, response) {
  const { pathname } = url;

  if (pathname === '/status' && request.method === 'GET') {
    return json(response, 200, {
      engines: engineRegistry
        .list()
        .map(({ key, name, version, license, custom, author, capabilities }) => ({
          id: key,
          name,
          version,
          license,
          custom: Boolean(custom),
          ...(author ? { author } : {}),
          /*
            Present only for engines the companion installed and interrogated.
            Its absence is meaningful: it says nobody has asked this engine
            what it can do, which is not the same as it being able to do it.
          */
          ...(capabilities ? { capabilities } : {}),
        })),
      databases: databaseRegistry.list().map(({ key, name, path: file }) => ({
        key,
        name,
        games: (() => {
          try {
            return database(key).count();
          } catch {
            return null;
          }
        })(),
        file: path.basename(file),
        ...collectionFootprint(file),
      })),
      sessions: engines.list(),
      platform: PLATFORM,
      managed: managed.list(),
    });
  }

  // --- Engines ---------------------------------------------------------------

  if (pathname === '/engine/catalogue' && request.method === 'GET') {
    return json(response, 200, { platform: PLATFORM, engines: managed.list() });
  }

  if (pathname === '/engine/install' && request.method === 'POST') {
    const body = await readBody(request);
    const id = String(body.engine ?? '');
    // Started rather than awaited: a 115 MB download outlives any sensible
    // request timeout, and the browser polls `/engine/install-progress`.
    const started = managed
      .install(id)
      .then(() => undefined)
      .catch((error) => {
        installFailures.set(id, error instanceof Error ? error.message : String(error));
      });
    void started;
    await new Promise((resolve) => setTimeout(resolve, 50));
    installFailures.delete(id);
    return json(response, 202, { started: true, engine: managed.status(id) });
  }

  if (pathname === '/engine/install-progress' && request.method === 'GET') {
    const id = url.searchParams.get('engine') ?? '';
    return json(response, 200, {
      engine: managed.status(id),
      progress: managed.progress(id),
      error: installFailures.get(id) ?? null,
    });
  }

  if (pathname === '/engine/uninstall' && request.method === 'POST') {
    const body = await readBody(request);
    const id = String(body.engine ?? '');
    for (const session of engines.list()) {
      if (session.engine === id) engines.stop(session.id);
    }
    return json(response, 200, { removed: managed.uninstall(id) });
  }

  /*
    The one route in this file that accepts a filesystem path rather than a
    key — deliberately: registering a custom engine is defined as "the user
    explicitly selects an executable" (Settings, a native file picker, or a
    pasted path), and there is no other way to name a binary that was never
    installed by this application. What keeps this safe is everything after
    the path arrives: it is never passed to a shell, it is confirmed to be a
    real executable file before anything is spawned, and it is confirmed to
    actually speak UCI before it is trusted with a key. A path that fails
    either check is rejected here and never reaches the registry.
  */
  if (pathname === '/engine/register' && request.method === 'POST') {
    const body = await readBody(request);
    const target = path.resolve(String(body.path ?? ''));
    validateExecutable(target);
    const args = Array.isArray(body.args) ? body.args.map(String) : [];

    const handshake = await handshakeUci(target, args);
    const key = engineKey(target);
    const name = String(body.name ?? '').trim() || handshake.name || path.basename(target);

    engineRegistry.register(key, target, {
      name,
      args,
      cwd: path.dirname(target),
      custom: true,
      ...(handshake.author ? { author: handshake.author } : {}),
    });
    saveCustomEngines();

    return json(response, 200, {
      id: key,
      name,
      detectedName: handshake.name,
      author: handshake.author,
    });
  }

  if (pathname === '/engine/unregister' && request.method === 'POST') {
    const body = await readBody(request);
    const key = String(body.engine ?? '');
    const entry = engineRegistry.has(key) ? engineRegistry.resolve(key) : null;
    if (!entry) return json(response, 200, { deleted: false });
    if (!entry.custom) {
      return json(response, 400, { error: 'Only a custom-registered engine can be removed.' });
    }
    engineRegistry.delete(key);
    saveCustomEngines();
    return json(response, 200, { deleted: true });
  }

  if (pathname === '/engine/start' && request.method === 'POST') {
    const body = await readBody(request);
    const started = engines.start(String(body.engine));
    return json(response, 200, { session: started.id, engine: started.engine.name });
  }

  if (pathname === '/engine/send' && request.method === 'POST') {
    const body = await readBody(request);
    engines.send(String(body.session), String(body.line));
    return json(response, 200, { ok: true });
  }

  if (pathname === '/engine/stop' && request.method === 'POST') {
    const body = await readBody(request);
    engines.stop(String(body.session));
    return json(response, 200, { ok: true });
  }

  if (pathname === '/engine/stream' && request.method === 'GET') {
    const id = url.searchParams.get('session') ?? '';
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    response.write(': connected\n\n');
    const unsubscribe = engines.subscribe(id, (line) => {
      if (line === null) {
        response.write('event: end\ndata: {}\n\n');
        response.end();
        return;
      }
      response.write(`data: ${JSON.stringify(line)}\n\n`);
    });
    // Proxies and browsers drop an idle event stream; a comment keeps it warm.
    const beat = setInterval(() => response.write(': beat\n\n'), 15_000);
    request.on('close', () => {
      clearInterval(beat);
      unsubscribe();
    });
    return undefined;
  }

  // --- Databases -------------------------------------------------------------

  if (pathname === '/db/create' && request.method === 'POST') {
    const body = await readBody(request);
    const name =
      String(body.name ?? 'database')
        .replace(/[^\w. -]/g, '')
        .slice(0, 64) || 'database';
    mkdirSync(DATA_DIR, { recursive: true });
    // The filename is derived from a sanitised name and always lands in the
    // companion's own directory; a request cannot choose where it is written.
    const file = path.join(DATA_DIR, `${name}.kingfisher.sqlite`);
    const key = databaseKey(name);
    databaseRegistry.register(key, file, { name });
    database(key);
    saveDatabases();
    return json(response, 200, { key, name });
  }

  if (pathname === '/db/import' && request.method === 'POST') {
    const body = await readBody(request);
    const result = database(String(body.key)).insertGames(body.games ?? []);
    return json(response, 200, result);
  }

  if (pathname === '/db/search' && request.method === 'POST') {
    const body = await readBody(request);
    return json(response, 200, database(String(body.key)).search(body.query ?? {}));
  }

  if (pathname === '/db/explore' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).explore(
        String(body.positionKey),
        body.limit ?? 24,
        body.filters ?? {},
      ),
    );
  }

  /*
    Structure backfill runs as a client-driven loop: the browser asks for a
    page of unindexed positions, computes their identities with the same chess
    code every other path uses, and posts them back. The companion never
    computes a chess fact of its own.
  */
  /*
    What the machine actually has. Read from the files every time rather than
    cached: a user who has just finished a download expects the answer to
    change without restarting the companion.
  */
  if (pathname === '/tablebase/status' && request.method === 'GET') {
    const scan = scanTablebaseDirectory(TABLEBASE_DIR);
    const helper = tablebase.state();
    /*
      Two independent facts, reported separately because they fail separately:
      what is on disk (the scan) and whether anything can read it (the helper).
      A user with six-piece tables and no compiler needs to be told the second
      thing, not shown a piece limit they cannot actually use.

      `maxPieces` is the smaller of the two. The scan says what tables exist;
      the helper says what Fathom actually opened. Where they disagree the
      helper wins, because it is the one that will answer the probe.
    */
    const probeLimit = helper.available ? helper.largest : TABLEBASE_ENDPOINT ? scan.maxPieces : 0;
    return json(response, 200, {
      ...scan,
      maxPieces: helper.available
        ? Math.min(scan.maxPieces || helper.largest, helper.largest)
        : scan.maxPieces,
      endpoint: TABLEBASE_ENDPOINT ? 'configured' : null,
      helper: {
        built: helper.built,
        running: helper.running,
        largest: helper.largest,
        restarts: helper.restarts,
        ...(helper.reason ? { reason: helper.reason } : {}),
      },
      probeLimit,
      // True when a probe will actually be attempted locally: the managed
      // helper is answering, or the legacy external server is configured.
      canProbe: helper.available || Boolean(TABLEBASE_ENDPOINT),
      /*
        Which of the two will answer. Kept apart from `canProbe` because the
        provenance a user is shown must name the thing that produced the
        result, and "local" covering two different implementations would make
        that line meaningless.
      */
      prober: helper.available ? 'helper' : TABLEBASE_ENDPOINT ? 'server' : null,
    });
  }

  /*
    Choosing the directory is the one other route that takes a filesystem path
    from a request body, and for the same reason `/engine/register` does: the
    user is explicitly selecting a folder, and there is no other way to name
    one the application did not create. It is resolved, confirmed to be a real
    directory, and never passed to a shell.
  */
  if (pathname === '/tablebase/configure' && request.method === 'POST') {
    const body = await readBody(request);
    const raw = String(body.path ?? '').trim();
    if (!raw) {
      TABLEBASE_DIR = null;
      await tablebase.use(null);
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(TABLEBASE_CONFIG, JSON.stringify({ path: null }, null, 2));
      return json(response, 200, { configured: false });
    }
    const target = path.resolve(raw);
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      return json(response, 400, { error: 'That path is not a directory on this machine.' });
    }
    TABLEBASE_DIR = target;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TABLEBASE_CONFIG, JSON.stringify({ path: target }, null, 2));
    const state = await tablebase.use(target);
    return json(response, 200, {
      configured: true,
      path: target,
      ...state,
      scan: scanTablebaseDirectory(target),
    });
  }

  if (pathname === '/tablebase/probe' && request.method === 'POST') {
    const body = await readBody(request);
    const fen = String(body.fen ?? '');

    /*
      The managed helper first. It reads the files directly, so it is both
      faster and one fewer thing for the user to have running — and it is what
      makes "select a folder" the entire setup procedure.
    */
    if (tablebase.state().built && TABLEBASE_DIR) {
      const local = await tablebase.probe(fen);
      if (local.ok) return json(response, 200, { source: 'helper', result: local });
      /*
        A helper that declined for a reason about *this position* — castling
        rights, material outside the tables — is a final answer, not a fallback
        signal. Falling through to an external server would ask the same
        question of something that would give the same answer.
      */
      if (!TABLEBASE_ENDPOINT) return json(response, 503, { error: local.reason });
    }

    /*
      Nothing local can answer. The reason has to name the actual state rather
      than the pre-Phase-12 one: "no local tablebase server is configured" is
      the wrong sentence to show somebody who never needed a server and simply
      has not chosen a folder.
    */
    if (!TABLEBASE_ENDPOINT) {
      const helper = tablebase.state();
      return json(response, 503, {
        error: !helper.built
          ? 'Local probing is not built on this machine. Run `npm run tablebase:install`.'
          : !TABLEBASE_DIR
            ? 'No Syzygy directory is configured. Choose one in Settings → Companion → Tablebases.'
            : (helper.reason ?? 'The local tablebase could not answer.'),
      });
    }

    const probe = await probeLocalTablebase(TABLEBASE_ENDPOINT, fen);
    if (!probe.ok) return json(response, 503, { error: probe.reason });
    return json(response, 200, { source: 'server', result: probe.result });
  }

  if (pathname === '/db/unindexed-positions' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).unindexedPositions(Number(body.limit) || 500),
    );
  }

  if (pathname === '/db/index-structures' && request.method === 'POST') {
    const body = await readBody(request);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    return json(response, 200, database(String(body.key)).applyStructures(entries));
  }

  /*
    Copying between collections is paged rather than streamed: a copy of half
    a million games is a job the browser drives, one bounded page at a time,
    so it can report progress, be cancelled, and never hold a whole archive in
    memory at either end.
  */
  if (pathname === '/db/export-page' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).exportPage(
        body.after ?? null,
        Math.min(Number(body.limit) || 200, 1000),
        body.query ?? null,
      ),
    );
  }

  if (pathname === '/db/have-fingerprints' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).haveFingerprints(body.fingerprints ?? []),
    );
  }

  if (pathname === '/db/duplicate-keys' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).duplicateKeys(
        body.after ?? null,
        Math.min(Number(body.limit) || 5000, 20000),
      ),
    );
  }

  if (pathname === '/db/rename' && request.method === 'POST') {
    const body = await readBody(request);
    const key = String(body.key);
    const entry = databaseRegistry.resolve(key);
    const name = String(body.name ?? '')
      .replace(/[^\w. -]/g, '')
      .slice(0, 64)
      .trim();
    if (!name) return json(response, 400, { error: 'That name has no usable characters.' });
    // The display name only. The file keeps the name it was created with, so
    // renaming can never move or orphan somebody's data.
    databaseRegistry.register(key, entry.path, { ...entry, name });
    saveDatabases();
    return json(response, 200, { key, name });
  }

  /*
    Opening classification is client-driven for the same reason structure
    indexing is: the opening table and the rules that reach it live in one
    place, in the browser, and the companion stores what it is told rather than
    deriving a second opinion.
  */
  if (pathname === '/db/unclassified-games' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).unclassifiedGames(
        String(body.digest ?? ''),
        Number(body.limit) || 200,
        body.after ?? null,
        Number(body.maxPly) || 40,
      ),
    );
  }

  if (pathname === '/db/classification-remaining' && request.method === 'POST') {
    const body = await readBody(request);
    return json(
      response,
      200,
      database(String(body.key)).classificationRemaining(String(body.digest ?? '')),
    );
  }

  if (pathname === '/db/apply-classification' && request.method === 'POST') {
    const body = await readBody(request);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    return json(response, 200, database(String(body.key)).applyClassification(entries));
  }

  if (pathname === '/db/structure-search' && request.method === 'POST') {
    const body = await readBody(request);
    return json(response, 200, {
      results: database(String(body.key)).searchStructures(body.query ?? {}),
    });
  }

  if (pathname === '/db/delete-games' && request.method === 'POST') {
    const body = await readBody(request);
    const target = database(String(body.key));
    const result = Array.isArray(body.fingerprints)
      ? target.deleteGamesByFingerprint(body.fingerprints.map(String))
      : target.deleteGamesMatching(body.query ?? {});
    return json(response, 200, { ...result, integrity: integrityOf(target) });
  }

  if (pathname === '/db/clear' && request.method === 'POST') {
    const body = await readBody(request);
    const target = database(String(body.key));
    const result = target.clear();
    return json(response, 200, { ...result, integrity: integrityOf(target) });
  }

  if (pathname === '/db/delete' && request.method === 'POST') {
    const body = await readBody(request);
    const key = String(body.key);
    const registered = databaseRegistry.resolve(key);
    const target = open.get(key);
    if (target) target.close();
    open.delete(key);
    databaseRegistry.delete(key);
    saveDatabases();
    // The path can only have come from the registry; request bodies never
    // choose a filesystem target. WAL sidecars belong to this same database.
    rmSync(registered.path, { force: true });
    rmSync(`${registered.path}-wal`, { force: true });
    rmSync(`${registered.path}-shm`, { force: true });
    return json(response, 200, { deleted: true });
  }

  /*
    Derived explorer aggregates are checked on demand rather than on every
    status poll: the check sums a whole table, and a hundred-thousand-game
    collection should not pay for that once a second to say nothing changed.
  */
  if (pathname === '/db/integrity' && request.method === 'POST') {
    const body = await readBody(request);
    const target = database(String(body.key));
    return json(response, 200, integrityOf(target));
  }

  if (pathname === '/db/rebuild-aggregates' && request.method === 'POST') {
    const body = await readBody(request);
    const target = database(String(body.key));
    target.rebuildAggregates();
    return json(response, 200, integrityOf(target));
  }

  if (pathname === '/db/games-at' && request.method === 'POST') {
    const body = await readBody(request);
    return json(response, 200, {
      games: database(String(body.key)).gamesAtPosition(String(body.positionKey), body.limit ?? 12),
    });
  }

  if (pathname === '/db/players' && request.method === 'POST') {
    const body = await readBody(request);
    return json(response, 200, {
      players: database(String(body.key)).players(String(body.prefix ?? '')),
    });
  }

  if (pathname === '/db/content' && request.method === 'POST') {
    const body = await readBody(request);
    return json(response, 200, { pgn: database(String(body.key)).content(Number(body.id)) });
  }

  return json(response, 404, { error: 'No such companion route.' });
}

/**
 * How much disk a collection occupies, and when it last changed.
 *
 * The `-wal` sidecar is counted, and that is the whole point of this function
 * rather than a bare `statSync().size`. SQLite is opened in WAL mode, so a
 * freshly written page lives in the sidecar until a checkpoint moves it: a copy
 * of three thousand games can leave the main file at its original four
 * kilobytes while half a megabyte sits beside it. Reporting only the main file
 * is technically true and practically a lie — the database screen would show a
 * collection that had just grown as not having grown at all.
 *
 * `modifiedAt` takes the newest mtime across both for the same reason.
 */
function collectionFootprint(file) {
  let bytes = null;
  let modifiedAt = null;
  for (const candidate of [file, `${file}-wal`]) {
    try {
      const stats = statSync(candidate);
      bytes = (bytes ?? 0) + stats.size;
      modifiedAt = Math.max(modifiedAt ?? 0, stats.mtimeMs);
    } catch {
      // A missing sidecar is normal: it only exists between checkpoints.
    }
  }
  return { bytes, modifiedAt };
}

const integrityOf = (target) => {
  const facts = target.aggregateIntegrity();
  return {
    ...facts,
    consistent: facts.positions === facts.aggregatedPositions,
  };
};

loadEngines();
managed.load();
loadCustomEngines();
loadDatabases();
loadTablebaseDirectory();
// Started eagerly when a directory is already configured, so the first probe
// of a session does not pay for `tb_init`.
if (TABLEBASE_DIR) void tablebase.use(TABLEBASE_DIR);

server.listen(PORT, HOST, () => {
  const engineList = engineRegistry.list();
  process.stdout.write(
    [
      '',
      '  Kingfisher companion',
      `  listening on http://${HOST}:${PORT} (loopback only)`,
      `  engines installed: ${engineList.length ? engineList.map((e) => e.key).join(', ') : 'none — run `npm run engines:install`'}`,
      `  databases: ${databaseRegistry.list().length}`,
      '',
      '  Paste this into Settings -> Companion:',
      '',
      `  http://${HOST}:${PORT}#token=${TOKEN}`,
      '',
      '  The token is new every run and is never written to disk.',
      '',
      '',
    ].join('\n'),
  );
});

const shutdown = () => {
  engines.stopAll();
  void tablebase.stop();
  for (const db of open.values()) db.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
