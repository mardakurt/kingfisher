/**
 * Two real companions, as two machines would run them (on one machine, over
 * loopback — the only kind of second machine this suite has): one started
 * with `--serve-engines`, the other paired to it through its own HTTP API,
 * the way Settings pairs it. The browser's side of the contract is what is
 * asserted: the remote engine is in `/status`, named with its host, and is
 * started, fed and streamed through the ordinary `/engine/*` routes; when the
 * host goes away mid-search, the stream ends with the loss named. A reconnect
 * that carries Last-Event-ID resumes after that id, and a stream opened with
 * no cursor still receives the backlog.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'remote-engines-test-token';
const HOST_HTTP = 4491;
const HOST_ENGINES = 4492;
const CLIENT_HTTP = 4493;

const ENGINE = `
const out = (line) => process.stdout.write(line + '\\n');
let timer = null, depth = 0, pending = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  pending += chunk;
  const lines = pending.split('\\n');
  pending = lines.pop();
  for (const line of lines) {
    if (line === 'uci') { out('id name Scripted 1'); out('uciok'); }
    else if (line.startsWith('go')) timer = setInterval(() => out('info depth ' + (++depth) + ' score cp 20 pv e2e4'), 50);
    else if (line === 'stop') { clearInterval(timer); out('bestmove e2e4'); }
    else if (line === 'quit') process.exit(0);
  }
});
`;

const children = [];
afterAll(() => {
  for (const child of children) child.kill('SIGKILL');
});

function companion(port, extraArgs, dataDir, env = {}) {
  const child = spawn(process.execPath, [SERVER, ...extraArgs], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(port),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: dataDir,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  return { child, output: () => output };
}

const api = (port, route, body) =>
  fetch(`http://127.0.0.1:${port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));

const until = async (predicate, ms = 20_000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

/**
 * Read an event stream until `stop` says enough.
 * `lastEventId` is the Last-Event-ID a reconnecting EventSource would send.
 */
async function readStream(port, session, stop, { lastEventId } = {}) {
  const response = await fetch(
    `http://127.0.0.1:${port}/engine/stream?session=${session}&token=${TOKEN}`,
    lastEventId == null ? undefined : { headers: { 'last-event-id': String(lastEventId) } },
  );
  if (!response.ok) throw new Error(`stream ${response.status}: ${await response.text()}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines = [];
  const ids = [];
  let ended = false;
  let buffer = '';
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        if (event.startsWith('event: end')) ended = true;
        const eventId = /^id: (\d+)$/m.exec(event)?.[1];
        if (eventId) ids.push(Number(eventId));
        const data = /^data: (.*)$/m.exec(event)?.[1];
        if (data && !event.startsWith('event: end')) lines.push(JSON.parse(data));
      }
      if (stop({ lines, ids, ended })) return;
    }
  })();
  return { lines, ids, ended: () => ended, pump, cancel: () => reader.cancel() };
}

describe('a companion using another companion’s engines', () => {
  it('pairs, lists, searches, and ends the session when the host goes away', async () => {
    const hostData = mkdtempSync(path.join(tmpdir(), 'kf-host-'));
    const script = path.join(hostData, 'engine.mjs');
    writeFileSync(script, ENGINE);
    writeFileSync(
      path.join(hostData, 'custom-engines.json'),
      JSON.stringify([
        { key: 'scripted', path: process.execPath, name: 'Scripted', args: [script] },
      ]),
    );
    const host = companion(HOST_HTTP, ['--serve-engines'], hostData, {
      KINGFISHER_ENGINE_HOST_PORT: String(HOST_ENGINES),
    });
    const code = await until(() => /kingfisher-engines:\/\/[^\s]+/.exec(host.output())?.[0]);
    // Loopback stands in for the other machine's address.
    const local = code.replace(/\/\/[^:]+:/, '//127.0.0.1:');

    companion(CLIENT_HTTP, [], mkdtempSync(path.join(tmpdir(), 'kf-client-')));
    await until(() =>
      api(CLIENT_HTTP, '/status')
        .then((r) => r.status === 200)
        .catch(() => false),
    );

    const refused = await api(CLIENT_HTTP, '/engine/remote/add', {
      code: local.replace(/k=.{4}/, 'k=AAAA'),
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/refused the pairing key|closed the connection/);

    const paired = await api(CLIENT_HTTP, '/engine/remote/add', { code: local });
    expect(paired.status).toBe(200);
    const status = await api(CLIENT_HTTP, '/status');
    // The host may also have real engines installed; this test's is the scripted one.
    const remote = status.body.engines.find(
      (engine) => engine.remote && engine.id.endsWith(':scripted'),
    );
    expect(remote.name).toMatch(/^Scripted · on /);
    expect(remote.id).toMatch(/^remote:[a-z0-9]+:scripted$/);

    const started = await api(CLIENT_HTTP, '/engine/start', { engine: remote.id });
    expect(started.body.session).toMatch(/^remote:/);
    const session = started.body.session;
    const stream = await readStream(
      CLIENT_HTTP,
      session,
      ({ lines, ended }) => ended || lines.some((line) => line.startsWith('info depth 3')),
    );
    await api(CLIENT_HTTP, '/engine/send', { session, line: 'uci' });
    await api(CLIENT_HTTP, '/engine/send', { session, line: 'go infinite' });
    await stream.pump;
    expect(stream.lines).toContain('uciok');
    expect(stream.lines.find((line) => line.startsWith('id name'))).toMatch(
      /^id name Scripted 1 · on /,
    );
    expect(stream.ids.length).toBeGreaterThan(0);
    const cursor = Math.max(...stream.ids);
    // A reconnect carries the last id it applied. The backlog behind that
    // id — including uciok — must not be delivered again. The next command's
    // answer still arrives.
    const resumed = await readStream(
      CLIENT_HTTP,
      session,
      ({ lines }) => lines.includes('bestmove e2e4'),
      { lastEventId: cursor },
    );
    await api(CLIENT_HTTP, '/engine/send', { session, line: 'stop' });
    await Promise.race([
      resumed.pump,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`resume said only: ${resumed.lines.join(' | ')}`)),
          20_000,
        ),
      ),
    ]);
    expect(resumed.lines).toContain('bestmove e2e4');
    expect(resumed.lines).not.toContain('uciok');
    expect(resumed.lines.some((line) => line.startsWith('id name'))).toBe(false);
    expect(resumed.ids.length).toBeGreaterThan(0);
    expect(resumed.ids.every((id) => id > cursor)).toBe(true);
    for (const line of stream.lines) expect(resumed.lines, line).not.toContain(line);

    // The host machine goes away in the middle of the search. A stream opened
    // with no cursor still receives the backlog, then the loss.
    const after = await readStream(CLIENT_HTTP, session, ({ ended }) => ended);
    host.child.kill('SIGKILL');
    await Promise.race([
      after.pump,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no end')), 60_000)),
    ]);
    expect(after.ended()).toBe(true);
    expect(after.lines).toContain('uciok');
    expect(after.lines.at(-1)).toMatch(/^#error The connection to .* was lost/);
    const listed = await api(CLIENT_HTTP, '/engine/remote');
    expect(listed.body.hosts[0].connected).toBe(false);
  }, 90_000);
});
