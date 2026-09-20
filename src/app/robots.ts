import type { MetadataRoute } from 'next';
import { publicUrl } from '@/release/public-urls';

/**
 * /robots.txt
 *
 * The landing and the public documents are the only surfaces that
 * should be indexed like a marketing site. The Studio is an
 * application; its routes are application surfaces, not search
 * landing pages, and every response to one carries
 * `X-Robots-Tag: noindex, nofollow` from `src/proxy.ts`. A
 * `Disallow: /analysis` etc. is not the right tool here: the
 * application shares the origin with the landing, and a disallowed
 * route can still be indexed from links — the header is what keeps
 * it out.
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
