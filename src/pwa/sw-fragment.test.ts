/**
 * The service worker and URL fragments.
 *
 * `public/sw.js` is plain script, not a module, so it is loaded here into a
 * stubbed worker global and driven through its `fetch` listener with a fake
 * Cache API — the real one's one property that matters is reproduced: it
 * ignores fragments when matching and hands back the Response that was
 * stored, URL and all.
 *
 * The bug this pins: every Turbopack worker shares one bootstrap script and
 * differs only by `#params=`. Served from the cache, the second worker kind
 * received the first kind's Response, whose URL carried the first kind's
 * params, and became the other worker.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

type Listener = (event: unknown) => void;

class NetworkResponse extends Response {
  readonly #url: string;
  constructor(body: string, url: string, init?: ResponseInit) {
    super(body, init);
    this.#url = url;
  }
  override get url(): string {
    return this.#url;
  }
  override clone(): Response {
    return new NetworkResponse('', this.#url, { headers: this.headers, status: this.status });
  }
}

function loadServiceWorker() {
  const listeners = new Map<string, Listener[]>();
  const store = new Map<string, Response>();
  const stripFragment = (url: string) => url.split('#')[0] as string;
  const cache = {
    match: async (request: Request | string) =>
      store.get(stripFragment(typeof request === 'string' ? request : request.url)) ?? undefined,
    put: async (request: Request | string, response: Response) => {
      store.set(stripFragment(typeof request === 'string' ? request : request.url), response);
    },
  };
  const self = {
    location: { origin: 'https://studio.test', href: 'https://studio.test/sw.js' },
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting: () => undefined,
    KINGFISHER_BUILD: 'test',
  };
  const context = vm.createContext({
    self,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (request: Request) => {
      // The network answers with a Response that remembers the URL it was
      // fetched for — fragment included, as a worker script fetch does —
      // and keeps remembering it through clone(), as a real one does.
      const url = typeof request === 'string' ? request : request.url;
      return new NetworkResponse(`bootstrap for ${url}`, url);
    },
    Response,
    Request,
    Headers,
    URL,
    Date,
    Number,
    console,
    Promise,
  });
  vm.runInContext(readFileSync(path.resolve('public/sw.js'), 'utf8'), context);
  return { listeners, store };
}

async function serve(listeners: Map<string, Listener[]>, url: string): Promise<Response> {
  const request = new Request(url);
  let responded: Promise<Response> | null = null;
  const event = {
    request,
    respondWith: (promise: Promise<Response>) => {
      responded = promise;
    },
  };
  for (const listener of listeners.get('fetch') ?? []) listener(event);
  if (!responded) throw new Error('the service worker did not respond');
  return responded;
}

describe('the service worker keeps a worker script’s own fragment', () => {
  const bootstrap = 'https://studio.test/_next/static/immutable/chunks/turbopack-worker-abc.js';
  const explorer = `${bootstrap}#params=%5B%5B%22explorer-chunk.js%22%5D%5D`;
  const importer = `${bootstrap}#params=%5B%5B%22pgn-chunk.js%22%5D%5D`;

  it('serves the second worker kind without the first kind’s URL', async () => {
    const { listeners, store } = loadServiceWorker();
    // The explorer's worker starts first and populates the cache.
    const first = await serve(listeners, explorer);
    expect(await first.text()).toContain('explorer-chunk');
    // Give the background revalidation a tick to store its clone.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.size).toBe(1);
    expect(store.get(bootstrap)?.url).toBe(explorer);

    // The importer's worker starts next: same script, other fragment.
    const second = await serve(listeners, importer);
    // Whatever body it gets, the response must not carry the explorer's URL,
    // or the browser makes the importer's worker into an explorer.
    expect(second.url).toBe('');
  });

  it('leaves fragment-less static assets alone', async () => {
    const { listeners } = loadServiceWorker();
    const chunk = 'https://studio.test/_next/static/immutable/chunks/app.js';
    const response = await serve(listeners, chunk);
    expect(response.url).toBe(chunk);
  });
});
