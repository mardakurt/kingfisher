import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collect, PRIMARY_PLAYER_FILTERS, searchPlayers, type CatalogPlayer } from './players';
import {
  __resetTitledRoster,
  describeTitledPlayer,
  expandTitledRow,
  loadTitledRoster,
  type TitledPlayer,
} from './titled-players';

/*
  The committed roster, read straight from disk. These tests run against the
  real file rather than a fixture because the file is the claim: eight
  thousand people Wikidata records as titled, with the spellings they are
  found under. A fixture would test the loader and say nothing about the
  data a user searches.
*/
const ROOT = path.resolve(__dirname, '..', '..');
const ROSTER_FILE = path.join(ROOT, 'public', 'data', 'players', 'titled-players.json');
const MANIFEST_FILE = path.join(ROOT, 'public', 'data', 'players', 'titled-players.manifest.json');
const text = readFileSync(ROSTER_FILE, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
const rows = JSON.parse(text) as Parameters<typeof expandTitledRow>[0][];
const roster: readonly TitledPlayer[] = rows.map(expandTitledRow);

const fetcher = () => Promise.resolve(new Response(text, { status: 200 }));
const byName = (name: string) => roster.find((p) => p.name === name);

afterEach(() => __resetTitledRoster());

describe('the titled-player roster file', () => {
  it('is the file its manifest describes, byte for byte', () => {
    expect(createHash('sha256').update(text).digest('hex')).toBe(manifest.sha256);
    expect(roster).toHaveLength(manifest.count);
    expect(manifest.licence).toMatch(/CC0/);
    expect(manifest.source).toMatch(/Wikidata/);
  });

  it('holds thousands of titled players, every one with a name and a title', () => {
    expect(roster.length).toBeGreaterThan(8000);
    for (const player of roster) {
      expect(player.name.length).toBeGreaterThan(1);
      expect(['GM', 'WGM', 'IM', 'WIM']).toContain(player.title);
    }
    expect(roster.filter((p) => p.title === 'GM').length).toBeGreaterThan(2000);
    expect(roster.filter((p) => p.title === 'WGM').length).toBeGreaterThan(500);
  });

  it('names one person once', () => {
    const items = new Set(roster.map((p) => p.wikidata));
    expect(items.size).toBe(roster.length);
  });

  it('carries the modern elite, the top women and the historical grandmasters', () => {
    for (const name of [
      'Magnus Carlsen',
      'Ian Nepomniachtchi',
      'Gukesh D',
      'Hou Yifan',
      'Ju Wenjun',
      'Judit Polgár',
      'Garry Kasparov',
      'Anatoly Karpov',
      'Mark Dvoretsky',
      'Rashid Nezhmetdinov',
    ]) {
      expect(byName(name), name).toBeDefined();
    }
  });

  it('records the spellings people type, not an epithet or a handle', () => {
    expect(byName('Ian Nepomniachtchi')?.aliases).toContain('Nepo');
    expect(byName('Maxime Vachier-Lagrave')?.aliases).toContain('MVL');
    expect(byName('Judit Polgár')?.aliases).toContain('Polgar');
    for (const player of roster) {
      for (const alias of player.aliases) {
        expect(alias, `${player.name}: ${alias}`).not.toMatch(/\d/);
        expect(alias.split(/\s+/).length, `${player.name}: ${alias}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('stays small enough to fetch on first use', () => {
    expect(Buffer.byteLength(text)).toBeLessThan(1_200_000);
  });
});

describe('loading the roster', () => {
  it('is an empty roster, not an error, when the file cannot be fetched', async () => {
    expect(await loadTitledRoster(() => Promise.reject(new Error('offline')))).toEqual([]);
    __resetTitledRoster();
    expect(
      await loadTitledRoster(() => Promise.resolve(new Response('', { status: 404 }))),
    ).toEqual([]);
  });

  it('fetches once and keeps the answer', async () => {
    let calls = 0;
    const counting = () => {
      calls += 1;
      return fetcher();
    };
    await loadTitledRoster(counting);
    await loadTitledRoster(counting);
    expect(calls).toBe(1);
  });

  it('describes a person from stated facts only', () => {
    const player = expandTitledRow({ q: 'Q1', n: 'A', t: 'IM', b: 1950, d: 2001, c: 'HU' });
    expect(describeTitledPlayer(player)).toBe('IM · 1950–2001 · HU');
    expect(describeTitledPlayer(expandTitledRow({ q: 'Q2', n: 'B', t: 'WGM' }))).toBe('WGM');
  });
});

describe('the roster in the player catalog', () => {
  const catalog = async () => collect(() => Promise.resolve(roster));

  it('adds a titled player the packs do not hold as a zero-game row', async () => {
    const players = await catalog();
    const dvoretsky = players.find((p) => p.name === 'Mark Dvoretsky');
    expect(dvoretsky).toBeDefined();
    expect(dvoretsky?.games).toBe(0);
    expect(dvoretsky?.titled?.title).toBe('IM');
    expect(dvoretsky?.legend).toBeUndefined();
  });

  it('attaches across accents and name order, so one person is one row', async () => {
    const players = await catalog();
    expect(players.filter((p) => /polg[aá]r, judit|judit polg[aá]r/i.test(p.name))).toHaveLength(1);
    expect(players.filter((p) => /^hou,? yifan$/i.test(p.name))).toHaveLength(1);
  });

  it('never offers a titled player with no games in any browse set', async () => {
    const players = await catalog();
    for (const filter of PRIMARY_PLAYER_FILTERS) {
      const offered = searchPlayers(players, { query: '', filter, limit: 20_000 });
      expect(
        offered.filter((p) => p.titled && p.games === 0),
        filter,
      ).toHaveLength(0);
    }
  });

  it('keeps the historical index for the curated roster, not eight thousand rows', async () => {
    const players = await catalog();
    const index = searchPlayers(players, { query: '', filter: 'historical-index', limit: 20_000 });
    expect(index.length).toBeLessThan(200);
    expect(index.every((p) => p.legend)).toBe(true);
  });

  const find = (players: readonly CatalogPlayer[], query: string) =>
    searchPlayers(players, { query, filter: 'all', limit: 5 }).map((p) => p.name);

  it('attaches to the curated entry when a person is on both rosters', async () => {
    // Nepomniachtchi is a legend; the titled row enriches that entry rather
    // than becoming a second person, and the curated spelling is displayed.
    const players = await catalog();
    const rows = players.filter((p) => /nepomniachtchi/i.test(p.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.legend).toBeDefined();
    expect(rows[0]?.titled?.title).toBe('GM');
  });

  it('finds a titled player by exact name, by prefix, by alias and without diacritics', async () => {
    const players = await catalog();
    expect(find(players, 'Mark Dvoretsky')[0]).toBe('Mark Dvoretsky');
    expect(find(players, 'Dvoret')[0]).toBe('Mark Dvoretsky');
    expect(find(players, 'Nepo')[0]).toMatch(/Nepomniachtchi/);
    expect(find(players, 'Nepomnia')[0]).toMatch(/Nepomniachtchi/);
    expect(find(players, 'MVL')[0]).toMatch(/Vachier-Lagrave/);
    expect(find(players, 'Vachier Lagrave')[0]).toMatch(/Vachier-Lagrave/);
    expect(find(players, 'Nezhmetdinov')[0]).toMatch(/Nezhmetdinov/);
    expect(find(players, 'Nejmetdinov')[0]).toMatch(/Nezhmetdinov/); // French spelling
  });

  it('shows a real ambiguity as several people rather than picking one', async () => {
    const players = await catalog();
    const kasparovs = find(players, 'Kasparov');
    expect(kasparovs).toContain('Sergey Kasparov');
    expect(kasparovs.some((name) => /Garry|Kasparov, Garry/.test(name))).toBe(true);
  });

  it('finds nothing for a name nobody has, and says so with an empty list', async () => {
    const players = await catalog();
    expect(find(players, 'Zxqv Plorbin')).toEqual([]);
  });
});
