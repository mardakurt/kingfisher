/**
 * Compact technical information for the feedback modal.
 *
 * The full diagnostic report lives in
 * `src/features/shell/diagnostic-report.ts`; it is the right
 * tool when the user copies a long support paste. The modal's
 * preview is shorter — the things a maintainer genuinely
 * needs to read a one-paragraph bug report — and never reaches
 * outside the public, no-chess-content surface.
 *
 * What this collects:
 *   - app version
 *   - browser user agent
 *   - viewport size
 *   - cross-origin isolation (which gates threaded engines)
 *   - IndexedDB availability and quota
 *   - navigator language
 *
 * What this deliberately does NOT collect:
 *   - the user's games, studies, notes, repertoire
 *   - the user's Lichess / companion / assistant credentials
 *   - filesystem paths
 *   - any URL the user has open
 *
 * The result is a `Record<string, string>` so the route's
 * schema can take it directly.
 */

import type { FeedbackSurface } from './feedback-schema';

export interface CollectInput {
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
}

export async function collectFeedbackTechnicalInfo(
  input: CollectInput,
): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  out.appVersion = input.clientVersion;
  out.surface = input.surface;
  out.userAgent = window.navigator?.userAgent ?? 'unknown';
  out.language = window.navigator?.language ?? 'unknown';
  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  out.crossOriginIsolated = String(Boolean(window.crossOriginIsolated));
  out.indexedDb = typeof window.indexedDB === 'undefined' ? 'unavailable' : 'available';
  try {
    const estimate = await window.navigator?.storage?.estimate?.();
    if (estimate?.usage !== undefined) out.storageUsageBytes = String(estimate.usage);
    if (estimate?.quota !== undefined) out.storageQuotaBytes = String(estimate.quota);
  } catch {
    /* Storage estimate refused; we just omit the field. */
  }
  try {
    const persisted = await window.navigator?.storage?.persisted?.();
    if (persisted !== undefined) out.storagePersisted = String(persisted);
  } catch {
    /* Same. */
  }
  out.online = String(window.navigator?.onLine ?? true);
  out.timestamp = new Date().toISOString();
  return out;
}

/**
 * Render the technical-info dictionary as a multi-line string
 * suitable for the modal's preview. Each key is on its own
 * line so the user can scan the snapshot before submitting.
 */
export function formatTechnicalPreview(info: Record<string, string>): string {
  return Object.entries(info)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}
