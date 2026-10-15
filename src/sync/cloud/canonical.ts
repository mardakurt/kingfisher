/**
 * The identity of a record's content, independent of key order.
 *
 * Sync compares hashes rather than timestamps: a record is "changed" when its
 * content differs from what the cloud last acknowledged, never because a clock
 * said so. Two devices that hold the same study must produce the same hash,
 * and IndexedDB does not promise to return object keys in the order they were
 * written, so the JSON is canonicalised first — keys sorted, `undefined`
 * dropped exactly as `JSON.stringify` drops it.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => (item === undefined ? null : sortKeys(item)));
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const item = source[key];
    if (item === undefined || typeof item === 'function') continue;
    sorted[key] = sortKeys(item);
  }
  return sorted;
}

/** SHA-256 of the canonical JSON, lower-case hex; `null` (a deletion) hashes as the JSON `null`. */
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(
    value === null || value === undefined ? 'null' : canonicalJson(value),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
