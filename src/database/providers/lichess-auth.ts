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
