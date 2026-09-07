import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { AppProviders } from './providers';
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

export const metadata: Metadata = {
  title: {
    default: 'Kingfisher — chess research workspace',
    template: '%s · Kingfisher',
  },
  description:
    'Engine analysis, opening databases and repertoire work in one workspace, for players who study.',
  applicationName: 'Kingfisher',
  appleWebApp: { capable: true, title: 'Kingfisher', statusBarStyle: 'black-translucent' },
  /*
    `icon.svg` and `apple-icon.png` in this directory are picked up by the file
    convention; the manifest icons are declared in `manifest.ts`. Only the
    Windows tile needs saying out loud.
  */
  other: { 'msapplication-TileColor': '#0b0d11' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d11',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint. Without this the app renders one
 * frame in the default theme and then swaps, which is very visible on a
 * dark-first interface.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var raw = localStorage.getItem('kingfisher.preferences');
    var theme = raw ? (JSON.parse(raw).state || {}).theme : null;
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
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
 */
const WINDOW_CHROME_BOOTSTRAP = `
(function () {
  try {
    var chrome = window.kingfisher && window.kingfisher.windowChrome;
    if (!chrome || !chrome.safe) return;
    var root = document.documentElement;
    root.style.setProperty('--titlebar-safe-w', chrome.safe.width + 'px');
    root.style.setProperty('--titlebar-safe-h', chrome.safe.height + 'px');
    root.dataset.titlebar = chrome.kind;
  } catch (error) {
    /* No reservation is the safe failure: the application looks like the web. */
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: WINDOW_CHROME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
