/**
 * IndexedDB measurements for the local game database.
 *
 * Runs in a browser, against a *temporary* database with the production v3
 * shape — `games` summaries, `gameContent` trees, and a `positions` index —
 * which it deletes afterwards. It never touches the `kingfisher` workspace
 * database, so it is safe to run in a tab that has real data in it.
 *
 * Paste the whole file into the DevTools console of a page served from this
 * app (the origin only matters for storage quota), or run it through the
 * browser tooling. It resolves to a table of medians in milliseconds.
 *
 *   await benchIndexedDb([1000, 10000, 50000]);
 *
 * The dataset deliberately makes the initial position pathological: every game
 * indexes one move there, so the explorer join has to touch every game. That is
 * a ceiling, not a typical middlegame.
 */
globalThis.benchIndexedDb = async function benchIndexedDb(sizes = [1000, 10000], runs = 3) {
  const NAME = 'kingfisher-bench';
  const PLAYERS = ['Carlsen, M', 'Nepomniachtchi, I', 'Ding, L', 'Caruana, F', 'Firouzja, A'];
  const RESULTS = ['1-0', '0-1', '1/2-1/2'];
  const TARGET = 'carlsen, m';

  const request = (r) =>
    new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });

  const open = () =>
    new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(NAME, 1);
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        const games = database.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('importedAt', 'importedAt');
        games.createIndex('year', 'year');
        games.createIndex('result', 'result');
        games.createIndex('whiteKey', 'whiteKey');
        games.createIndex('players', 'playerKeys', { multiEntry: true });
        database.createObjectStore('gameContent', { keyPath: 'id' });
        const positions = database.createObjectStore('positions', { keyPath: 'id' });
        positions.createIndex('positionKey', 'positionKey');
        positions.createIndex('gameId', 'gameId');
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

  const drop = () =>
    new Promise((resolve) => {
      const r = indexedDB.deleteDatabase(NAME);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });

  /** A summary of roughly the size the real importer writes. */
  const summary = (index) => {
    const white = PLAYERS[index % PLAYERS.length];
    const black = PLAYERS[(index + 2) % PLAYERS.length];
    const key = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
    return {
      id: `g${index}`,
      fingerprint: `f${index}`,
      white,
      black,
      whiteKey: key(white),
      blackKey: key(black),
      playerKeys: [key(white), key(black)],
      result: RESULTS[index % 3],
      date: `${2010 + (index % 16)}.05.01`,
      year: 2010 + (index % 16),
      event: `Synthetic Open ${index % 40}`,
      site: 'Bench',
      round: String(index % 11),
      whiteRating: 2500 + (index % 350),
      blackRating: 2500 + ((index * 7) % 350),
      eco: 'B90',
      opening: 'Sicilian, Najdorf',
      importedAt: 1_700_000_000_000 + index,
    };
  };

  const tree = (index) => ({
    rootId: 'r',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    headers: { White: 'W', Black: 'B', Event: `E${index}` },
    nextId: 30,
    nodes: Object.fromEntries(
      Array.from({ length: 30 }, (_, ply) => [
        `n${ply}`,
        {
          id: `n${ply}`,
          parentId: ply === 0 ? null : `n${ply - 1}`,
          children: ply === 29 ? [] : [`n${ply + 1}`],
          move: ply === 0 ? null : { uci: 'e2e4', san: 'e4', color: ply % 2 ? 'w' : 'b' },
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          ply,
          nags: [],
          shapes: [],
          meta: {},
        },
      ]),
    ),
  });

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const time = async (fn) => {
    const start = performance.now();
    await fn();
    return performance.now() - start;
  };
  const repeat = async (fn) =>
    median(
      await Promise.all([]).then(async () => {
        const out = [];
        for (let run = 0; run < runs; run += 1) out.push(await time(fn));
        return out;
      }),
    );

  const rows = [];
  await drop();
  const database = await open();

  let written = 0;
  for (const size of sizes) {
    const insert = await time(async () => {
      const CHUNK = 500;
      for (let from = written; from < size; from += CHUNK) {
        const to = Math.min(size, from + CHUNK);
        const transaction = database.transaction(
          ['games', 'gameContent', 'positions'],
          'readwrite',
        );
        for (let index = from; index < to; index += 1) {
          transaction.objectStore('games').put(summary(index));
          transaction.objectStore('gameContent').put({
            id: `g${index}`,
            tree: tree(index),
            normalizedPgn: '1. e4 *',
          });
          // Every game touches the initial position: the ceiling case.
          transaction.objectStore('positions').put({
            id: `p${index}`,
            positionKey: 'start',
            gameId: `g${index}`,
            ply: 1,
            moveUci: 'e2e4',
            moveSan: 'e4',
            mover: 'w',
          });
        }
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
      }
      written = size;
    });

    // A page of 100 through the sort index, the way the games list reads.
    const list = await repeat(async () => {
      const store = database.transaction('games', 'readonly').objectStore('games');
      await new Promise((resolve, reject) => {
        const items = [];
        const cursorRequest = store.index('importedAt').openCursor(null, 'prev');
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || items.length >= 100) return resolve(items);
          items.push(cursor.value);
          cursor.continue();
        };
      });
    });

    // One whole player name: a key-cursor count plus a page of records.
    const player = await repeat(async () => {
      const store = database.transaction('games', 'readonly').objectStore('games');
      const index = store.index('players');
      const range = IDBKeyRange.only(TARGET);
      await request(index.count(range));
      await request(index.getAll(range, 100));
    });

    // Opponent preparation: up to 1,000 whole games in one transaction.
    const preparation = await repeat(async () => {
      const transaction = database.transaction(['games', 'gameContent'], 'readonly');
      const ids = Array.from({ length: Math.min(1000, size) }, (_, i) => `g${i}`);
      for (const id of ids) {
        await request(transaction.objectStore('games').get(id));
        await request(transaction.objectStore('gameContent').get(id));
      }
    });

    const positions = await request(
      database
        .transaction('positions', 'readonly')
        .objectStore('positions')
        .index('positionKey')
        .getAll('start'),
    );
    const ids = [...new Set(positions.map((p) => p.gameId))];

    // The join, both ways, over the same matched set.
    const pointRead = await repeat(async () => {
      const store = database.transaction('games', 'readonly').objectStore('games');
      for (const id of ids) await request(store.get(id));
    });
    const bulkJoin = await repeat(async () => {
      const store = database.transaction('games', 'readonly').objectStore('games');
      const included = new Set(ids);
      const all = await request(store.getAll());
      all.filter((game) => included.has(game.id));
    });

    rows.push({
      games: size,
      'insert increment': +insert.toFixed(1),
      'indexed list, 100': +list.toFixed(1),
      'exact player': +player.toFixed(1),
      'preparation, 1k games': +preparation.toFixed(1),
      'explorer, point reads': +pointRead.toFixed(1),
      'explorer, bulk join': +bulkJoin.toFixed(1),
    });
  }

  database.close();
  await drop();
  console.table(rows);
  return rows;
};
