'use client';

import Link from 'next/link';

import { Board } from '@/components/icons';
import { Button } from '@/components/ui/Button';

/**
 * Kingfisher 404.
 *
 * The brief (PART V) asks for a useful, branded 404 rather than the
 * Next.js framework default. The screen offers three actions: open
 * a fresh analysis, run a search, and go to the landing page. None
 * of them depend on the missing route being on the user's
 * bookmarks, so a player who typed a typo or followed a stale link
 * can recover without leaving the studio.
 */
export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-surface-0 px-6 text-center">
      <Board className="h-12 w-12 text-tertiary" aria-hidden="true" />
      <div>
        <h1 className="text-base font-semibold text-primary">Page not found</h1>
        <p className="mt-1 max-w-[44ch] text-xs text-tertiary">
          The address you opened is not part of the Kingfisher studio. The
          page may have moved, or the link was never current. Pick a starting
          point below and pick up where you were.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/analysis" prefetch={false}>
          <Button variant="accent" icon={<Board />}>
            Open a fresh analysis
          </Button>
        </Link>
        <Button
          variant="subtle"
          onClick={() => {
            /*
             * The keyboard shortcut is wired by useGlobalHotkeys; we
             * dispatch the same action the shortcut would. The fallback
             * to the home page is for browsers that block the gesture
             * — a link is still useful.
             */
            window.dispatchEvent(new CustomEvent('kingfisher:open-search'));
          }}
        >
          Search Kingfisher
        </Button>
        <Link
          href="https://kingfisher-chess.vercel.app/"
          rel="noopener"
          prefetch={false}
          className="rounded-[4px] border border-line bg-surface-2 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-3"
        >
          Open the landing page
        </Link>
      </div>
    </div>
  );
}
