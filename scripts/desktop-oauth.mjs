#!/usr/bin/env node
/**
 * Does "Sign in with Lichess" open inside the application?
 *
 * The shell refuses to navigate its window anywhere but its own server and
 * hands every other URL to the user's browser. For the Lichess sign-in that
 * meant the person signed in *there*, Lichess redirected *there*, and the
 * callback ran in a browser that had never seen the PKCE verifier — "no
 * sign-in is pending", every time, since the flow shipped.
 * `desktop/src/oauth-window.mjs` gives the sign-in a child window instead.
 *
 * This drives the real application to the button and checks what happens:
 * a second window opens, on `https://lichess.org/oauth`, with the
 * application's own loopback callback as `redirect_uri`, and the main window
 * is still on the application. It stops there — completing the sign-in needs
 * a person and a Lichess password — but it is the half that was broken.
 *
 *   npm run desktop:oauth               # the dev shell
 *   npm run desktop:oauth -- --packaged # a built Kingfisher.app
 */

import { argv, exit } from 'node:process';

import { launchKingfisher, waitForReady } from './desktop-lib/launch.mjs';

const args = { packaged: argv.includes('--packaged') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`desktop:oauth — ${args.packaged ? 'packaged Kingfisher.app' : 'the dev shell'}\n`);
  const launched = await launchKingfisher({ packaged: args.packaged });
  const { app, window } = launched;
  try {
    await waitForReady(window);
    const appUrl = new URL(window.url()).origin;
    check('the application is up', appUrl.startsWith('http://127.0.0.1:'), appUrl);

    await window
      .getByRole('button', { name: /^Settings/ })
      .first()
      .click();
    const dialog = window.getByRole('dialog', { name: 'Settings' });
    await dialog.waitFor({ timeout: 15_000 });
    await dialog.getByRole('tab', { name: 'Accounts', exact: true }).click();
    const connect = dialog.getByRole('button', { name: 'Connect Lichess' });
    await connect.waitFor({ timeout: 15_000 });
    check('Settings → Accounts offers Connect Lichess', true);

    const before = app.windows().length;
    const opened = app.waitForEvent('window', { timeout: 30_000 }).catch(() => null);
    await connect.click();
    const child = await opened;
    check(
      'a second window opens for the sign-in',
      child !== null,
      `${before} → ${app.windows().length}`,
    );
    if (!child) return;

    // The child may still be on about:blank for a moment; wait for Lichess.
    let url = child.url();
    for (let attempt = 0; attempt < 60 && !url.startsWith('https://lichess.org/'); attempt += 1) {
      await wait(500);
      url = child.url();
    }
    const parsed = new URL(url);
    check(
      'it is on the Lichess authorize page',
      parsed.origin === 'https://lichess.org' && parsed.pathname === '/oauth',
      `${parsed.origin}${parsed.pathname}`,
    );
    check(
      'the redirect goes back to this application',
      parsed.searchParams.get('redirect_uri') === `${appUrl}/oauth/lichess`,
      parsed.searchParams.get('redirect_uri') ?? '(none)',
    );
    check('PKCE is used', parsed.searchParams.get('code_challenge_method') === 'S256');
    check(
      'the main window stayed on the application',
      window.url().startsWith(appUrl),
      window.url().replace(/:\d+/, ':<port>'),
    );

    await child.close().catch(() => {});
    await wait(500);
    check('closing the sign-in window leaves the application open', !window.isClosed());
  } finally {
    await launched.close();
  }
}

main()
  .then(() => {
    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    exit(failed.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    exit(1);
  });
