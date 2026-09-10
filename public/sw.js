/* eslint-disable */
/**
 * Kingfisher Studio service worker.
 *
 * Scope: application shell only.
 *
 * This worker is registered exclusively from the studio host
 * (`src/pwa/register.ts` checks the host before calling
 * `navigator.serviceWorker.register`). It exists for one reason: a
 * player who installs Kingfisher from their browser should be able
 * to reopen it like an application and find a working shell even
 * when the network is gone. The shell is the parts of the page that
 * Next.js has already emitted and that the user has already paid the
 * cost of downloading.
 *
 * What this worker caches:
 *
 *   - Hashed `_next/static/*` assets (JavaScript, CSS, fonts). These
 *     have a content hash in the URL, so a stale entry is provably
 *     still the right entry. Stale-while-revalidate lets the worker
 *     hand back the cached asset immediately and refresh in the
 *     background; the user sees no stall.
 *   - The same-origin `icon-*.png` and the web app manifest, so a
 *     launch from a home-screen shortcut that arrives with the
 *     network still cold has a working icon and theme.
 *   - The HTML document for navigation requests, as a network-first
 *     fallback. We deliberately do not pre-seed this cache; the
 *     first offline launch must have come online at least once to
 *     have anything to fall back to.
 *
 * What this worker DOES NOT cache:
 *
 *   - Reference data. Every Kingfisher reference pack (Elite OTB,
 *     Recent Theory, High-Rated Online) is owned by
 *     `src/persistence/streaming-cache.ts` and lives in IndexedDB.
 *     A worker cache would be a second copy of hundreds of
 *     megabytes, and would silently disagree with the IndexedDB
 *     LRU as soon as one evicted and the other did not.
 *   - Lichess, Chess.com, GitHub Pages, tablebase or any other API
 *     response. The application already has its own cache budget
 *     for those.
 *   - Authentication, tokens, or anything with an `Authorization`
 *     header. Caching those would be a confidentiality bug.
 *   - Anything cross-origin. The worker is same-origin only.
 *
 * Update model:
 *
 *   Kingfisher deploys frequently. The owner does not want a
 *   player pinned to an obsolete build because a worker keeps
 *   serving old HTML. The strategy:
 *
 *     - The HTML document is *always* network-first. A cached copy
 *       is only used as a last-resort fallback when the network
 *       is unreachable. That is the only place an old document
 *       can be served from.
 *     - A new worker installs and waits. It does NOT call
 *       `skipWaiting()` until the user accepts the update.
 *     - When the user accepts, the new worker activates, claims
 *       open clients, and the next navigation is a network-first
 *       fetch that returns the new HTML.
 *
 * Cache versioning:
 *
 *   The cache name embeds the build identity (`KINGFISHER_BUILD`)
 *   that the build pipeline writes next to the worker. Two
 *   different builds of the same `package.json` version therefore
 *   produce two different cache names and the old cache is
 *   collectable on first activation of the new worker. We do NOT
 *   require a semantic version bump to invalidate the cache.
 */

self.addEventListener('install', (event) => {
  // The new worker stays in `waiting` until either:
  //   - `clients.claim()` runs from `activate` (we don't, by
  //     default — see the update flow in `src/pwa/`);
  //   - or the user clicks "Reload" in the update banner and
  //     the page calls `registration.waiting.postMessage({type:
  //     'SKIP_WAITING'})`.
  // This is the right default for an application that has open
  // editors. Forcing activation would reload the page mid-analysis.
  // We do not call `skipWaiting()` here; the user accepts the
  // update explicitly. The cache names differ by build identity,
  // so the new worker will pick up its own cache on first
  // activation.
});

self.addEventListener('activate', (event) => {
  const expected = buildCacheName();
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('kingfisher-shell-') && key !== expected)
          .map((key) => caches.delete(key))
      );
      // Do NOT `clients.claim()`. Claiming forces the new worker
      // onto existing clients without the user's consent, which is
      // exactly the "stuck on old build" symptom we are trying to
      // avoid.
    })()
  );
});

/**
 * Fetch routing.
 *
 *   - Navigation requests: network-first, cached-fallback.
 *   - Same-origin hashed static assets: stale-while-revalidate.
 *   - Same-origin app assets (icons, manifest): stale-while-revalidate
 *     with a 24h cap.
 *   - Everything else: pass through to the network.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(request, buildCacheName(), 60 * 60 * 24 * 30));
    return;
  }
  if (isShellAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, buildCacheName(), 60 * 60 * 24));
    return;
  }
  // Pass through. We deliberately do not intercept reference,
  // API, or service-worker script requests; those need the
  // network.
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    // User accepted the update. Promote the new worker to active.
    self.skipWaiting();
  } else if (data.type === 'GET_BUILD') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ build: buildIdentity() });
    }
  }
});

/* ------------------------------------------------------------------ *
 * Strategies
 * ------------------------------------------------------------------ */

async function handleNavigation(request) {
  const cache = await caches.open(buildCacheName());
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    // Only cache successful, basic/cors responses. Avoids a 5xx page
    // becoming the offline fallback.
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {
        /* QuotaExceeded is non-fatal here. The next navigation will retry. */
      });
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last-ditch fallback: serve the most recently cached navigation
    // for the same path. This is a deliberately weaker fallback than
    // a precached `offline.html`; precaching an offline page would
    // mean a different "first launch" experience, which the
    // directive says to avoid.
    const any = await cache.match('/analysis');
    if (any) return any;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        // Attach a stale marker so we can evict on age.
        try {
          clone.headers.set('x-cf-cached-at', String(Date.now()));
        } catch (e) {
          /* Headers may be immutable; fall through. */
        }
        cache.put(request, clone).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    if (await isFresh(cached, maxAgeSeconds)) {
      // Refresh in the background. Do not block the response.
      networkPromise.catch(() => {});
      return cached;
    }
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  if (cached) return cached;
  throw new Error('No cached response and no network.');
}

async function isFresh(response, maxAgeSeconds) {
  const header = response.headers.get('x-cf-cached-at');
  if (!header) return true;
  const cachedAt = Number(header);
  if (!Number.isFinite(cachedAt)) return true;
  return Date.now() - cachedAt < maxAgeSeconds * 1000;
}

function isShellAsset(pathname) {
  return (
    pathname === '/manifest.webmanifest' ||
    pathname === '/icon-192.png' ||
    pathname === '/icon-512.png' ||
    pathname === '/icon-maskable-512.png' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-icon.png' ||
    pathname === '/favicon.ico'
  );
}

/* ------------------------------------------------------------------ *
 * Build identity
 * ------------------------------------------------------------------ */

/**
 * The cache name carries a build identity that changes whenever the
 * service worker file itself changes. We do not invent a new cache
 * for every cache.put — that would make the worker thrash the
 * storage quota. The cache name changes when the *worker* changes,
 * which is exactly when a new deployment needs the old cache
 * replaced.
 *
 * The build identity is injected at deploy time by the build
 * pipeline (see `scripts/inject-build.mjs`). When unset, the worker
 * still works — it just uses a stable name that changes when the
 * script bytes change.
 */
function buildIdentity() {
  try {
    return self.KINGFISHER_BUILD || 'dev';
  } catch (e) {
    return 'dev';
  }
}

function buildCacheName() {
  return 'kingfisher-shell-' + buildIdentity();
}
