import type { MetadataRoute } from 'next';
import { publicUrl } from '@/release/public-urls';

/**
 * /robots.txt
 *
 * The landing is the only surface that should be indexed like a
 * marketing site. The Studio is an application; its routes are
 * application surfaces, not search landing pages, and are marked
 * `noindex, nofollow` per-route. A `Disallow: /analysis` etc. is
 * not the right tool here: the application shares the marketing
 * origin's robots and we want the landing to be fully
 * crawlable.
 *
 * The Studio host (a different Vercel alias) is expected to ship
 * its own robots.txt that disallows all routes, but that file
 * lives on the Studio deployment and is not generated here.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicUrl.landing;
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
