import type { MetadataRoute } from 'next';
import { publicUrl } from '@/release/public-urls';

/**
 * /sitemap.xml
 *
 * Only canonical, indexable public pages appear here. The
 * Studio is intentionally absent: a search result that points
 * at /analysis is a worse experience than no result.
 *
 * `lastModified` uses a fixed, source-controlled date so the
 * sitemap is not a moving target; the actual freshness comes
 * from the page's structured data and the last build's commit
 * hash surfaced through the Vercel deploy header.
 */
const PUBLISHED = '2026-09-10';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicUrl.landing;
  const paths = ['', '/install', '/privacy', '/security', '/data-licences', '/terms'];
  return paths.map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(PUBLISHED),
    changeFrequency: 'monthly' as const,
    priority: p === '' ? 1 : 0.6,
    alternates: undefined,
  }));
}
