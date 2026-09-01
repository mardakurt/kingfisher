import type { MetadataRoute } from 'next';

/**
 * Installable-app metadata.
 *
 * Kingfisher is local-first — the whole database lives in the browser — so
 * being installable is not a gimmick here: an installed window keeps its own
 * storage and its own icon, which is exactly the model the product already has.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kingfisher — chess research workspace',
    short_name: 'Kingfisher',
    description:
      'Engine analysis, opening databases, repertoire and training in one local-first workspace.',
    start_url: '/analysis',
    display: 'standalone',
    background_color: '#0b0d11',
    theme_color: '#0b0d11',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
