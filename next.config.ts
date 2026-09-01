import type { NextConfig } from 'next';

/**
 * Cross-origin isolation unlocks SharedArrayBuffer, which the multi-threaded
 * Stockfish build requires. It is opt-in because COEP also constrains which
 * third-party resources the page may embed; the single-threaded engine build
 * works everywhere without it. See docs/adr/0004-engine-architecture.md.
 */
const crossOriginIsolation = process.env.KINGFISHER_CROSS_ORIGIN_ISOLATION === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    if (!crossOriginIsolation) return [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
