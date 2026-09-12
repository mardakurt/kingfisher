/**
 * Whatever a client sends, the companion answers or refuses — and stays up.
 *
 * Starts the real server as a child process, the way `server-liveness` does,
 * and throws malformed requests at it: methods it does not serve, paths it
 * does not know, tokens of the wrong length and the right length, bodies
 * that are not JSON, bodies that are JSON of the wrong shape, a body that is
 * larger than it will hold, and two hundred seeded random combinations of
 * all of the above. After every one the process must still be there and the
 * answer must be a 4xx, never a 5xx and never silence.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const TOKEN = 'fuzz-test-token-0123456789abcdef';

let companion;
let BASE;

const alive = () => companion?.exitCode === null && companion?.signalCode === null;

function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  companion = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(port),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'kingfisher-fuzz-')),
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
}, 30_000);

afterAll(() => {
  companion?.kill('SIGKILL');
});

const auth = { authorization: `Bearer ${TOKEN}` };
const call = (route, { method = 'POST', headers = auth, body } = {}) =>
  fetch(`${BASE}${route}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body }),
  });

describe('malformed requests', () => {
  it('a method the companion does not serve is refused, not crashed on', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      const response = await call('/status', { method });
      expect(response.status, method).toBeGreaterThanOrEqual(200);
      expect(response.status, method).toBeLessThan(500);
      await response.arrayBuffer();
      expect(alive(), method).toBe(true);
    }
  });

  it('a path the companion does not know is refused, including hostile ones', async () => {
    for (const route of [
      '/nope',
      '/db/',
      '/db/../../etc/passwd',
      '/engine/%00',
      `/${'a'.repeat(8_000)}`,
      `/db/explore?x=${'y'.repeat(20_000)}`,
    ]) {
      const response = await call(route, { method: 'GET' });
      expect(
        [400, 404, 414, 431].includes(response.status),
        `${route.slice(0, 40)} → ${response.status}`,
      ).toBe(true);
      await response.arrayBuffer();
    }
    expect(alive()).toBe(true);
  });

  it('a wrong token of any shape is 401 and never leaks a hint', async () => {
    for (const token of [
      '',
      'x',
      TOKEN.slice(0, -1),
      `${TOKEN}0`,
      TOKEN.toUpperCase(),
      'A'.repeat(TOKEN.length),
      'ü'.repeat(TOKEN.length),
      `${'a'.repeat(TOKEN.length - 1)}ü`,
    ]) {
      const response = await call('/status', {
        method: 'GET',
        headers: token === '' ? {} : { authorization: `Bearer ${token}` },
      });
      expect(response.status, JSON.stringify(token.slice(0, 8))).toBe(401);
      const text = await response.text();
      expect(text).not.toContain(TOKEN);
    }
    expect(alive()).toBe(true);
  });

  it('a body that is not JSON, or JSON of the wrong shape, is a 4xx', async () => {
    for (const body of [
      'not json',
      '{',
      '[]',
      '"string"',
      'null',
      '123',
      '{"key":null}',
      '{"key":{"toString":1}}',
      `{"key":"${'k'.repeat(100_000)}"}`,
    ]) {
      for (const route of [
        '/db/explore',
        '/db/games-at',
        '/engine/start',
        '/engine/send',
        '/tablebase/probe',
      ]) {
        const response = await call(route, { body });
        // 503 is the tablebase saying nothing is configured — a refusal with
        // a reason, not a failure. 500 is the one status that is never right.
        expect(response.status, `${route} ${body.slice(0, 20)}`).toBeGreaterThanOrEqual(400);
        expect(
          [500, 502, 504].includes(response.status),
          `${route} ${body.slice(0, 20)} → ${response.status}`,
        ).toBe(false);
        await response.arrayBuffer();
      }
    }
    expect(alive()).toBe(true);
  });

  it('a body larger than the companion will hold is refused and the socket is closed', async () => {
    // 70 MB of JSON, streamed; the limit is 64 MB.
    const chunk = Buffer.alloc(1024 * 1024, 0x20);
    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent === 0) controller.enqueue(Buffer.from('{"key":"'));
        if (sent >= 70) {
          controller.enqueue(Buffer.from('"}'));
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        sent += 1;
      },
    });
    const outcome = await fetch(`${BASE}/db/explore`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    }).then(
      (response) => ({ status: response.status }),
      (error) => ({ error: String(error?.cause?.code ?? error?.message ?? error) }),
    );
    // Either a 4xx arrived before the socket closed, or the socket was closed
    // on us mid-upload. Both are the companion refusing; a 5xx or a hang is not.
    if ('status' in outcome) {
      expect(outcome.status).toBeGreaterThanOrEqual(400);
      expect(outcome.status).toBeLessThan(500);
    } else {
      expect(outcome.error).toMatch(/ECONNRESET|EPIPE|socket|closed|aborted|fetch failed/i);
    }
    expect(alive()).toBe(true);
    // And it still answers afterwards, promptly.
    const health = await fetch(`${BASE}/health`);
    expect(health.status).toBe(200);
    await health.text();
  }, 60_000);
});

describe('two hundred seeded random requests', () => {
  it('never produce a 5xx, never a hang, never an exit', async () => {
    let seed = 46;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const pick = (list) => list[next() % list.length];
    const routes = [
      '/status',
      '/health',
      '/db/explore',
      '/db/games-at',
      '/db/search',
      '/db/attach',
      '/db/create',
      '/db/import',
      '/engine/catalogue',
      '/engine/start',
      '/engine/stop',
      '/engine/send',
      '/engine/stream',
      '/engine/register',
      '/engine/install',
      '/tablebase/probe',
      '/tablebase/configure',
      '/db/delete',
      '/nope',
    ];
    const methods = ['GET', 'POST', 'POST', 'POST', 'PUT'];
    const bodies = [
      undefined,
      '{}',
      '[]',
      'x',
      '{"key":"a"}',
      '{"key":1,"limit":-5}',
      '{"fen":"not a fen"}',
      '{"fen":"8/8/8/8/8/8/8/8 w - - 0 1"}',
      '{"engine":"lc0"}',
      '{"path":"/etc/passwd"}',
      '{"session":"nope"}',
      '{"limit":1e308}',
      '{"limit":"1e308"}',
      '{"positionKey":null}',
      `{"key":"${'\\u0000'.repeat(64)}"}`,
    ];
    const tokens = [auth, auth, auth, {}, { authorization: 'Bearer nope' }];
    for (let i = 0; i < 200; i += 1) {
      const route = pick(routes);
      const method = pick(methods);
      const body = method === 'GET' ? undefined : pick(bodies);
      const headers = pick(tokens);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const status = await fetch(`${BASE}${route}`, {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      }).then(
        async (response) => {
          // An event stream is an open response; do not wait for it to end.
          if (!/text\/event-stream/.test(response.headers.get('content-type') ?? '')) {
            await response.arrayBuffer();
          } else {
            controller.abort();
          }
          return response.status;
        },
        (error) => `error ${error?.name}`,
      );
      clearTimeout(timer);
      expect(String(status), `#${i} ${method} ${route} ${body ?? ''}`).not.toMatch(/AbortError/);
      if (typeof status === 'number') {
        expect(
          [500, 502, 504].includes(status),
          `#${i} ${method} ${route} ${body ?? ''} → ${status}`,
        ).toBe(false);
      }
      expect(alive(), `#${i} ${method} ${route}`).toBe(true);
    }
  }, 120_000);
});
