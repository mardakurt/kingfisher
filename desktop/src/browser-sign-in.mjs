/**
 * Signing in to a Kingfisher account with Google, from the desktop application.
 *
 * Google refuses OAuth in an embedded window — the Lichess approach in
 * `oauth-window.mjs`, a child `BrowserWindow`, is exactly what it blocks. So
 * this sign-in happens in the person's own browser, and the only question is
 * how the result gets back to the window that asked for it.
 *
 * The answer is a loopback redirect (RFC 8252 §7.3), started per sign-in:
 *
 *   1. The renderer asks for a sign-in. The shell listens on
 *      `127.0.0.1:<ephemeral port>` and answers with a redirect URI whose path
 *      carries a random nonce: `http://127.0.0.1:<port>/auth/desktop/<nonce>`.
 *   2. The renderer generates the PKCE verifier itself — supabase-js does,
 *      with `skipBrowserRedirect` — and hands back the authorize URL. The
 *      shell checks that URL is a Supabase authorize request for Google that
 *      returns to *this* listener, and only then opens it in the browser.
 *   3. Google → Supabase → the browser is redirected to the listener with a
 *      `code`. The shell tells the browser it can go back to Kingfisher, closes
 *      the listener, and resolves the renderer's request with the code.
 *   4. The renderer exchanges the code with the verifier it kept.
 *
 * Why not a registered URL scheme: every copy of Kingfisher on the machine —
 * an older build in Downloads, the harness's bundle — would compete for it,
 * and LaunchServices, not the running application, picks the winner. A
 * loopback listener can only be answered to the process that opened it.
 *
 * What the shell holds is one pending request and nothing else: no verifier,
 * no token, no session. A code is useless without the verifier, which never
 * leaves the renderer's storage.
 */

import { randomBytes as nodeRandomBytes } from 'node:crypto';

export const CALLBACK_PREFIX = '/auth/desktop/';
const LOOPBACK = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;

/**
 * Is this the authorize request the shell may open for `redirectUri`?
 *
 * The shell opens one URL in the person's browser on the renderer's word, so
 * it is exact about which: a Supabase Auth `/auth/v1/authorize` request for
 * the Google provider, carrying a PKCE challenge, whose `redirect_to` is the
 * listener this sign-in started. HTTPS, except for a Supabase running on this
 * machine in development.
 */
export function isAccountAuthorizeUrl(url, redirectUri) {
  let parsed;
  let expected;
  try {
    parsed = new URL(url);
    expected = new URL(redirectUri);
  } catch {
    return false;
  }
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.pathname !== '/auth/v1/authorize') return false;
  const params = parsed.searchParams;
  if (params.get('provider') !== 'google') return false;
  if (!params.get('code_challenge')) return false;
  if ((params.get('code_challenge_method') ?? '').toLowerCase() !== 's256') return false;
  let returning;
  try {
    returning = new URL(params.get('redirect_to') ?? '');
  } catch {
    return false;
  }
  return returning.origin === expected.origin && returning.pathname === expected.pathname;
}

/**
 * What a request to the listener means.
 *
 * `code` and `error` end the sign-in. `pending` is the right path with
 * neither — Supabase reports some errors in the fragment, which a browser does
 * not send, so the page asks the browser to resend them as a query. `ignore`
 * is anything else: a wrong path, a wrong `Host` (a page elsewhere reaching
 * loopback through DNS rebinding), a favicon.
 */
export function readCallback({ method, url, host }, expected) {
  if (method !== 'GET') return { kind: 'ignore' };
  if (host !== expected.host) return { kind: 'ignore' };
  let parsed;
  try {
    parsed = new URL(url, `http://${expected.host}`);
  } catch {
    return { kind: 'ignore' };
  }
  if (parsed.pathname !== expected.path) return { kind: 'ignore' };
  const code = parsed.searchParams.get('code');
  if (code !== null) {
    return CODE_PATTERN.test(code)
      ? { kind: 'code', code }
      : { kind: 'error', message: 'The sign-in returned a malformed code.' };
  }
  const error = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (error !== null) {
    return { kind: 'error', message: error.slice(0, 300) || 'The sign-in did not complete.' };
  }
  return { kind: 'pending' };
}

const PAGE_STYLE =
  'body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f5f2;color:#1d1d1f}' +
  'main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:20px;margin:0 0 .5rem}p{margin:0;color:#555}' +
  '@media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f2f2f2}p{color:#aaa}}';

