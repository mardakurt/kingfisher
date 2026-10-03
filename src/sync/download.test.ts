import { describe, expect, it } from 'vitest';

import { downloadOnlineGames, splitGames } from './download';

const game = (n: number) =>
  `[Event "Live Chess"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 ${n} 1-0`;

describe('downloadOnlineGames', () => {
  it('asks Lichess for the newest games of the period, capped', async () => {
    const asked: string[] = [];
    const fetchImpl = (async (url: string) => {
      asked.push(url);
      return new Response(game(1), { status: 200 });
    }) as unknown as typeof fetch;
    await downloadOnlineGames({
      site: 'lichess',
      username: 'someone',
      months: 3,
      max: 50,
      now: Date.UTC(2026, 9, 3),
      fetchImpl,
    });
    const url = new URL(asked[0]!);
    expect(url.pathname).toBe('/api/games/user/someone');
    expect(url.searchParams.get('sort')).toBe('dateDesc');
    expect(url.searchParams.get('max')).toBe('50');
    expect(Number(url.searchParams.get('since'))).toBe(Date.UTC(2026, 9, 3) - 91 * 86_400_000);
  });

  it('walks Chess.com months newest first and keeps the newest games up to the cap', async () => {
    const months: Record<string, string> = {
      '2026/10': [game(10), game(11)].join('\n\n'),
      '2026/09': [game(7), game(8), game(9)].join('\n\n'),
      '2026/08': game(5),
    };
    const asked: string[] = [];
    const fetchImpl = (async (url: string) => {
      asked.push(url);
      if (url.endsWith('/games/archives')) {
        return Response.json({
          archives: ['2026/05', '2026/08', '2026/09', '2026/10'].map(
            (month) => `https://api.chess.com/pub/player/someone/games/${month}`,
          ),
        });
      }
      const month = /games\/(\d{4}\/\d{2})\/pgn$/.exec(url)![1]!;
      return new Response(months[month] ?? '', { status: 200 });
    }) as unknown as typeof fetch;
    const pgn = await downloadOnlineGames({
      site: 'chess.com',
      username: 'Someone',
      months: 3,
      max: 4,
      now: Date.UTC(2026, 9, 3),
      fetchImpl,
    });
    expect(splitGames(pgn).map((text) => /1\. e4 (\d+)/.exec(text)![1])).toEqual([
      '11',
      '10',
      '9',
      '8',
    ]);
    // May is outside three months; August was never needed.
    expect(asked.some((url) => url.includes('2026/05'))).toBe(false);
    expect(asked.some((url) => url.includes('2026/08'))).toBe(false);
  });
});
