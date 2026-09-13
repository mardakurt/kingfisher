/**
 * Signing in with Lichess, inside the desktop application.
 *
 * The web application signs in with the Authorization Code flow: it sends
 * the browser to `https://lichess.org/oauth`, and Lichess sends it back to
 * `<origin>/oauth/lichess?code=…`, where the page exchanges the code using a
 * verifier it kept in `localStorage`. In the shell that could not work. The
 * window refuses to navigate anywhere but its own server — rightly — and
 * handed the Lichess URL to the user's browser, so the person signed in
 * *there*, Lichess redirected *there*, and the callback ran in a browser
 * that had never seen the verifier: "no sign-in is pending", every time.
 *
 * So the sign-in gets a window of its own. A child window loads the Lichess
 * page; the moment Lichess redirects it to the application's callback, the
 * child is closed and the *main* window — the one holding the verifier —
 * loads that callback URL instead. Nothing about the flow changes for the
 * web; the shell only decides where the two navigations happen.
 */

export const LICHESS_AUTHORIZE_ORIGIN = 'https://lichess.org';
export const LICHESS_AUTHORIZE_PATH = '/oauth';
export const LICHESS_CALLBACK_PATH = '/oauth/lichess';

/** Is this the start of a Lichess sign-in? */
export function isLichessAuthorizeUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === LICHESS_AUTHORIZE_ORIGIN &&
      (parsed.pathname === LICHESS_AUTHORIZE_PATH ||
        parsed.pathname.startsWith(`${LICHESS_AUTHORIZE_PATH}/`))
    );
  } catch {
    return false;
  }
}

/**
 * Is this Lichess sending the sign-in back to the application?
 *
 * Only the application's own origin and only its callback path: a redirect
 * anywhere else — Lichess's own login, a two-factor page, an error page — is
 * the sign-in still in progress and stays in the child window.
 */
export function isLichessCallbackUrl(url, appUrl) {
  try {
    const parsed = new URL(url);
    const app = new URL(appUrl);
    return parsed.origin === app.origin && parsed.pathname === LICHESS_CALLBACK_PATH;
  } catch {
    return false;
  }
}

/**
 * Open the sign-in window and route its outcome back to `parent`.
 *
 * `BrowserWindow` is passed in rather than imported so the decision logic
 * above can be tested without Electron.
 */
export function openLichessSignIn({ BrowserWindow, parent, url, appUrl, log, openExternal }) {
  const child = new BrowserWindow({
    parent,
    width: 560,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'Sign in with Lichess',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  let settled = false;
  const finish = (target) => {
    if (settled) return;
    settled = true;
    log?.('oauth', `Lichess sign-in returned to the application`);
    if (!child.isDestroyed()) child.close();
    if (!parent.isDestroyed()) {
      void parent.loadURL(target);
      parent.focus();
    }
  };

  const intercept = (event, target) => {
    if (isLichessCallbackUrl(target, appUrl)) {
      event.preventDefault();
      finish(target);
      return;
    }
    // The sign-in may pass through Lichess's own pages; anything off Lichess
    // is not part of it and goes to the user's browser, as it would from the
    // main window.
    if (!target.startsWith(LICHESS_AUTHORIZE_ORIGIN) && !target.startsWith(appUrl)) {
      event.preventDefault();
      if (target.startsWith('https://')) openExternal?.(target);
    }
  };
  child.webContents.on('will-redirect', intercept);
  child.webContents.on('will-navigate', intercept);
  child.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) openExternal?.(target);
    return { action: 'deny' };
  });

  child.once('ready-to-show', () => child.show());
  child.on('closed', () => {
    if (!settled) log?.('oauth', 'Lichess sign-in window closed before it finished');
  });
  void child.loadURL(url);
  return child;
}
