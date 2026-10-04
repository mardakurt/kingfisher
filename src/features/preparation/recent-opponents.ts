/**
 * The opponents last prepared for, newest first — ChessBase's search history
 * beside the Preparation box. A convenience for this browser, like the
 * Library's recent filters: not authored work, so not in a backup, and a
 * store that is blocked or full is simply no list.
 */

const KEY = 'kingfisher.recent-opponents.v1';
export const RECENT_OPPONENTS = 8;

export function recentOpponents(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];
  } catch {
    return [];
  }
}

/** Put a name first, once, whatever case it was typed in before. */
export function rememberOpponent(name: string): string[] {
  const trimmed = name.trim();
  const previous = recentOpponents();
  if (!trimmed) return previous;
  const next = [
    trimmed,
    ...previous.filter((entry) => entry.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()),
  ].slice(0, RECENT_OPPONENTS);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked or full; the list the caller holds still works.
  }
  return next;
}
