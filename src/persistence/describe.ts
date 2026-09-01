/**
 * Naming things the user recognises.
 *
 * A stored game has no title of its own; players, event and year are what a
 * chess player uses to identify one, so that is what is assembled here — once,
 * so the header, the tab, the game list and the study chapter all agree.
 */

import type { AnalysisDocument, GameMetadata } from './types';

export function gameTitle(game: GameMetadata): string {
  const players = `${game.white || 'Unknown'} – ${game.black || 'Unknown'}`;
  const where = [game.event, game.year ? String(game.year) : undefined]
    .filter((part): part is string => Boolean(part) && part !== '?')
    .join(' ');
  return where ? `${players}, ${where}` : players;
}

/** A short, honest label for whatever the analysis workspace is editing. */
export function documentTitle(document: AnalysisDocument): string {
  return document.title || 'Untitled analysis';
}

/** The secondary line under the title, when the document has a parent. */
export function documentContext(document: AnalysisDocument): string | null {
  if (document.kind === 'study-chapter') return document.studyTitle;
  if (document.kind === 'database-game') return 'From your game database';
  return null;
}

const DATE_PATTERN = /^(\d{4})\.(\d{2})\.(\d{2})$/;

/** PGN dates are `YYYY.MM.DD` with `??` for unknown parts. Show what is known. */
export function formatPgnDate(value: string | undefined): string {
  if (!value) return '';
  const match = DATE_PATTERN.exec(value);
  if (!match) return value.replaceAll('.??', '').replaceAll('????', '');
  return `${match[1]}-${match[2]}-${match[3]}`;
}
