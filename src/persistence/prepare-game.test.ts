import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { gameMetaFromHeaders } from '@/database/local-index';

import { gameDate, normalizeGame } from './prepare-game';

/*
  Lichess's database archives carry `UTCDate` and no `Date` at all; its API
  exports carry both. The archives are what the large-database guide points
  to, and before this every game imported from them had no date or year.
*/
const game = (tags: string) =>
  parsePgn(
    `[Event "Rated Blitz game"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n${tags}\n\n1. e4 e5 1-0`,
  ).games[0]!.tree;

describe('the date a game was played', () => {
  it('comes from UTCDate when the archive has no Date tag', () => {
    const record = normalizeGame(game('[UTCDate "2013.11.30"]\n[UTCTime "23:00:16"]'));
    expect(record.date).toBe('2013.11.30');
    expect(record.year).toBe(2013);
  });

  it('comes from UTCDate when Date is the unknown placeholder', () => {
    const record = normalizeGame(game('[Date "????.??.??"]\n[UTCDate "2014.07.01"]'));
    expect(record.date).toBe('2014.07.01');
    expect(record.year).toBe(2014);
  });

  it('keeps Date when it names a year, partial or not', () => {
    expect(normalizeGame(game('[Date "1921.??.??"]\n[UTCDate "2020.01.01"]')).year).toBe(1921);
    expect(gameDate({ Date: '2024.03.04', UTCDate: '2024.03.05' })).toBe('2024.03.04');
  });

  it('stays undated when neither tag names a year', () => {
    const record = normalizeGame(game('[Date "????.??.??"]'));
    expect(record.date).toBeUndefined();
    expect(record.year).toBeUndefined();
  });

  it('does not change a game’s fingerprint, so a re-import still finds it stored', () => {
    const withUtc = normalizeGame(game('[UTCDate "2013.11.30"]'));
    const without = normalizeGame(game(''));
    // The fingerprint hashes Date and the moves; neither changed.
    expect(withUtc.fingerprint).toBe(normalizeGame(game('[UTCDate "2013.11.30"]')).fingerprint);
    expect(withUtc.fingerprint).not.toBe('');
    expect(typeof without.fingerprint).toBe('string');
  });

  it('gives the explorer index the same year', () => {
    expect(gameMetaFromHeaders('g', { UTCDate: '2013.06.01' }).year).toBe(2013);
  });
});
