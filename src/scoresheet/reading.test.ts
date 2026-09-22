import { describe, expect, it } from 'vitest';

import { Position } from '@/chess/position';

import { readTokens } from './reading';
import { reconstructGap } from './reconstruct';

describe('readTokens', () => {
  it('turns what was written into moves, in every spelling, and stops where it cannot read', () => {
    const reading = readTokens(Position.initial(), [
      'e4',
      'c5',
      'Sf3',
      'd6',
      'd4',
      'cd',
      'Nxd4',
      'Sf6',
      'Nc3',
      'a6',
      'Le3',
      'e5',
      'Sb3',
      'Le6',
      'f3',
      'Le7',
      'Dd2',
      '0-0',
      '0-0-0',
    ]);
    expect(reading.stopped).toBeUndefined();
    expect(reading.plies.map((p) => p.san).join(' ')).toBe(
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O',
    );
    expect(reading.plies.every((p) => p.status === 'read')).toBe(true);
  });

  it('flags a token with several readings, keeps the alternatives, and takes the first', () => {
    const reading = readTokens(Position.initial(), ['e4', 'e5', 'N?3']);
    const ply = reading.plies[2]!;
    expect(ply.status).toBe('check');
    expect(ply.alternatives!.length).toBe(3);
    expect(ply.note).toContain('could also be');
  });

  it('flags a cell with an unreadable character even when one move fits', () => {
    const reading = readTokens(Position.initial(), ['e4', 'c5', 'Sf3', 'd6', 'd4', 'cd', 'N?d4']);
    const ply = reading.plies[6]!;
    expect(ply.san).toBe('Nxd4');
    expect(ply.status).toBe('check');
    expect(ply.note).toContain('unreadable character');
  });

  it('flags a token read one character off, and says how it was read', () => {
    const reading = readTokens(Position.initial(), ['e4', 'e5', 'Nf']);
    const ply = reading.plies[2]!;
    expect(ply.status).toBe('check');
    expect(ply.readAs).toBe('Nf');
  });

  it('flags a move the reader marked uncertain even when the rules are sure', () => {
    const reading = readTokens(Position.initial(), ['e4', 'e5', 'Nf3'], {
      uncertain: new Set([2]),
    });
    expect(reading.plies[2]).toMatchObject({ san: 'Nf3', status: 'check' });
    expect(reading.plies[2]!.note).toContain('marked uncertain');
  });

  it('stops at a gap and at a token nothing reads as, naming the token', () => {
    const gap = readTokens(Position.initial(), ['e4', '?', 'Nf3']);
    expect(gap.plies).toHaveLength(1);
    expect(gap.stopped).toMatchObject({ index: 1, token: '?' });
    const wrong = readTokens(Position.initial(), ['e4', 'e5', 'Zzz']);
    expect(wrong.stopped).toMatchObject({ index: 2, token: 'Zzz' });
    expect(wrong.stopped!.reason).toContain('no legal move');
  });
});

describe('reconstructGap', () => {
  const after = (sans: string): Position => {
    let position = Position.initial();
    for (const san of sans.split(' ')) {
      const next = position.advanceSan(san);
      if (!next.ok) throw new Error(san);
      position = next.value.next;
    }
    return position;
  };

  it('finds the one move that makes the following moves legal', () => {
    // 1. e4 e5 2. ?? Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe5: only a knight on f3 can take on e5.
    const position = after('e4 e5');
    const result = reconstructGap(position, ['Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'Nxe5']);
    expect(result.survivors.map((c) => c.move.san)).toEqual(['Nf3']);
    expect(result.blockedAt).toBeNull();
  });

  it('offers every move that fits when several do, best reach first', () => {
    const position = after('e4 e5');
    const result = reconstructGap(position, ['Nc6']);
    expect(result.survivors.length).toBeGreaterThan(10);
    expect(result.blockedAt).toBeNull();
  });

  it('counts only exact readings of the buffer as evidence', () => {
    // Under 2. Nh3 the buffer's "Nxe5" would read as Ng5 one character off; that is not a fit.
    const position = after('e4 e5');
    const loose = readTokens(position.after(position.legalMoves().find((m) => m.san === 'Nh3')!), [
      'Nc6',
      'Bb5',
      'a6',
      'Bxc6',
      'dxc6',
      'Nxe5',
    ]);
    expect(loose.stopped).toBeUndefined();
    const strict = readTokens(
      position.after(position.legalMoves().find((m) => m.san === 'Nh3')!),
      ['Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'Nxe5'],
      { exact: true },
    );
    expect(strict.stopped).toMatchObject({ index: 5 });
  });

  it('says which later move fails under every candidate when nothing fits', () => {
    const position = after('e4 e5');
    const result = reconstructGap(position, ['Nc6', 'Zzz']);
    expect(result.survivors).toEqual([]);
    expect(result.blockedAt).toBe(1);
  });
});
