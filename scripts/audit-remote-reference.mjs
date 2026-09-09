#!/usr/bin/env node
/** Read-only regression probe against a real committed Starter gzip shard.
 * Exits nonzero until the remote provider returns the installed reader's facts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, closeApp } from './load-app.mjs';
const root = fileURLToPath(new URL('../public/reference/kingfisher-starter/', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
try {
  const { PackReader, RemoteReferenceProvider, positionKey, asFen } = await loadApp([
    '/src/reference/reader.ts',
    '/src/database/providers/remote-reference.ts',
    '/src/chess/fen.ts',
    '/src/chess/types.ts',
  ]);
  const fen = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const reader = new PackReader(manifest, {
    read: async (_manifest, id) =>
      new Uint8Array(readFileSync(path.join(root, manifest.chunks.find((c) => c.id === id).file))),
  });
  const fetched = [];
  const remote = new RemoteReferenceProvider({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    manifest,
    baseUrl: 'https://fixture.invalid',
    shards: {
      fetchText: async () => '',
      fetchBytes: async (url) => {
        const file = new URL(url).pathname.slice(1);
        fetched.push(file);
        return new Uint8Array(readFileSync(path.join(root, file)));
      },
    },
  });
  const expected = await reader.position(positionKey(fen));
  const actual = await remote.explore({ fen });
  const expectedGames = expected.moves.reduce((n, m) => n + m.games, 0);
  const result = {
    fixture: 'real committed Starter compressed shard',
    fetched,
    expectedGames,
    actualGames: actual.totalGames,
    expectedMoves: expected.moves.length,
    actualMoves: actual.moves.length,
    capabilities: remote.capabilities,
  };
  console.log(JSON.stringify(result, null, 2));
  if (actual.totalGames !== expectedGames || actual.moves.length !== expected.moves.length)
    process.exitCode = 1;
} finally {
  await closeApp();
}
