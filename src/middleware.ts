/**
 * Host-based middleware.
 *
 * Kingfisher's public surface is two products on separate origins:
 *
 *   - the *landing page* on `kingfisher-chess.vercel.app/` (or any
 *     domain the owner maps to the marketing origin);
 *   - the *studio* on `studio.kingfisher-chess.vercel.app/`.
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
 * The decision logic lives in `middleware-host-rules.ts` so the rule
 * is unit-testable in isolation.
 *
 * `KINGFISHER_STUDIO_HOST` names the host that should be treated as
 * the studio. When unset, the middleware is a no-op and the project
 * behaves as a single-origin Next.js app. That keeps local
 * development at `localhost:3210` working without configuration.
 */

import { NextRequest, NextResponse } from 'next/server';

import { routingFor } from './middleware-host-rules';

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const action = routingFor(request.headers.get('host'), url.pathname);
  switch (action.kind) {
    case 'next':
      return NextResponse.next();
    case 'redirect': {
      const fallback = url.clone();
      fallback.pathname = action.to;
      fallback.search = '';
      return NextResponse.redirect(fallback);
    }
    case 'rewrite': {
      const rewritten = url.clone();
      rewritten.pathname = action.to;
      return NextResponse.rewrite(rewritten);
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
