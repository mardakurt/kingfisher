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
/*
  The date each page's content last changed, from `git log -1 -- <page>`.
  Google reads `lastmod` only while it stays accurate, so a date that
  never moves is a date it learns to ignore: change the matching line
  when you change the page.
*/
const UPDATED = {
  landing: '2026-10-23',
  install: '2026-10-23',
  privacy: '2026-10-23',
  security: '2026-10-23',
  dataLicences: '2026-10-04',
  terms: '2026-09-28',
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicUrl.landing;
  return [
    {
      url: `${base}/`,
      lastModified: new Date(UPDATED.landing),
      changeFrequency: 'weekly',
      priority: 1,
      alternates: undefined,
    },
    {
      url: `${base}/install`,
      lastModified: new Date(UPDATED.install),
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: undefined,
    },
    {
      url: `${base}/privacy`,
      lastModified: new Date(UPDATED.privacy),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/security`,
      lastModified: new Date(UPDATED.security),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/data-licences`,
      lastModified: new Date(UPDATED.dataLicences),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
    {
      url: `${base}/terms`,
      lastModified: new Date(UPDATED.terms),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: undefined,
    },
  ];
}
