/**
 * Host-based proxy (Next's `proxy` file convention, formerly `middleware`).
 *
 * Kingfisher's public surface is one origin, `kingfisherchess.app`: the
 * landing at `/`, the public documents (`/install`, `/privacy`, …) and the
 * application at `/analysis` and the other routes, exactly as on
 * `localhost`. The host-routing rules also still understand a dedicated
 * studio host — one that is the application and nothing else — for the
 * deployments that had one before 2026-09-13 and for anyone who maps one.
 *
 * The application routes are the working product — every page there is
 * either deeply user-specific (a Study, a Repertoire chapter, a Training
 * queue) or a product surface (Settings). It is not a place a search engine
 * should ever send a visitor. Every application response therefore carries
 * `X-Robots-Tag: noindex`, which is the one contract that works without
 * shipping a different HTML document per host, and is what Google itself
 * recommends for host-scoped noindex. The landing and the public documents
 * are untouched and remain fully indexable.
 *
 * The decision logic lives in `proxy-host-rules.ts` so the rule is
 * unit-testable in isolation; this file is a thin shim around it.
 *
 * `KINGFISHER_STUDIO_HOST` names an additional host that should be treated
 * as the application-only studio. When unset, only the defaults in
 * `proxy-host-rules.ts` apply, which keeps local development at
 * `localhost:3210` working without configuration.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { noindexFor, routingFor } from './proxy-host-rules';

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get('host');
  const action = routingFor(host, url.pathname);
  switch (action.kind) {
    case 'next': {
      // Application responses carry a noindex header. The marketing
      // page and the public documents do not — they *are* meant to be
      // indexed, on the public host as on the old landing host.
      if (noindexFor(host, url.pathname)) {
        const res = NextResponse.next();
        res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return res;
      }
      return NextResponse.next();
    }
    case 'redirect': {
      const fallback = url.clone();
      fallback.pathname = action.to;
      fallback.search = '';
      return NextResponse.redirect(fallback);
    }
    case 'rewrite': {
      const rewritten = url.clone();
      rewritten.pathname = action.to;
      const res = NextResponse.rewrite(rewritten);
      res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return res;
    }
  }
}

export const config = {
  /*
    The proxy runs for every navigation path. Static assets
    and Next's own internals are filtered out so a studio-host
    request for `/_next/static/...` is not redirected.
  */
  matcher: ['/((?!_next/static|_next/image).*)'],
};
