/**
 * A titled player's photograph, from Wikimedia Commons, with its credit.
 *
 * ChessBase puts a photo at the top of a player's preparation page. The
 * titled roster (`titled-players.ts`) already names each person's Wikidata
 * item; Wikidata's "image" statement (P18) names a file on Commons, and
 * Commons says who made it and under which licence. The picture is fetched
 * when the page is shown and never stored or bundled, and it is always shown
 * with its author and licence — most Commons portraits are CC BY-SA, which
 * permits this use on exactly that condition.
 *
 * A person is matched to a roster row only when exactly one row has the
 * name, in either order; two candidates mean no photo rather than a guess.
 *
 * Requests: wikidata.org (the item), commons.wikimedia.org (the credit) and
 * Wikimedia's image host (the picture), disclosed on the privacy page.
 */

import { matchKey, nameOrders } from './players';
import type { TitledPlayer } from './titled-players';

export interface PlayerPhoto {
  /** A thumbnail URL on a wikimedia.org image host. */
  readonly url: string;
  /** The author as Commons records them, as plain text. */
  readonly author: string;
  readonly licence: string;
  readonly licenceUrl?: string;
  /** The file's page on Commons, where the full credit lives. */
  readonly page: string;
}

/** The one roster row a name refers to, or null when none or several do. */
export function rosterEntryFor(name: string, roster: readonly TitledPlayer[]): TitledPlayer | null {
  const wanted = new Set([name, ...nameOrders(name)].map(matchKey).filter(Boolean));
  const found = roster.filter((player) =>
    [player.name, ...nameOrders(player.name), ...player.aliases]
      .map(matchKey)
      .some((key) => wanted.has(key)),
  );
  return found.length === 1 ? found[0]! : null;
}

/** Commons' extmetadata values are HTML; the credit is shown as text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Fetch = (url: string) => Promise<Response>;

/** The image file a Wikidata item names (P18), or null. */
export async function wikidataImage(qid: string, request: Fetch): Promise<string | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const response = await request(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  if (!response.ok) return null;
  const body = (await response.json()) as {
    entities?: Record<
      string,
      {
        claims?: {
          P18?: { rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }[];
        };
      }
    >;
  };
  /*
    Wikidata marks a statement it no longer stands behind as deprecated
    rather than deleting it, which is where a replaced or vandalised picture
    goes. Never show one of those; prefer a statement ranked preferred.
  */
  const claims = (body.entities?.[qid]?.claims?.P18 ?? []).filter(
    (claim) => claim.rank !== 'deprecated',
  );
  const claim = claims.find((entry) => entry.rank === 'preferred') ?? claims[0];
  const value = claim?.mainsnak?.datavalue?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A Commons file's thumbnail and credit, or null when Commons has no usable answer. */
export async function commonsPhoto(
  file: string,
  request: Fetch,
  width = 160,
): Promise<PlayerPhoto | null> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', `File:${file}`);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', String(width));
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const response = await request(url.toString());
  if (!response.ok) return null;
  const body = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: {
            thumburl?: string;
            descriptionurl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  };
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info?.thumburl || !info.descriptionurl) return null;
  // Only Wikimedia's own image hosts (upload. and, since 2026, thumb.).
  if (!/^https:\/\/[a-z]+\.wikimedia\.org\//.test(info.thumburl)) return null;
  // The credit links here, so it must be the file's page on Commons and nothing else.
  if (!info.descriptionurl.startsWith('https://commons.wikimedia.org/wiki/')) return null;
  const meta = info.extmetadata ?? {};
  const licence = plainText(meta.LicenseShortName?.value ?? '');
  // No licence named, no picture: the credit is the condition of showing it.
  if (!licence) return null;
  const author = plainText(meta.Artist?.value ?? '') || 'Unknown author';
  const licenceUrl = meta.LicenseUrl?.value;
  return {
    url: info.thumburl,
    author,
    licence,
    ...(licenceUrl && /^https?:\/\//.test(licenceUrl) ? { licenceUrl } : {}),
    page: info.descriptionurl,
  };
}

/** Item, then file, then credit. Null at the first step that has no answer. */
export async function playerPhoto(qid: string, request: Fetch = (url) => fetch(url)) {
  const file = await wikidataImage(qid, request);
  return file ? commonsPhoto(file, request) : null;
}
