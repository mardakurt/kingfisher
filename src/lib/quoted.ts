/**
 * A search value in double quotes asks for the whole value, not a part of it:
 * `"Club Open 1"` is that event and not Club Open 10. Every text filter that
 * an index row links to — event, opening family, annotator, source, team —
 * reads it the same way. Two quote marks alone are text, not an empty name.
 */
export function quotedWhole(filter: string): string | null {
  const text = filter.trim();
  return text.length > 2 && text.startsWith('"') && text.endsWith('"')
    ? text.slice(1, -1).trim()
    : null;
}
