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
  title: 'Kingfisher — chess research workspace',
  description:
    'Engine analysis, opening databases and repertoire work in one workspace, for players who study.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
