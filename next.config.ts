import type { NextConfig } from 'next';

/**
 * Cross-origin isolation unlocks SharedArrayBuffer, which the multi-threaded
 * Stockfish build requires. It is opt-in because COEP also constrains which
 * third-party resources the page may embed; the single-threaded engine build
 * works everywhere without it. See docs/adr/0004-engine-architecture.md.
 */
const crossOriginIsolation = process.env.KINGFISHER_CROSS_ORIGIN_ISOLATION === '1';

/**
 * The desktop shell serves this application from a Node server it starts
 * itself, so it needs the standalone output — the server plus only the modules
 * it actually reached, rather than a `node_modules` tree.
 *
 * It is opt-in for one reason: the web build is the product's other half, and
 * a flag that changed what `npm run build` emits for everybody would be this
 * phase weakening the web version to make the desktop one easier. With the
 * variable unset, `next build` produces exactly what it produced before.
 * `scripts/build-desktop-web.mjs` is the only thing that sets it.
 */
const desktop = process.env.KINGFISHER_DESKTOP_BUILD === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  ...(desktop ? { output: 'standalone' as const } : {}),
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
