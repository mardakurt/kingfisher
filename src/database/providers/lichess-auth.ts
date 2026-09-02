/**
 * The user's own Lichess API token.
 *
 * Lichess's opening explorer began requiring authentication, so the honest
 * options were to ship a developer credential (against their terms, and a
 * single point of rate-limiting for every user), scrape (out of the question),
 * or let each user supply their own token. This is the third.
 *
 * Held in a module-level variable rather than read from preferences at the call
 * site, because the provider is constructed outside React. It is mirrored from
 * the stored preference by `useLichessAuthSync`.
 */

let token = '';

export const setLichessToken = (value: string): void => {
  token = value.trim();
};

export const lichessToken = (): string => token;

export const lichessAuthHeaders = (): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

export const hasLichessToken = (): boolean => token.length > 0;

/** Where a user creates one. No scopes are needed for the explorer. */
export const LICHESS_TOKEN_URL =
  'https://lichess.org/account/oauth/token/create?description=Kingfisher%20opening%20explorer';

export interface LichessAccount {
  readonly id: string;
  readonly username: string;
}

/** Validate the token against Lichess itself without ever returning or logging it. */
export async function testLichessAccount(signal?: AbortSignal): Promise<LichessAccount> {
  if (!token) throw new Error('Enter a token before testing the connection.');
  const timeout = AbortSignal.timeout(8_000);
  const combined =
    signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch('https://lichess.org/api/account', {
      signal: combined,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(
      timeout.aborted
        ? 'Lichess did not respond before the connection test timed out.'
        : 'Lichess could not be reached.',
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('Lichess rejected this token. Create a new personal access token and retry.');
  if (response.status === 429)
    throw new Error('Lichess is rate limiting connection tests. Wait before retrying.');
  if (!response.ok) throw new Error(`Lichess returned HTTP ${response.status}.`);
  const value = (await response.json()) as { id?: unknown; username?: unknown };
  if (typeof value.id !== 'string' || typeof value.username !== 'string')
    throw new Error('Lichess returned an unexpected account response.');
  return { id: value.id, username: value.username };
}
