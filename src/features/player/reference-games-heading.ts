/**
 * The heading over a player's reference games.
 *
 * A pack lists a player's newest games and counts the rest. The heading may
 * say the list is the whole population only when every source's list covers
 * that source's own count. Two packs are two populations: their counts are
 * never added into one total.
 */

export interface ReferenceHeadingSource {
  readonly name: string;
  readonly listed: number;
  /** Games that source counted, or null when this panel does not have the figure. */
  readonly played: number | null;
}

const formatCount = (count: number): string => count.toLocaleString('en-GB');

export function referenceGamesHeading(
  listedGames: number,
  sources: readonly ReferenceHeadingSource[],
): string {
  const whole = `${formatCount(listedGames)} ${listedGames === 1 ? 'game' : 'games'} in your reference sources`;
  if (sources.length === 0) return whole;
  const known = sources.filter((source) => source.played !== null);
  if (known.length === 0) {
    return `${formatCount(listedGames)} listed from your reference sources`;
  }
  const capped = known.some((source) => source.played !== null && source.played > source.listed);
  if (!capped && known.length === sources.length) return whole;
  if (sources.length === 1) {
    const source = sources[0]!;
    return `${formatCount(source.listed)} newest of ${formatCount(source.played!)}`;
  }
  return sources
    .map((source) =>
      source.played !== null && source.played > source.listed
        ? `${formatCount(source.listed)} newest of ${formatCount(source.played)} in ${source.name}`
        : `${formatCount(source.listed)} in ${source.name}`,
    )
    .join('; ');
}

export function referenceHeadingSources(
  games: readonly { readonly sourceName: string }[],
  catalog: {
    readonly games: number;
    readonly sources: readonly string[];
    readonly sourceGames?: readonly { readonly source: string; readonly games: number }[];
  } | null,
): readonly ReferenceHeadingSource[] {
  const listed = new Map<string, number>();
  for (const game of games) {
    listed.set(game.sourceName, (listed.get(game.sourceName) ?? 0) + 1);
  }
  if (catalog?.sourceGames && catalog.sourceGames.length > 0) {
    const names = new Set<string>([
      ...catalog.sourceGames.map((entry) => entry.source),
      ...listed.keys(),
    ]);
    return [...names].map((name) => {
      const recorded = catalog.sourceGames?.find((entry) => entry.source === name);
      return {
        name,
        listed: listed.get(name) ?? 0,
        played: recorded ? recorded.games : null,
      };
    });
  }
  if (!catalog) {
    return [...listed.entries()].map(([name, count]) => ({
      name,
      listed: count,
      played: null,
    }));
  }
  if (catalog.sources.length <= 1) {
    const name = catalog.sources[0] ?? [...listed.keys()][0] ?? '';
    return [{ name, listed: games.length, played: catalog.games }];
  }
  return catalog.sources.map((name) => ({
    name,
    listed: listed.get(name) ?? 0,
    played: null,
  }));
}
