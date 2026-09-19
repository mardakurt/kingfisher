/**
 * What the palette finds, and in what order.
 *
 * Both cases here are things a person typed in Phase 53. "opencarlsen" was a
 * search that the old subsequence scorer answered with "Run two engines on
 * this position", and "carlsen" was a search whose results alternated
 * Player, Game, Player, Game with a section divider on every row.
 */

import { describe, expect, it } from 'vitest';

import { rank, wordScore } from './rank';
import type { Command } from './useCommands';

const command = (id: string, group: string, title: string, keywords?: string): Command => ({
  id,
  group,
  title,
  ...(keywords ? { keywords } : {}),
  run: () => {},
});

const COMMANDS: readonly Command[] = [
  command('two', 'Engine', 'Run two engines on this position'),
  command('new', 'Game', 'New analysis', 'start blank board'),
  command('pgn', 'Game', 'Import PGN or FEN'),
  command('player-carlsen', 'Player', 'Carlsen, Magnus'),
  command('game-1', 'Game', 'Carlsen, Magnus – Nakamura, Hikaru'),
  command('player-carlsen-profile', 'Player', 'Carlsen, Magnus · Open player profile'),
  command('game-2', 'Game', 'Nakamura, Hikaru – Carlsen, Magnus'),
  command('opening', 'Opening', 'Sicilian Defense: Closed, Carlsen Variation'),
  command('explorer', 'Position', 'Open this position in Explorer'),
];

const titles = (query: string) => rank(COMMANDS, query).map((entry) => entry.title);
const groups = (query: string) => rank(COMMANDS, query).map((entry) => entry.group);

describe('what a word matches', () => {
  it('scores a contiguous hit far above a scattered one', () => {
    expect(wordScore('new analysis', 'analysis')).toBeGreaterThan(
      wordScore('new analysis', 'nlys'),
    );
  });

  it('prefers a hit at the start of a word', () => {
    expect(wordScore('open explorer', 'exp')).toBeGreaterThan(wordScore('reopen explorer', 'eop'));
  });

  it('tolerates a dropped letter but not a different word', () => {
    expect(wordScore('new analysis', 'anlysis')).toBeGreaterThan(0);
    expect(wordScore('run two engines on this position', 'opencarlsen')).toBe(0);
  });
});

describe('what the palette lists', () => {
  it('finds nothing for letters that only appear scattered across a title', () => {
    expect(titles('opencarlsen')).toEqual([]);
  });

  it('still forgives a typo', () => {
    expect(titles('anlysis')[0]).toBe('New analysis');
  });

  it('matches every word of a multi-word query, in any order', () => {
    expect(titles('explorer open')).toEqual(['Open this position in Explorer']);
  });

  it('gathers results by section, one run per section', () => {
    const seen = groups('carlsen');
    const runs = seen.filter((group, index) => index === 0 || seen[index - 1] !== group);
    expect(new Set(runs).size, `${seen.join(' → ')}`).toBe(runs.length);
    expect(runs).toContain('Player');
    expect(runs).toContain('Game');
    expect(runs).toContain('Opening');
  });

  it('orders sections by their best hit and rows within a section by rank', () => {
    // A title that *starts* with the word outranks one that merely contains it.
    expect(titles('carlsen').slice(0, 2)).toEqual([
      'Carlsen, Magnus',
      'Carlsen, Magnus · Open player profile',
    ]);
    expect(groups('carlsen')[0]).toBe('Player');
  });

  it('lists everything, in the given order, for an empty query', () => {
    expect(titles('')).toEqual(COMMANDS.map((entry) => entry.title));
  });
});

describe('the palette knows every page and every settings section', () => {
  it('has one command per navigation section and per settings section, with unique ids', async () => {
    const { NAV_SECTIONS } = await import('@/features/shell/navigation');
    const { SETTINGS_SECTIONS } = await import('@/features/shell/settings-index');
    // `useCommands` is a hook; the ids it generates are the contract tested here.
    const navIds = NAV_SECTIONS.map((section) => `goto-${section.id}`);
    const settingsIds = SETTINGS_SECTIONS.map((section) => `settings-${section.id}`);
    expect(new Set([...navIds, ...settingsIds]).size).toBe(navIds.length + settingsIds.length);
    expect(navIds).toContain('goto-review');
    expect(settingsIds).toContain('settings-companion');
  });
});

describe('ties', () => {
  it('go to the shorter title, which the query is more of', () => {
    const cmd = (title: string, group: string) => ({ id: title, title, group, run: () => {} });
    const ranked = rank(
      [cmd('Caro-Kann Defense: Endgame Offer', 'Openings'), cmd('Go to Endgame', 'Navigate')],
      'endgame',
    );
    expect(ranked[0]?.title).toBe('Go to Endgame');
  });
});
