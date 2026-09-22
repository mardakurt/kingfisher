'use client';

import type { Fen } from '@/chess/types';
import { positionPageUrl } from '@/position/knowledge';
import { useUi } from '@/stores/ui-store';

/** Read the canonical board's resolved capability, not a pathname guess. */
export function positionPageAvailable(): boolean {
  return (
    typeof document !== 'undefined' &&
    !document.querySelector('[data-board-conceals="evidence"], [data-board-blindfold]')
  );
}

/** Shared by the board control, position menu and palette. */
export function openPositionPage(fen: Fen, navigate: (href: string) => void): void {
  if (!positionPageAvailable()) {
    useUi.getState().notify({
      tone: 'info',
      message: 'Reveal this exercise before opening its position evidence.',
    });
    return;
  }
  const href = positionPageUrl(fen);
  if (href) navigate(href);
  else useUi.getState().notify({ tone: 'error', message: 'This position cannot be read.' });
}
