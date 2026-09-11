import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { NextConfig } from 'next';

/**
 * The version, injected from the one place it is written down.
 *
 * `src/lib/version.ts` has always said it read this from "environment
 * variables that the build sets". Until Phase 20 no build set either, so the
 * diagnostic report every user pasted said `0.1.0` whatever the manifest said
 * — a fallback doing the work of a value, silently, and wrong the moment the
 * version changed. Reading the manifest here keeps the version in one place
 * and out of the client bundle: `NEXT_PUBLIC_` is inlined at build time, so
 * nothing pulls `package.json` into the browser.
 *
 * CI may set either variable itself; an existing value always wins, because
 * a release build knows more about its own identity than this file does.
 */
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

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
  /*
    No image optimiser in the standalone build.

    Kingfisher renders no `next/image` anywhere — the pieces are a few hundred
    bytes of SVG each and are drawn with a plain `<img>`, which
    `src/features/board/piece-sets/index.tsx` says and means. The optimiser is
    therefore never invoked, but the standalone trace bundles what it *would*
    need: `sharp`, and under it 27 MB of libvips binaries. That was 28 MB of a
    signed application, for a code path nothing reaches.

    Declared only for the desktop build, because the rule is that the web build
    is never changed to suit the desktop. It would be a behavioural no-op
    either way, but the web build is not standalone and so never bundled
    `sharp` at all — setting it there would be a change with no effect and a
    reason for somebody to wonder later.
  */
  ...(desktop ? { images: { unoptimized: true as const } } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? manifest.version,
    NEXT_PUBLIC_APP_COMMIT:
      process.env.NEXT_PUBLIC_APP_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      // Fall back to the local checkout so the diagnostic always has *something*
      // to report. CI/Vercel override this with the deployed commit so the
      // answer there is exact, not "what the build environment happened to have".
      (() => {
        try {
          return execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: new URL('.', import.meta.url),
            encoding: 'utf8',
          }).trim();
        } catch {
          return undefined;
        }
      })(),
  },
  ...(desktop ? { output: 'standalone' as const } : {}),
  async headers() {
    // Production-grade web-security headers, applied to every
    // response. The cross-origin isolation pair (COOP/COEP) is
    // unconditional in production so that the threaded Stockfish
    // build works on first load; the developer can disable it
    // with `KINGFISHER_CROSS_ORIGIN_ISOLATION=` (empty) if a
    // debugging flow needs it.
    //
    // CSP allows:
    //   - same-origin scripts (Next.js compiled bundles)
    //   - WASM via 'wasm-unsafe-eval' for the multi-threaded
    //     Stockfish build
    //   - the Lichess API, the Lichess tablebase service, the
    //     public data mirror on GitHub Pages, the Lichess
    //     Explorer endpoint, the Lichess OAuth redirect, the
    //     Lichess WebSocket, and `https:` (a permissive fallback
    //     for engine downloads and OAuth callbacks whose
    //     hostname the runtime chooses)
    //   - Lichess, Chess.com and similar providers via `https:`
    //   - the companion WebSocket at `wss:` (the production
    //     deployment is local-only; on the web, the WSocket is
    //     not used; the entry is here so a self-hosted dev
    //     instance can still connect)
    //
    // It does NOT allow:
    //   - remote scripts of any kind
    //   - eval() of remote strings
    //   - frame embedding
    //   - <object>, <embed>, <applet>
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          ...(crossOriginIsolation
            ? [
                { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
              ]
            : [
                { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
              ]),
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // `'wasm-unsafe-eval'` is required for the threaded Stockfish
              // build; without it, the engine refuses to compile.
              `script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // The runtime connects to:
              //   - itself (the Next.js API)
              //   - the public data mirror on GitHub Pages
              //   - the Lichess API and tablebase
              //   - the Lichess WebSocket for live data
              //   - HTTPS (a permissive fallback for engine downloads
              //     and OAuth callback paths the runtime chooses)
              //   - WSS for the desktop companion
              "connect-src 'self' https://mardakurt.github.io https://lichess.org https://api.chess.com https://tablebase.lichess.ovh https://explorer.lichess.ovh wss: https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
