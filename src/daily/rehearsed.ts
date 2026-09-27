/**
 * What was rehearsed today, kept for the day (Phase 86).
 *
 * Grading a repertoire or critical card reschedules it, the queue is read
 * again, and the card leaves it — which is right. The page then counted
 * "rehearsed" from the cards still in the queue, so every grade reset the
 * count to zero: "Continue" went back to "Begin", and a session could never
 * say it was complete. The day's rehearsed cards are a fact about the
 * person's day, not about the queue, so they are kept here, by local date,
 * and a reload resumes the same session.
 *
 * Browser storage, and only a convenience: when it is unavailable the page
 * still works and simply forgets on reload. The schedule written to each
 * record remains the authority on what was reviewed.
 */

const KEY = 'kingfisher.daily.rehearsed';

export function localDay(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function readRehearsed(day: string, storage: Storage | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day?: unknown; ids?: unknown };
    if (parsed.day !== day || !Array.isArray(parsed.ids)) return [];
    return parsed.ids.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function writeRehearsed(
  day: string,
  ids: Iterable<string>,
  storage: Storage | null = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ day, ids: [...ids] }));
  } catch {
    // Private windows and full disks refuse; the session goes on without it.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
