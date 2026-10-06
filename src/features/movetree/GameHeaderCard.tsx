'use client';

/**
 * Who played the game on the board, above its moves: both players with their
 * ratings and photographs, the result, and where and when — the card
 * ChessBase puts at the top of a game's notation.
 *
 * Only for a game. A board somebody is analysing from scratch has no players,
 * and a card of question marks over it would be clutter; the PGN's own "?" is
 * read as "not recorded" and shown as nothing. Photographs follow the
 * `showPlayerPhotos` setting through `usePlayerPhoto`: off means no request.
 */

import type { GameTree } from '@/chess/tree/types';
import { CountryFlag } from '@/features/player/CountryFlag';
import { PlayerPortrait } from '@/features/player/PlayerPortrait';

const recorded = (value: string | undefined): string | null => {
  const text = value?.trim();
  return text && text !== '?' && text !== '-' ? text : null;
};

/** "2026.06.02" → "2026.06.02"; "2026.??.??" → "2026"; "????.??.??" → nothing. */
export function readableDate(date: string | undefined): string | null {
  const text = recorded(date);
  if (!text) return null;
  const parts = text.split('.').filter((part) => /^\d+$/.test(part));
  return parts.length ? parts.join('.') : null;
}

/**
 * A site, readably. Broadcast PGNs put the game's URL in Site, which as text
 * is a line of noise; its host says the same thing ("lichess.org").
 */
export function siteLabel(site: string | undefined): string | null {
  const text = recorded(site);
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    return new URL(text).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function GameHeaderCard({ headers }: { readonly headers: GameTree['headers'] }) {
  const white = recorded(headers.White);
  const black = recorded(headers.Black);
  const title = recorded(headers.Title);
  if (!white && !black && !title) return null;

  const result = recorded(headers.Result);
  const where = [
    recorded(headers.Event),
    recorded(headers.Round) ? `round ${headers.Round!.trim()}` : null,
    siteLabel(headers.Site),
    readableDate(headers.Date),
  ].filter(Boolean);

  return (
    <div className="shrink-0 border-b border-line-subtle px-2.5 py-2" data-game-header>
      {title ? (
        <p className="mb-1 text-xs font-medium text-primary break-words" data-game-title>
          {title}
        </p>
      ) : null}
      <div className="flex items-center gap-2 text-xs">
        <Side name={white} rating={recorded(headers.WhiteElo)} />
        <span className="shrink-0 px-1 font-semibold text-primary tabular" data-game-result>
          {result === '1/2-1/2' ? '½–½' : result && result !== '*' ? result : '–'}
        </span>
        <Side name={black} rating={recorded(headers.BlackElo)} reverse />
      </div>
      {where.length ? (
        <p
          className="mt-1 truncate text-center text-[10.5px] text-tertiary"
          title={where.join(' · ')}
        >
          {where.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

function Side({
  name,
  rating,
  reverse = false,
}: {
  readonly name: string | null;
  readonly rating: string | null;
  readonly reverse?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${reverse ? 'flex-row-reverse text-right' : ''}`}
    >
      {name ? <PlayerPortrait name={name} size="sm" /> : null}
      <div className="min-w-0">
        <span className="block truncate font-medium text-primary" title={name ?? undefined}>
          {name ? <CountryFlag name={name} /> : null}
          {name ?? 'Unknown'}
        </span>
        {rating ? (
          <span className="block text-[10.5px] text-tertiary tabular">{rating}</span>
        ) : null}
      </div>
    </div>
  );
}
