/**
 * Host-based middleware.
 *
 * Kingfisher's public surface is two products on separate origins:
 *
 *   - the *landing page* on `kingfisher-chess.vercel.app/` (or any
 *     domain the owner maps to the marketing origin);
 *   - the *studio* on `kingfisher-roan.vercel.app/` (or any
 *     additional host the owner maps to the studio origin).
 *
 * A player who has the studio bookmarked opens the studio directly;
 * they do not pass through the landing page. A reader who has not
 * installed anything yet opens the landing page and clicks a link.
 *
 * The same Next.js project serves both. The host header tells the
 * middleware which surface the visitor is asking for. The studio's
 * existing routes (`/analysis`, `/openings`, ...) are served as-is;
 * the landing page (`/`) is rejected if the visitor is on the studio
 * host, and any studio route on the landing host redirects to `/`.
 *
 * The studio surface is the working application — every page there is
 * either deeply user-specific (a Study, a Repertoire chapter, a
 * Training queue) or a product surface (Settings). It is not a place
 * a search engine should ever send a visitor. The middleware adds a
 * `X-Robots-Tag: noindex` header to every studio response so the
 * search engines that respect the header keep the whole studio out
 * of their index. The header is the only contract that works without
 * shipping a different HTML document per host, and it is what Google
 * itself recommends for host-scoped noindex. The marketing origin is
 * untouched and remains fully indexable.
 *
 * The decision logic lives in `middleware-host-rules.ts` so the rule
 * is unit-testable in isolation.
 *
 * `KINGFISHER_STUDIO_HOST` names the host that should be treated as
 * the studio. When unset, the middleware is a no-op and the project
 * behaves as a single-origin Next.js app. That keeps local
 * development at `localhost:3210` working without configuration.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { routingFor, studioHostFor } from './middleware-host-rules';

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get('host');
  const action = routingFor(host, url.pathname);
  const isStudio = studioHostFor(host) !== null;
  switch (action.kind) {
    case 'next': {
      // Studio responses carry a noindex header. We do not apply it to
      // the marketing origin — that surface *is* meant to be indexed.
      if (isStudio) {
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
    The middleware runs for every navigation path. Static assets
    and Next's own internals are filtered out so a studio-host
    request for `/_next/static/...` is not redirected.
  */
  matcher: ['/((?!_next/static|_next/image).*)'],
};
