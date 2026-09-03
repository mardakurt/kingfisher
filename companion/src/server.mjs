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

import { GameDatabase } from './database.mjs';
import { handshakeUci, validateExecutable } from './custom-engines.mjs';
import { EngineHost } from './engines.mjs';
import { probeLocalTablebase, scanTablebaseDirectory } from './tablebase.mjs';
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

const PORT = Number(process.env.KINGFISHER_COMPANION_PORT ?? 4321);
/*
  Local tablebases, both halves configured by environment rather than by the
  browser: a request body must never choose a filesystem path, and the endpoint
  the companion will call out to is a machine-level decision.
*/
const TABLEBASE_DIR = process.env.KINGFISHER_TABLEBASE_PATH
  ? path.resolve(process.env.KINGFISHER_TABLEBASE_PATH)
  : null;
const TABLEBASE_ENDPOINT = process.env.KINGFISHER_TABLEBASE_ENDPOINT ?? null;
const TOKEN = process.env.KINGFISHER_COMPANION_TOKEN ?? createToken();
const ORIGINS = allowedOrigins(PORT);

const engineRegistry = new PathRegistry();
const databaseRegistry = new PathRegistry();
const engines = new EngineHost(engineRegistry);
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
      engines: engineRegistry.list().map(({ key, name, version, license, custom, author }) => ({
        id: key,
        name,
        version,
        license,
        custom: Boolean(custom),
        ...(author ? { author } : {}),
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
        bytes: (() => {
          try {
            return statSync(file).size;
          } catch {
            return null;
          }
        })(),
      })),
      sessions: engines.list(),
    });
  }

  // --- Engines ---------------------------------------------------------------

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
    return json(response, 200, {
      ...scan,
      endpoint: TABLEBASE_ENDPOINT ? 'configured' : null,
      // Stated plainly, because a directory full of tables with no server to
      // read them is the configuration users will most often arrive at.
      canProbe: Boolean(TABLEBASE_ENDPOINT),
    });
  }

  if (pathname === '/tablebase/probe' && request.method === 'POST') {
    const body = await readBody(request);
    const probe = await probeLocalTablebase(TABLEBASE_ENDPOINT, String(body.fen ?? ''));
    if (!probe.ok) return json(response, 503, { error: probe.reason });
    return json(response, 200, { source: 'local', result: probe.result });
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

const integrityOf = (target) => {
  const facts = target.aggregateIntegrity();
  return {
    ...facts,
    consistent: facts.positions === facts.aggregatedPositions,
  };
};

loadEngines();
loadCustomEngines();
loadDatabases();

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
  for (const db of open.values()) db.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