const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** The page the person's browser shows after the redirect. */
export function callbackPage(kind, message = '') {
  const title =
    kind === 'code'
      ? 'You are signed in to Kingfisher'
      : kind === 'error'
        ? 'Sign-in did not complete'
        : 'Returning to Kingfisher…';
  const body =
    kind === 'code'
      ? 'You can close this tab and go back to Kingfisher.'
      : kind === 'error'
        ? `${escapeHtml(message)} Go back to Kingfisher to try again.`
        : 'If nothing happens, go back to Kingfisher and try again.';
  // Errors Supabase put in the fragment come back as a query, once.
  const script =
    kind === 'pending'
      ? '<script>if(location.hash.length>1)location.replace(location.pathname+"?"+location.hash.slice(1))</script>'
      : '';
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kingfisher</title>` +
    `<meta name="viewport" content="width=device-width"><style>${PAGE_STYLE}</style>${script}</head>` +
    `<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`
  );
}

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  // The code is in this page's URL; nothing it links to may be told it.
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  'x-content-type-options': 'nosniff',
};

/**
 * One sign-in at a time, owned by the main process.
 *
 * Dependencies are passed in — `createServer` from `node:http`, the shell's
 * `openExternal` — so the whole round trip can be run in a unit test with a
 * real listener and a fetch standing in for the browser.
 *
 * Outcomes the renderer's request resolves with:
 *   `{ status: 'code', code }`, `{ status: 'error', message }`,
 *   `{ status: 'canceled' }` (the person or a newer sign-in ended it),
 *   `{ status: 'timeout' }`, `{ status: 'refused' }` (not a URL the shell opens).
 */
export function createBrowserSignIn({
  createServer,
  openExternal,
  onReturn = () => {},
  log = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  randomBytes = nodeRandomBytes,
}) {
  let pending = null;

  const settle = (flow, outcome) => {
    if (pending !== flow || flow.done) return;
    flow.done = true;
    pending = null;
    clearTimeout(flow.timer);
    flow.server.close();
    flow.server.closeAllConnections?.();
    flow.resolve(outcome);
    log('account', `Google sign-in ${outcome.status}`);
  };

  async function begin() {
    if (pending) settle(pending, { status: 'canceled' });
    const nonce = randomBytes(24).toString('hex');
    const path = `${CALLBACK_PREFIX}${nonce}`;
    let resolve;
    const result = new Promise((r) => (resolve = r));
    const flow = { path, host: '', server: null, timer: null, done: false, opened: false };
    flow.result = result;
    flow.resolve = resolve;

    flow.server = createServer((request, response) => {
      const reading = readCallback(
        { method: request.method, url: request.url ?? '', host: request.headers.host ?? '' },
        flow,
      );
      if (reading.kind === 'ignore') {
        response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
        response.end('Not found');
        return;
      }
      response.writeHead(200, PAGE_HEADERS);
      response.end(callbackPage(reading.kind, reading.message), () => {
        if (reading.kind === 'pending') return;
        settle(
          flow,
          reading.kind === 'code'
            ? { status: 'code', code: reading.code }
            : { status: 'error', message: reading.message },
        );
        onReturn();
      });
    });

    await new Promise((ok, fail) => {
      flow.server.once('error', fail);
      flow.server.listen(0, LOOPBACK, () => {
        flow.server.off('error', fail);
        ok();
      });
    });
    flow.host = `${LOOPBACK}:${flow.server.address().port}`;
    flow.timer = setTimeout(() => settle(flow, { status: 'timeout' }), timeoutMs);
    flow.timer.unref?.();
    pending = flow;
    log('account', `Google sign-in listening on ${flow.host}`);
    return { redirectUri: `http://${flow.host}${path}` };
  }

  /** Open the authorize URL in the person's browser, and wait for its return. */
  function open(url) {
    const flow = pending;
    if (!flow || flow.opened || typeof url !== 'string') {
      return Promise.resolve({ status: 'refused' });
    }
    if (!isAccountAuthorizeUrl(url, `http://${flow.host}${flow.path}`)) {
      log('account', 'refused to open a URL that is not this sign-in');
      settle(flow, { status: 'refused' });
      return flow.result;
    }
    flow.opened = true;
    Promise.resolve(openExternal(url)).catch((error) =>
      settle(flow, {
        status: 'error',
        message: `Kingfisher could not open your browser: ${error?.message ?? error}`,
      }),
    );
    return flow.result;
  }

  function cancel() {
    if (pending) settle(pending, { status: 'canceled' });
  }

  return {
    begin,
    open,
    cancel,
    /** Whether a listener is open — for tests and Diagnostics, never for routing. */
    get active() {
      return pending !== null;
    },
  };
}
