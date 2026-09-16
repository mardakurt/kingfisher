import type { MetadataRoute } from 'next';
import { publicUrl } from '@/release/public-urls';

/**
 * /sitemap.xml
 *
 * Only canonical, indexable public pages appear here. The
 * Studio is intentionally absent: a search result that points
 * at /analysis is a worse experience than no result.
 *
 * `lastModified` is set per-page so the sitemap reflects real
 * document freshness — the landing and install guide change
 * with every release, the legal pages change rarely. The
 * Studio does not appear here and never will.
 */
const LANDING_UPDATED = '2026-09-16';
const INSTALL_UPDATED = '2026-09-16';
const LEGAL_UPDATED = '2026-09-16';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicUrl.landing;
  return [
    {
      url: `${base}/`,
      lastModified: new Date(LANDING_UPDATED),
      changeFrequency: 'weekly',
      priority: 1,
      alternates: undefined,
    },
    {
      url: `${base}/install`,
      lastModified: new Date(INSTALL_UPDATED),
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: undefined,
    },
    {
      url: `${base}/privacy`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/security`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/data-licences`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/terms`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
  ];
}
