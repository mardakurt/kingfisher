import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { createMemoryRepositories } from './repositories';
import {
  createWorkspaceBackup,
  GAME_STORES,
  NON_PORTABLE_STORES,
  PORTABLE_STORES,
  restoreWorkspaceBackup,
} from './backup';
import { STORE_NAMES, type StoreName } from './schema/migrations';

const common = { id: 'authored', createdAt: 1, updatedAt: 2, revision: 0 };
const position = { fen: START_FEN, positionKey: positionKey(START_FEN) };
const authored: Partial<Record<StoreName, Record<string, unknown>>> = {
  preparationSessions: {
    ...common,
    title: 'Round 6',
    myColor: 'b',
    notes: 'Keep this preparation.',
    repertoireIds: [],
    studyIds: [],
    openingFileIds: ['authored'],
    modelGameLinkIds: [],
    reviewItemIds: [],
    sheet: [],
  },
  openingFiles: {
    ...common,
    name: 'My Sicilian',
    color: 'b',
    notes: 'Keep these annotations.',
    repertoireIds: [],
    chapterIds: [],
    modelGameLinkIds: [],
    trainingItemIds: [],
    reviewItemIds: [],
    positions: [{ ...position, line: [], addedAt: 1 }],
  },
  endgamePositions: {
    ...common,
    ...position,
    title: 'Study position',
    sideToMove: 'w',
    category: 'rook',
    goal: 'study',
    tags: ['authored'],
    pieceCount: 32,
  },
  pinnedLines: {
    ...common,
    ...position,
    engineId: 'fixture',
    engineName: 'Test evidence',
    multiPv: 1,
    score: { kind: 'cp', value: 17 },
    depth: 8,
    nodes: 1000,
    timeMs: 100,
    pvUci: ['e2e4'],
    pvSan: ['e4'],
  },
  sourceSets: { ...common, name: 'My sources', collectionIds: ['local'] },
  teams: {
    ...common,
    name: 'Academy',
    members: [{ id: 'coach', name: 'Coach', role: 'coach' }],
    me: 'coach',
  },
  assignments: {
    ...common,
    teamId: 'authored',
    title: 'Round 3 game',
    kind: 'game',
    brief: 'Annotate it.',
    setBy: 'coach',
    assignedTo: 'ana',
    handovers: [
      {
        id: 'ho-1',
        kind: 'hand-in',
        authorId: 'ana',
        authorName: 'Ana',
        at: 3,
        note: 'Done.',
        pgn: '1. e4 e5 *',
        evidence: { positions: 3, evaluated: 0, engines: [] },
      },
    ],
  },
  playerIdentities: {
    ...common,
    name: 'A player',
    aliases: ['Another spelling'],
    aliasKeys: ['another spelling'],
  },
};

describe('the whole authored workspace is portable', () => {
  it.each(Object.entries(authored))(
    'round-trips %s through JSON into an empty profile',
    async (store, record) => {
      const source = createMemoryRepositories();
      const target = createMemoryRepositories();
      await source.raw.put(store as StoreName, record);
      const backup = await createWorkspaceBackup(source.raw, {});
      await restoreWorkspaceBackup(target.raw, JSON.parse(JSON.stringify(backup)), 'replace');
      expect(await target.raw.get(store as StoreName, record.id as string)).toEqual(record);
    },
  );

  it('does not erase newer kinds of authored work when replacing from an older backup', async () => {
    const source = createMemoryRepositories();
    const backup = await createWorkspaceBackup(source.raw, {});
    const older = JSON.parse(JSON.stringify(backup));
    for (const store of Object.keys(authored)) delete older.stores[store];
    const target = createMemoryRepositories();
    await target.raw.put(STORE_NAMES.preparationSessions, authored.preparationSessions);
    await restoreWorkspaceBackup(target.raw, older, 'replace');
    expect(await target.raw.get(STORE_NAMES.preparationSessions, 'authored')).toEqual(
      authored.preparationSessions,
    );
  });

  it('rejects malformed newly included records before touching existing work', async () => {
    const source = createMemoryRepositories();
    const backup = await createWorkspaceBackup(source.raw, {});
    const target = createMemoryRepositories();
    const study = await target.studies.create({ title: 'Must survive' });
    await expect(
      restoreWorkspaceBackup(
        target.raw,
        {
          ...backup,
          stores: { ...backup.stores, openingFiles: [{ id: 'broken' }] },
        },
        'replace',
      ),
    ).rejects.toThrow(/openingFiles/);
    expect(await target.studies.get(study.id)).not.toBeNull();
  });
});

describe('every store in the schema has a portability decision', () => {
  /*
    The rule in AGENTS.md: every store holding work a person authored must be
    in PORTABLE_STORES. This is the check that a store added to the schema
    was placed somewhere on purpose — portable, a game store, or excluded
    with a written reason — rather than left out by omission.
  */
  it('classifies each store exactly once', () => {
    const portable = new Set<string>(PORTABLE_STORES);
    const games = new Set<string>(GAME_STORES);
    const excluded = new Set<string>(Object.keys(NON_PORTABLE_STORES));
    const all = Object.values(STORE_NAMES);
    for (const store of all) {
      const memberships = [portable.has(store), games.has(store), excluded.has(store)].filter(
        Boolean,
      ).length;
      expect(memberships, `${store} must be in exactly one list`).toBe(1);
    }
    expect(portable.size + games.size + excluded.size).toBe(all.length);
  });

  it('gives every exclusion a reason', () => {
    for (const [store, reason] of Object.entries(NON_PORTABLE_STORES)) {
      expect(typeof reason === 'string' && reason.length > 10, store).toBe(true);
    }
  });
});
