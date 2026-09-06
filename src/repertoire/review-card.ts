/** Recall is a memory of a decision, not every exercise at the same position. */
export function reviewCardKey(positionKey: string, moves: readonly string[]): string {
  return JSON.stringify([positionKey, [...new Set(moves)].sort()]);
}
