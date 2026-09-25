/**
 * An event stream opened on a session that already has output — what an
 * EventSource does when it reconnects — must replay that output and stay
 * open. It closed at once until Phase 85: the replay was written before the
 * stream's headers, and the headers then failed.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, expect, it } from 'vitest';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'engine-stream-test-token';
const PORT = 4494;
const ENGINE = `
const out = (line) => process.stdout.write(line + '\\n');
let pending = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  pending += chunk;
  const lines = pending.split('\\n');
  pending = lines.pop();
  for (const line of lines) {
    if (line === 'uci') { out('id name Scripted 1'); out('uciok'); }
    else if (line === 'isready') out('readyok');
    else if (line === 'quit') process.exit(0);
  }
});
`;

let companion;
afterAll(() => companion?.kill('SIGKILL'));

const api = (route, body) =>
  fetch(`http://127.0.0.1:${PORT}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => response.json());

it('replays a session’s output to a stream opened late, and keeps it open', async () => {
  const data = mkdtempSync(path.join(tmpdir(), 'kf-stream-'));
  const script = path.join(data, 'engine.mjs');
  writeFileSync(script, ENGINE);
  writeFileSync(
    path.join(data, 'custom-engines.json'),
    JSON.stringify([{ key: 'scripted', path: process.execPath, name: 'Scripted', args: [script] }]),
  );
  companion = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(PORT),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: data,
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
    } catch {
      /* not yet */
    }
    if (attempt > 200) throw new Error('The companion never started.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const { session } = await api('/engine/start', { engine: 'scripted' });
  await api('/engine/send', { session, line: 'uci' });
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Opened after the engine has spoken: a reconnect.
  const response = await fetch(
    `http://127.0.0.1:${PORT}/engine/stream?session=${session}&token=${TOKEN}`,
  );
  expect(response.status).toBe(200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const read = async (until) => {
    const deadline = Date.now() + 5_000;
    while (!until(text)) {
      if (Date.now() > deadline) throw new Error(`stream said only: ${text}`);
      const { done, value } = await reader.read();
      if (done) throw new Error(`stream closed early after: ${text}`);
      text += decoder.decode(value, { stream: true });
    }
  };
  await read((seen) => seen.includes('uciok'));
  expect(text).toContain('"id name Scripted 1"');
  // Still open: the next command's answer arrives on the same stream.
  await api('/engine/send', { session, line: 'isready' });
  await read((seen) => seen.includes('readyok'));
  await reader.cancel();
  await api('/engine/stop', { session });
}, 60_000);
