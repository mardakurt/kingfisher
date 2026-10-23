'use client';

/**
 * ⌘V on the page, not in a field, is an import.
 *
 * The empty notation has said "paste a PGN" since the first phase, and a paste
 * with nothing focused did nothing: the person had to find Import, open it and
 * paste again. A paste that is a FEN or a PGN, landing anywhere that is not a
 * text field or a dialog, now opens Import with the text already in the box —
 * where the same detection names it and the same button loads or stores it.
 * Nothing is loaded or stored by the paste itself: a PGN is imported into a
 * database, and that stays a decision the person makes with the button.
 */

import { useEffect } from 'react';

import { parseFen } from '@/chess/fen';
import { useUi } from '@/stores/ui-store';

export type DetectedImport = 'fen' | 'pgn' | 'empty' | 'unknown';

/**
 * A FEN is one line with six fields, a PGN has tag pairs or move numbers. The
 * person is not asked which; the text answers.
 */
export function detectImport(text: string): DetectedImport {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  if (!trimmed.includes('\n') && parseFen(trimmed).ok) return 'fen';
  if (/\[\s*\w+\s+"/.test(trimmed) || /\d+\s*\.\s*[A-Za-z]/.test(trimmed)) return 'pgn';
  if (parseFen(trimmed.split('\n')[0] ?? '').ok) return 'fen';
  return 'unknown';
}

const takesPaste = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('[role="dialog"]') !== null
  );
};

export function usePasteToImport(): void {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || takesPaste(event.target)) return;
      const ui = useUi.getState();
      if (ui.importOpen) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const kind = detectImport(text);
      if (kind !== 'fen' && kind !== 'pgn') return;
      event.preventDefault();
      ui.openImportWith(text.trim());
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
}
