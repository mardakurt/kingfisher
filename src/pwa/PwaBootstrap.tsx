'use client';

/**
 * One-shot mount of the PWA bootstrap.
 *
 * Rendered as a sibling of the application tree; renders nothing.
 * Side effects only: registers the service worker, listens for
 * `beforeinstallprompt`.
 */

import { usePwaBootstrap } from './bootstrap';

export function PwaBootstrap() {
  usePwaBootstrap();
  return null;
}
