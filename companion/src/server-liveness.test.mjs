/**
 * The companion must survive its clients.
 *
 * This suite exists for one defect, and the defect is the reason it starts a
 * real server rather than calling a handler: **a single HTTP GET naming an
 * engine session that had already exited killed the whole companion process.**
 * Every running engine, every open collection, and on the desktop the native
 * half of the workstation, in the middle of an analysis.
 *
 * The mechanism was ordinary. `/engine/stream` wrote its event-stream headers
 * and *then* subscribed; subscribing throws for a session that is gone, which
 * is a thing clients ask for all the time — a reconnect after a stop, an
 * engine that crashed. The throw reached the request handler's catch, which
 * replied with JSON, which called `writeHead` a second time, and
 * `ERR_HTTP_HEADERS_SENT` raised from an async handler is an unhandled
 * rejection. Node ends the process.
 *
 * A unit test against the route function could not have seen any of that: the
 * failure is in the interaction between an already-committed response, the
 * generic error reply and Node's rejection handling. So this starts the real
 * server as a child process, makes the request, and then asks whether the
 * process is still there.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'liveness-test-token';
const PORT = 4487;
const BASE = `http://127.0.0.1:${PORT}`;

let companion;

const alive = () => companion?.exitCode === null && companion?.signalCode === null;

async function start() {
  companion = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(PORT),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'kingfisher-liveness-')),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('The companion never became ready.');
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        await response.text();
        return;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

afterAll(() => {
  companion?.kill('SIGKILL');
});

describe('a client cannot end the companion', () => {
  it('answers an event stream for a session that does not exist, and stays up', async () => {
    await start();
    expect(alive()).toBe(true);

    const response = await fetch(`${BASE}/engine/stream?session=does-not-exist&token=${TOKEN}`);
    // Anything but a crash is acceptable here; 404 is what it should say.
    expect(response.status).toBe(404);
    await response.text();

    /*
      The assertion the whole file is for. Before the fix the process was gone
      by now — so this is checked after a pause long enough for an unhandled
      rejection to have taken it down, and then confirmed by a second request.
    */
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alive(), 'the companion exited after one request for a dead session').toBe(true);

    const health = await fetch(`${BASE}/health`);
    expect(health.ok).toBe(true);
    await health.text();
  }, 40_000);

  it('survives a burst of them, and a stream that is abandoned mid-flight', async () => {
    for (let i = 0; i < 20; i += 1) {
      const response = await fetch(`${BASE}/engine/stream?session=gone-${i}&token=${TOKEN}`);
      await response.text();
    }
    // And a request whose client walks away before the reply is read.
    const controller = new AbortController();
    const pending = fetch(`${BASE}/engine/stream?session=abandoned&token=${TOKEN}`, {
      signal: controller.signal,
    }).catch(() => undefined);
    controller.abort();
    await pending;

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alive()).toBe(true);
    const health = await fetch(`${BASE}/health`);
    expect(health.ok).toBe(true);
    await health.text();
  }, 40_000);

  it('still refuses an unauthenticated stream, and stays up', async () => {
    const response = await fetch(`${BASE}/engine/stream?session=whatever`);
    expect(response.status).toBe(401);
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(alive()).toBe(true);
  }, 30_000);
});
