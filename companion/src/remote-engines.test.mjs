import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EngineHost } from './engines.mjs';
import {
  RemoteEngineHost,
  newPairingKey,
  pairingCode,
  parsePairingCode,
  serveEngines,
} from './remote-engines.mjs';
import { PathRegistry } from './security.mjs';

/*
  A scripted UCI engine: it identifies itself, and a `go` streams an info line
  every 50 ms until `stop`, when it answers `bestmove`. Enough for a search to
  be seen crossing the connection, and for one to be in flight when the
  connection is cut.
*/
const ENGINE = `
const out = (line) => process.stdout.write(line + '\\n');
let timer = null;
let depth = 0;
process.stdin.setEncoding('utf8');
let pending = '';
process.stdin.on('data', (chunk) => {
  pending += chunk;
  const lines = pending.split('\\n');
  pending = lines.pop();
  for (const line of lines) {
    if (line === 'uci') { out('id name Scripted 1'); out('uciok'); }
    else if (line === 'isready') out('readyok');
    else if (line.startsWith('go')) {
      timer = setInterval(() => out('info depth ' + (++depth) + ' score cp 20 pv e2e4'), 50);
    } else if (line === 'stop') { clearInterval(timer); out('bestmove e2e4'); }
    else if (line === 'quit') process.exit(0);
  }
});
`;

function engineHost() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kf-remote-'));
  const script = path.join(dir, 'engine.mjs');
  writeFileSync(script, ENGINE);
  const registry = new PathRegistry();
  registry.register('scripted', process.execPath, { name: 'Scripted', args: [script] });
  return { registry, engines: new EngineHost(registry) };
}

const lines = (client, id) => {
  const seen = [];
  let ended = false;
  client.subscribe(id, (line) => {
    if (line === null) ended = true;
    else seen.push(line);
  });
  return { seen, ended: () => ended };
};

const until = async (predicate, ms = 5_000) => {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const cleanup = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

describe('remote engines', () => {
  it('reads a pairing code and refuses what is not one', () => {
    const key = newPairingKey();
    const code = pairingCode('192.168.1.20', 4339, key);
    expect(parsePairingCode(code)).toEqual({ host: '192.168.1.20', port: 4339, key });
    expect(() => parsePairingCode('http://192.168.1.20:4339/')).toThrow(/not a Kingfisher/);
  });

  it('lists the host’s engines, streams a search, and names the host in the engine’s identity', async () => {
    const { registry, engines } = engineHost();
    const key = newPairingKey();
    const served = await serveEngines({
      engines,
      registry,
      key,
      address: '127.0.0.1',
      label: 'studio-mac',
    });
    cleanup.push(
      () => served.close(),
      () => engines.stopAll(),
    );

    const client = new RemoteEngineHost({ host: '127.0.0.1', port: served.port, key });
    await client.connect();
    cleanup.push(() => client.close());
    expect(client.label).toBe('studio-mac');
    expect(client.engines).toEqual([{ key: 'scripted', name: 'Scripted' }]);

    const id = await client.start('scripted');
    const stream = lines(client, id);
    client.send(id, 'uci');
    await until(() => stream.seen.includes('uciok'));
    expect(stream.seen).toContain('id name Scripted 1 · on studio-mac');
    client.send(id, 'go infinite');
    await until(() => stream.seen.some((line) => line.startsWith('info depth 3')));
    client.send(id, 'stop');
    await until(() => stream.seen.includes('bestmove e2e4'));
    client.stop(id);
    await until(() => engines.list().length === 0);
  });

  it('refuses a client that does not hold the pairing key', async () => {
    const { registry, engines } = engineHost();
    const served = await serveEngines({
      engines,
      registry,
      key: newPairingKey(),
      address: '127.0.0.1',
    });
    cleanup.push(() => served.close());
    const intruder = new RemoteEngineHost({
      host: '127.0.0.1',
      port: served.port,
      key: newPairingKey(),
    });
    await expect(intruder.connect()).rejects.toThrow(
      /refused the pairing key|closed the connection/,
    );
    expect(served.connections()).toBe(0);
  });

  it('a connection lost mid-search fails the session on both sides and ends the host’s engine', async () => {
    const { registry, engines } = engineHost();
    const key = newPairingKey();
    const served = await serveEngines({
      engines,
      registry,
      key,
      address: '127.0.0.1',
      label: 'cloud-vm',
    });
    cleanup.push(
      () => served.close(),
      () => engines.stopAll(),
    );
    const client = new RemoteEngineHost({ host: '127.0.0.1', port: served.port, key });
    await client.connect();

    const id = await client.start('scripted');
    const stream = lines(client, id);
    client.send(id, 'uci');
    client.send(id, 'go infinite');
    await until(() => stream.seen.some((line) => line.startsWith('info depth 2')));
    expect(engines.list()).toHaveLength(1);

    // The host goes away in the middle of the search.
    await served.close();

    await until(() => stream.ended());
    expect(stream.seen.at(-1)).toMatch(/^#error The connection to cloud-vm was lost/);
    // No late line can arrive as evidence: the session is over and refuses commands.
    expect(() => client.send(id, 'go infinite')).toThrow(/exited/);
    // And the engine the connection started is not left running on the host.
    await until(() => engines.list().length === 0);
  });
});
