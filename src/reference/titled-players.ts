/**
 * The titled-player roster: every GM, WGM, IM and WIM Wikidata records.
 *
 * Built by `npm run players:roster` (`scripts/build-player-roster.mjs`) from
 * Wikidata under CC0 and committed as `public/data/players/titled-players.json`
 * with a manifest naming the query, the date, the counts and the digest. It
 * is 8,000-odd people at under 300 KB compressed, which is too much for the
 * initial bundle and nothing at all for one fetch — so it is loaded lazily,
 * the first time a player search or the player library needs it, and kept.
 *
 * What a row is: a person, a title, and the facts Wikidata states about
 * them. What it is not: a game. A titled player the installed sources hold
 * nothing for is shown with zero games, exactly like the curated roster in
 * `legends.ts`, and never appears in a browse set — only when searched for.
 */

/** One person, as `titled-players.json` records them. */
export interface TitledPlayer {
  /** Wikidata item, e.g. `Q106807`. */
  readonly wikidata: string;
  readonly name: string;
  /** Other spellings people type: transliterations, nicknames, name order. */
  readonly aliases: readonly string[];
  /** Highest FIDE title Wikidata records. */
  readonly title: 'GM' | 'WGM' | 'IM' | 'WIM';
  readonly fideId: string;
  /** 0 when Wikidata does not state it. */
  readonly born: number;
  readonly died?: number;
  readonly female: boolean;
  /** ISO 3166-1 alpha-2 of the country of citizenship, when stated. */
  readonly citizenship: string;
  /** Highest Elo Wikidata records; 0 when none. Not a career peak claim. */
  readonly peakElo: number;
}

/** The compact row shape on disk; see the manifest's `fields`. */
interface CompactRow {
  readonly q: string;
  readonly n: string;
  readonly t: TitledPlayer['title'];
  readonly a?: readonly string[];
  readonly f?: string;
  readonly b?: number;
  readonly d?: number;
  readonly w?: 1;
  readonly c?: string;
  readonly e?: number;
}

export const TITLED_ROSTER_URL = '/data/players/titled-players.json';

export function expandTitledRow(row: CompactRow): TitledPlayer {
  const player: TitledPlayer = {
    wikidata: row.q,
    name: row.n,
    aliases: row.a ?? [],
    title: row.t,
    fideId: row.f ?? '',
    born: row.b ?? 0,
    female: row.w === 1,
    citizenship: row.c ?? '',
    peakElo: row.e ?? 0,
  };
  return row.d ? { ...player, died: row.d } : player;
}

let roster: Promise<readonly TitledPlayer[]> | null = null;

/**
 * The roster, fetched once. A failure to fetch it — offline, a build without
 * the file — is an empty roster, not an error: the player library must keep
 * working on what the packs hold, and a search will simply not find the
 * people this file would have added.
 */
export function loadTitledRoster(
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<readonly TitledPlayer[]> {
  roster ??= fetcher(TITLED_ROSTER_URL)
    .then(async (response) => {
      if (!response.ok) return [];
      const rows = (await response.json()) as readonly CompactRow[];
      return Array.isArray(rows) ? rows.map(expandTitledRow) : [];
    })
    .catch(() => []);
  return roster;
}

/** Test-only: forget the fetched roster so a test can supply its own. */
export function __resetTitledRoster(): void {
  roster = null;
}

/** A one-line description for a row: "GM · Norway-born 1990" without the invention. */
export function describeTitledPlayer(player: TitledPlayer): string {
  const parts: string[] = [player.title];
  if (player.born) parts.push(player.died ? `${player.born}–${player.died}` : `b. ${player.born}`);
  if (player.citizenship) parts.push(player.citizenship);
  if (player.peakElo) parts.push(`Elo ${player.peakElo} recorded`);
  if (player.fideId) parts.push(`FIDE ${player.fideId}`);
  return parts.join(' · ');
}
