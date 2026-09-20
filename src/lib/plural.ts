/**
 * "1 move", "2 moves". A count and its noun, agreed.
 *
 * Only the regular English plural, because that is every noun the interface
 * counts: moves, games, replies, chapters. A noun that pluralises otherwise
 * passes its own plural form.
 */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : pluralNoun}`;
}
