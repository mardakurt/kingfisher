import { describe, expect, it } from 'vitest';

import { isLichessAuthorizeUrl, isLichessCallbackUrl } from './oauth-window.mjs';

/**
 * The shell's two decisions about a Lichess sign-in: which navigation opens
 * the sign-in window, and which one closes it and returns to the
 * application. Both are exact — a wrong "yes" here would route an arbitrary
 * page into the main window, which is the one thing the shell's navigation
 * policy exists to prevent.
 */
describe('recognising a Lichess sign-in', () => {
  it('opens the window for the authorize endpoint only', () => {
    expect(isLichessAuthorizeUrl('https://lichess.org/oauth?response_type=code&client_id=x')).toBe(
      true,
    );
    expect(isLichessAuthorizeUrl('https://lichess.org/oauth/')).toBe(true);
    expect(isLichessAuthorizeUrl('https://lichess.org/@/thibault')).toBe(false);
    expect(isLichessAuthorizeUrl('https://example.com/oauth')).toBe(false);
    expect(isLichessAuthorizeUrl('http://lichess.org/oauth')).toBe(false);
    expect(isLichessAuthorizeUrl('not a url')).toBe(false);
  });

  it('returns to the application on its own callback path and nowhere else', () => {
    const app = 'http://127.0.0.1:41234/';
    expect(isLichessCallbackUrl('http://127.0.0.1:41234/oauth/lichess?code=abc&state=s', app)).toBe(
      true,
    );
    expect(isLichessCallbackUrl('http://127.0.0.1:41234/analysis', app)).toBe(false);
    expect(isLichessCallbackUrl('http://127.0.0.1:9999/oauth/lichess?code=abc', app)).toBe(false);
    expect(isLichessCallbackUrl('https://lichess.org/oauth/lichess', app)).toBe(false);
    expect(isLichessCallbackUrl('garbage', app)).toBe(false);
  });
});
