/**
 * The companion's HTTP surface.
 *
 * Small on purpose. Every route is either "run an engine" or "query a database";
 * anything that could be done in the browser is done in the browser. Requests
 * carry resource *keys*, never filesystem paths.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GameDatabase } from './database.mjs';
import { EngineHost } from './engines.mjs';
import {
  allowedOrigins,
  createToken,
  databaseKey,
  HOST,
  PathRegistry,
  presentedToken,
  tokenMatches,
} from './security.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DATA_DIR = path.join(ROOT, 'companion', 'data');
const MANIFEST = path.join(ROOT, 'public', 'engine', 'manifest.json');
const IMPORTS = path.join(DATA_DIR, 'databases.json');

const PORT = Number(process.env.KINGFISHER_COMPANION_PORT ?? 4321);
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
      engines: engineRegistry.list().map(({ key, name, version, license }) => ({
        id: key,
        name,
        version,
        license,
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
    Derived explorer aggregates are checked on demand rather than on every
    status poll: the check sums a whole table, and a hundred-thousand-game
    collection should not pay for that once a second to say nothing changed.
  */
  if (pathname === '/db/integrity' && request.method === 'POST') {
    const body = await readBody(request);
    const facts = database(String(body.key)).aggregateIntegrity();
    return json(response, 200, {
      ...facts,
      consistent: facts.positions === facts.aggregatedPositions,
    });
  }

  if (pathname === '/db/rebuild-aggregates' && request.method === 'POST') {
    const body = await readBody(request);
    const target = database(String(body.key));
    target.rebuildAggregates();
    const facts = target.aggregateIntegrity();
    return json(response, 200, {
      ...facts,
      consistent: facts.positions === facts.aggregatedPositions,
    });
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

loadEngines();
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
