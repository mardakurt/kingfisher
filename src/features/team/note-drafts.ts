/**
 * The note being written on an assignment, kept until it is sent (Phase 86).
 *
 * It lived in component state: a coach halfway through a review who
 * reloaded, or looked at another page and came back, found the box empty.
 * Kept per assignment in this browser profile's storage, and removed the
 * moment the note is handed over. Wrapped, because storage can be blocked:
 * a draft that cannot be kept must never be the reason the page fails.
 */

const KEY = 'kingfisher.team-note-drafts.v1';

export function readNoteDrafts(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function writeNoteDrafts(drafts: Readonly<Record<string, string>>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const kept = Object.fromEntries(Object.entries(drafts).filter(([, text]) => text.length > 0));
    if (Object.keys(kept).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Blocked or full: the draft stays in memory for this visit.
  }
}
