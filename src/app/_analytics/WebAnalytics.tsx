'use client';
/**
 * Vercel Web Analytics — page-view counts for the website.
 *
 * What leaves the browser: the page path, the referrer, and what the
 * request itself already carries (country from the IP, browser and OS
 * family, device class). No cookie is set and no identifier is stored
 * on the device; Vercel derives a per-day visitor hash on its side and
 * discards the IP. The privacy page states exactly this.
 *
 * Two guarantees are enforced here rather than promised:
 *
 *   - `beforeSend` strips the query string and the fragment from every
 *     event. An application URL can carry a position (`?fen=…`) and a
 *     person's chess is never part of a page view.
 *   - The component is rendered by the root layout only when the build
 *     runs on Vercel (`process.env.VERCEL`). The Mac application is the
 *     same code served over loopback and never loads the script.
 *
 * The script is served from this origin (`/_vercel/insights/script.js`)
 * and posts to `/_vercel/insights/view`, so the `'self'` CSP admits it
 * without a third-party host.
 */
import { Analytics, type BeforeSend } from '@vercel/analytics/next';

export const stripQueryAndHash: BeforeSend = (event) => {
  try {
    const url = new URL(event.url, 'https://kingfisherchess.app');
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
};

export function WebAnalytics() {
  return <Analytics beforeSend={stripQueryAndHash} />;
}
