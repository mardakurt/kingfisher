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
import type { Color } from '@/chess/types';
import { cn } from '@/lib/cn';
import { formatThink, type ClocksAt } from '@/round/clock';
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

export function GameHeaderCard({
  headers,
  clocks = null,
  toMove = null,
}: {
  readonly headers: GameTree['headers'];
  /** Both clocks at the move on the board, from the game's `[%clk]` commands. */
  readonly clocks?: ClocksAt | null;
  readonly toMove?: Color | null;
}) {
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
        <Side
          name={white}
          rating={recorded(headers.WhiteElo)}
          clock={clocks ? <SideClock color="w" clocks={clocks} toMove={toMove} /> : null}
        />
        <span className="shrink-0 px-1 font-semibold text-primary tabular" data-game-result>
          {result === '1/2-1/2' ? '½–½' : result && result !== '*' ? result : '–'}
        </span>
        <Side
          name={black}
          rating={recorded(headers.BlackElo)}
          clock={clocks ? <SideClock color="b" clocks={clocks} toMove={toMove} /> : null}
          reverse
        />
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

/**
 * One side's clock at the move on the board, as the broadcast showed it:
 * the time left, and beside the side that just moved, how long that move
 * took. The side to move is the one whose clock was running.
 */
function SideClock({
  color,
  clocks,
  toMove,
}: {
  readonly color: Color;
  readonly clocks: ClocksAt;
  readonly toMove: Color | null;
}) {
  const left = clocks[color];
  const think = clocks.lastThink?.color === color ? clocks.lastThink.seconds : null;
  const running = toMove === color;
  return (
    <span
      className="inline-flex items-baseline gap-1 text-[10.5px] tabular"
      data-game-clock={color}
      aria-label={`${color === 'w' ? 'White' : 'Black'} clock ${left === null ? 'not recorded' : formatThink(left)}${think !== null ? `, last move took ${formatThink(think)}` : ''}`}
    >
      <span
        className={cn(
          'rounded-[3px] px-1',
          running ? 'bg-surface-3 font-semibold text-primary' : 'text-secondary',
        )}
      >
        {left === null ? '–' : formatThink(left)}
      </span>
      {think !== null ? <span className="text-tertiary">+{formatThink(think)}</span> : null}
    </span>
  );
}

function Side({
  name,
  rating,
  clock = null,
  reverse = false,
}: {
  readonly name: string | null;
  readonly rating: string | null;
  readonly clock?: React.ReactNode;
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
        {rating || clock ? (
          <span
            className={cn(
              'flex items-baseline gap-1.5 text-[10.5px] text-tertiary tabular',
              reverse && 'flex-row-reverse',
            )}
          >
            {rating ? <span>{rating}</span> : null}
            {clock}
          </span>
        ) : null}
      </div>
    </div>
  );
}
