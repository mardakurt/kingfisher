'use client';
/**
 * Vercel Web Analytics and Speed Insights — page-view counts and page
 * load timings for the website.
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
 * Speed Insights adds one more measurement, disclosed the same way: the
 * load timings the browser already computes (Core Web Vitals), per page
 * path, with the connection type and device class. Same rules — no
 * cookie, no identifier, query strings stripped, Vercel builds only.
 *
 * Both scripts are served from this origin (`/_vercel/insights/` and
 * `/_vercel/speed-insights/`), so the `'self'` CSP admits them without
 * a third-party host.
 */
import type { ComponentProps } from 'react';
import { Analytics, type BeforeSend } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

/* The package declares its beforeSend type without exporting it. */
type SpeedBeforeSend = NonNullable<ComponentProps<typeof SpeedInsights>['beforeSend']>;

export const stripQueryAndHash: BeforeSend = (event) => {
  try {
    const url = new URL(event.url, 'https://kingfisherchess.app');
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
};

export const stripQueryAndHashFromTiming: SpeedBeforeSend = (event) => {
  try {
    const url = new URL(event.url, 'https://kingfisherchess.app');
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
};

export function WebAnalytics() {
  return (
    <>
      <Analytics beforeSend={stripQueryAndHash} />
      <SpeedInsights beforeSend={stripQueryAndHashFromTiming} />
    </>
  );
}
