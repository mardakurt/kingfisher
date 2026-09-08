import { expect, it } from 'vitest';
import { parsePgn } from '@/chess/pgn';
import { decodeGameLine } from './pack';
import { packGamePgn } from './provider';

it('opens a real broadcast game whose event contains a quotation mark', () => {
  // First twelve plies of Lorenc–Burdalev, 15 May 2026, Elite broadcast pack.
  const game = decodeGameLine(
    '17fztod1b3yqtf\tLorenc, Tomas\tBurdalev, Kirill\t0-1\t2026\t2026.05.15\tChess Festival "O KRÁLE MATTONI ARÉNY“ | Rapid\tA13\tEnglish Opening: Agincourt Defense\t2124\t2292\thttps://lichess.org/broadcast/chess-festival-o-krale-mattoni-areny--rapid/round-4/GpwTJVjR/h5kAD4QF\tc4 e6 g3 d5 Bg2 d4 d3 Nc6 Nf3 a5 O-O Nf6',
  )!;
  for (const event of [game.event, 'A \\ quoted "event"']) {
    const parsed = parsePgn(packGamePgn({ ...game, event }, { name: 'Elite OTB Reference' }));
    expect(parsed.games).toHaveLength(1);
    expect(parsed.games[0]!.tree.headers.Event).toBe(event);
    expect(parsed.games[0]!.tree.headers.White).toBe(game.white);
    expect(parsed.games[0]!.tree.headers.Source).toBe('Elite OTB Reference');
    expect(Object.keys(parsed.games[0]!.tree.nodes)).toHaveLength(13);
  }
});
