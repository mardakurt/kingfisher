import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { publicUrl } from '@/release/public-urls';
import { PALETTE } from '@/ui/palette';
import { AppProviders } from './providers';
import { WebAnalytics } from './_analytics/WebAnalytics';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
});

const LANDING = publicUrl.landing;
const OG_IMAGE = `${LANDING}/landing/img/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(LANDING),
  /*
    The title leads with the brand and its category. "Kingfisher Chess"
    disambiguates the brand — "Kingfisher" alone returns a bird, a Martin
    Scorsese film, a kayak, and several other products. Putting the
    category next to the brand is what makes a search for "kingfisher
    chess" find this product. The template (`%s · Kingfisher`) keeps the
    brand on inner pages.
  */
  title: {
    default: 'Kingfisher Chess — chess research workspace',
    template: '%s · Kingfisher Chess',
  },
  description:
    'Kingfisher Chess is a local-first chess analysis and repertoire workstation for serious players. Stockfish 18 in the browser, native chess engines on macOS, opening explorer, large personal chess database, repertoire and review. No account. No cookies.',
  applicationName: 'Kingfisher Chess',
  keywords: [
    'kingfisher chess',
    'kingfisher',
    'chess',
    'chess analysis',
    'chess app',
    'chess software',
    'chess engine',
    'chess database',
    'chess opening explorer',
    'opening explorer',
    'opening research',
    'chess openings',
    'chess repertoire',
    'repertoire training',
    'chess review',
    'stockfish',
    'stockfish 18',
    'lichess',
    'chess.com',
    'local-first',
    'open source chess',
    'free chess',
    'chess mac',
    'chess macos',
    'pgn',
    'tablebase',
    'syzygy',
  ],
  authors: [{ name: 'mardakurt' }],
  creator: 'mardakurt',
  publisher: 'Kingfisher Chess',
  category: 'productivity',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Kingfisher Chess',
    title: 'Kingfisher Chess — chess research workspace',
    description:
      'Chess analysis, opening explorer, personal chess database, repertoire and review. Stockfish 18 in the browser, native engines on macOS. Local-first. No account. No cookies.',
    url: LANDING,
    locale: 'en',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Kingfisher Chess — a chess research workstation showing engine analysis, an explorer and a board.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@kingfisher',
    creator: '@kingfisher',
    title: 'Kingfisher Chess — chess research workspace',
    description:
      'Chess analysis, opening explorer, personal chess database, repertoire and review. Stockfish 18 in the browser, native engines on macOS. Local-first. No account. No cookies.',
    images: [OG_IMAGE],
  },
  appleWebApp: { capable: true, title: 'Kingfisher', statusBarStyle: 'default' },
  /*
    The icons are the file convention, not this object: `favicon.ico`
    (16, 32 and 48 px layers), `icon.svg`, `icon1.png` (96 px, the multiple
    of 48 a search engine's favicon crawler asks for — the .ico's 48 layer
    is not something every crawler unpacks) and `apple-icon.png` (180 px,
    square-cornered because iOS masks it itself), all in this directory and
    all rendered from `brand/kingfisher-mark.svg` by
    `scripts/render-brand-icons.py`. The manifest's icons are declared in
    `manifest.webmanifest/route.ts`. Only the Windows tile needs saying out
    loud.
  */
  other: { 'msapplication-TileColor': PALETTE.light.canvas },
};

export const viewport: Viewport = {
  themeColor: PALETTE.light.canvas,
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint. Without this the app renders one
 * frame in the default theme and then swaps, which is very visible when the
 * stored theme is the other one.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var raw = localStorage.getItem('kingfisher.preferences');
    var stored = raw ? JSON.parse(raw) : null;
    var theme = stored ? (stored.state || {}).theme : null;
    /* A profile older than version 7 is moved to light by the store's
       migration; paint what it will become, not what it was. */
    var migrated = stored && (stored.version || 0) < 7;
    document.documentElement.dataset.theme = theme === 'dark' && !migrated ? 'dark' : 'light';
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

/**
 * Reserves the macOS window buttons before first paint, for the same reason.
 *
 * The traffic lights are drawn by the operating system over the top-left of the
 * web contents, and the application has to leave room for them. Doing that in
 * an effect would render one frame with the Kingfisher mark underneath the
 * close button — which is precisely the bug this reserves against, briefly, on
 * every launch.
 *
 * It is a script rather than a server-rendered attribute because the server has
 * no idea which of Kingfisher's two identities is asking. The preload has
 * already run by the time this executes, so `window.kingfisher` is there in the
 * application and absent in a browser; a browser therefore falls through and
 * keeps the zero defaults in `globals.css`, which is what stops the web build
 * from reserving space for a control it does not have.
 *
 * What is written is the shell's geometry — `--mac-titlebar-safe-*`, the
 * rectangle macOS is drawing over — and not the reservation itself. The
 * reservation, `--titlebar-safe-*`, is derived from it in `globals.css`, where
 * full screen can set it to zero for as long as the buttons are gone. An
 * inline value on the root would beat any stylesheet rule and the reservation
 * could never collapse.
 */
const WINDOW_CHROME_BOOTSTRAP = `
(function () {
  try {
    var chrome = window.kingfisher && window.kingfisher.windowChrome;
    if (!chrome || !chrome.safe) return;
    var root = document.documentElement;
    root.style.setProperty('--mac-titlebar-safe-w', chrome.safe.width + 'px');
    root.style.setProperty('--mac-titlebar-safe-h', chrome.safe.height + 'px');
    root.dataset.titlebar = chrome.kind;
  } catch (error) {
    /* No reservation is the safe failure: the application looks like the web. */
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: WINDOW_CHROME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
        {/* The website counts page views; the Mac application, built off Vercel, never loads this. */}
        {process.env.VERCEL ? <WebAnalytics /> : null}
      </body>
    </html>
  );
}
