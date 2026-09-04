/**
 * Signing in to Lichess without a server, and without a secret.
 *
 * Phase 5 decided that Kingfisher would ask for a personal access token,
 * because the alternative appeared to be shipping a client secret. That was
 * the wrong reading: Lichess supports the OAuth Authorization Code flow with
 * PKCE for *public* clients, which is designed for exactly this — an
 * application with no backend, no secret to keep, and a redirect back to
 * itself. Their own documented example for client-side apps uses it.
 *
 * So the flow is now: press Connect, approve on lichess.org, come back
 * connected. The personal token stays as an advanced fallback, because a
 * scripted or offline setup still wants one.
 *
 * Everything in this file is pure except `beginLichessLogin`, which touches
 * `sessionStorage` and `location`. That is deliberate: the parts worth testing
 * — the challenge, the state check, the parameters, the token request — are
 * testable without a browser, and the part that cannot be is three lines.
 */

/** Lichess's own endpoints, as their client-side example documents them. */
export const LICHESS_AUTHORIZE_URL = 'https://lichess.org/oauth';
export const LICHESS_TOKEN_ENDPOINT = 'https://lichess.org/api/token';

/**
 * Where Lichess sends the browser back to.
 *
 * Its own route rather than the page the user was on, so that a redirect
 * carrying `?code=` can never be mistaken for an ordinary navigation, and so
 * the code is consumed and removed from the URL before anything else renders.
 */
export const LICHESS_REDIRECT_PATH = '/oauth/lichess';

/**
 * The scopes Kingfisher asks for: none.
 *
 * Everything Kingfisher does with a Lichess token — read the account it
 * belongs to, query the opening explorer, download a user's public games —
 * works with a token that carries no scopes at all. Asking for more because it
 * might be useful later is how an application ends up holding permissions
 * nobody agreed to give it for a reason anybody remembers.
 */
export const LICHESS_SCOPES: readonly string[] = [];

const STORAGE_KEY = 'kingfisher.lichess-pkce';

export interface PkceRequest {
  readonly state: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly createdAt: number;
}

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. */
export function randomVerifier(length = 64, random: Crypto = crypto): string {
  const bytes = new Uint8Array(length);
  random.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += UNRESERVED[byte % UNRESERVED.length];
  return out;
}

const base64url = (bytes: ArrayBuffer): string => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** RFC 7636 §4.2, S256. Plain is never used: it protects nothing. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/**
 * The client identifier.
 *
 * Lichess does not register public clients, so this is a string that identifies
 * the application to the user on the consent screen. Their own example uses a
 * domain; Kingfisher uses its origin, which is both descriptive and unique per
 * installation.
 */
export const lichessClientId = (origin: string): string => `${origin}/`;

export function authorizeUrl(request: PkceRequest): string {
  const url = new URL(LICHESS_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', request.clientId);
  url.searchParams.set('redirect_uri', request.redirectUri);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', request.codeChallenge);
  url.searchParams.set('state', request.state);
  // An empty `scope` is meaningful — it asks for a token with no permissions
  // beyond identifying the account — but an empty *parameter* is not, so it is
  // omitted rather than sent blank.
  if (LICHESS_SCOPES.length > 0) url.searchParams.set('scope', LICHESS_SCOPES.join(' '));
  return url.toString();
}

export class LichessAuthError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'LichessAuthError';
  }
}

/**
 * Check the callback before a single byte of it is used.
 *
 * The `state` comparison is the whole defence against a code injected by
 * another site, so it happens first, and a mismatch is refused rather than
 * repaired. `error` from the authorization server is surfaced with its own
 * description, because "access_denied" means the user pressed Cancel and
 * should not be reported as a failure.
 */
export function readCallback(
  params: URLSearchParams,
  stored: PkceRequest | null,
): { readonly code: string; readonly request: PkceRequest } {
  const error = params.get('error');
  if (error) {
    throw new LichessAuthError(
      error === 'access_denied'
        ? 'The Lichess sign-in was cancelled.'
        : `Lichess refused the sign-in: ${params.get('error_description') ?? error}.`,
      error === 'access_denied' ? 'Nothing was changed.' : 'Try connecting again.',
    );
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    throw new LichessAuthError(
      'That page was opened without a Lichess authorization code.',
      'Start the connection from Settings → Accounts.',
    );
  }
  if (!stored) {
    throw new LichessAuthError(
      'There is no sign-in in progress in this browser.',
      'Start the connection again from Settings → Accounts.',
    );
  }
  if (stored.state !== state) {
    throw new LichessAuthError(
      'The Lichess response did not match the request this browser made.',
      'Nothing was connected. Start the connection again.',
    );
  }
  return { code, request: stored };
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly expiresIn?: number;
  readonly tokenType: string;
}

/** Exchange the authorization code. No secret is sent, because there is none. */
export async function exchangeCode(
  code: string,
  request: PkceRequest,
  fetcher: typeof fetch = fetch,
): Promise<TokenResponse> {
  const response = await fetcher(LICHESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: request.codeVerifier,
      redirect_uri: request.redirectUri,
      client_id: request.clientId,
    }),
  });

  if (response.status === 429) {
    throw new LichessAuthError(
      'Lichess is rate limiting sign-in requests.',
      'Wait a minute and try again.',
    );
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown; error_description?: unknown };
      if (typeof body.error === 'string') detail = String(body.error_description ?? body.error);
    } catch {
      // A non-JSON error body is still an error; the status is what we have.
    }
    throw new LichessAuthError(
      `Lichess would not issue a token: ${detail}.`,
      'Start the connection again from Settings → Accounts.',
    );
  }

  const body = (await response.json()) as {
    access_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
  };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new LichessAuthError('Lichess returned a response with no access token.');
  }
  return {
    accessToken: body.access_token,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    ...(typeof body.expires_in === 'number' ? { expiresIn: body.expires_in } : {}),
  };
}

/** Revoking is a courtesy to the user's account page, and it is one request. */
export async function revokeToken(token: string, fetcher: typeof fetch = fetch): Promise<void> {
  await fetcher(LICHESS_TOKEN_ENDPOINT, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    // A revoke that cannot reach Lichess still has to forget the token
    // locally, which the caller does either way.
  });
}

/* ------------------------------------------------------- browser plumbing */

export function storePkceRequest(request: PkceRequest): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request));
}

/**
 * The pending request, consumed.
 *
 * Removed as it is read: an authorization code is single-use, and leaving the
 * verifier behind after a completed or failed exchange only widens the window
 * in which it could be replayed.
 */
export function takePkceRequest(): PkceRequest | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PkceRequest>;
    if (typeof parsed.state !== 'string' || typeof parsed.codeVerifier !== 'string') return null;
    return parsed as PkceRequest;
  } catch {
    return null;
  }
}

/** Build the request, remember it, and hand back where to send the browser. */
export async function beginLichessLogin(origin: string): Promise<string> {
  const codeVerifier = randomVerifier();
  const request: PkceRequest = {
    state: randomVerifier(32),
    codeVerifier,
    codeChallenge: await codeChallenge(codeVerifier),
    redirectUri: `${origin}${LICHESS_REDIRECT_PATH}`,
    clientId: lichessClientId(origin),
    createdAt: Date.now(),
  };
  storePkceRequest(request);
  return authorizeUrl(request);
}
