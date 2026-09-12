/**
 * A damaged backup never damages the profile it is restored into.
 *
 * A backup is a JSON file a person carries between machines, and a file a
 * person carries gets truncated, corrupted, hand-edited and mislabelled.
 * Whatever arrives, one rule holds: after a rejected restore, every record
 * that was in the profile is still there, byte for byte; and a restore that
 * is accepted contains only what the backup validly described.
 *
 * The damage is generated, not hand-picked: a valid backup is serialised,
 * then mutated in each of the ways the brief names — truncation at every
 * tenth of its length, bytes flipped at seeded offsets, a wrong version, a
 * wrong record shape in each store, duplicate identifiers, unknown extra
 * objects, an oversized store — and each mutant is restored into a profile
 * with authored work in it, in both modes.
 */

import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import { asSan, asUci } from '@/chess/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';

import { BACKUP_VERSION, createWorkspaceBackup, restoreWorkspaceBackup } from './backup';
import { STORE_NAMES } from './schema/migrations';

const NOW = Date.UTC(2026, 8, 12, 9);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function author(repositories: AppRepositories, label: string) {
  const study = await repositories.studies.create({ title: `${label} study` });
  await repositories.studies.createChapter({
    studyId: study.id,
    title: `${label} chapter`,
    tree: createTree(START_FEN),
  });
  const repertoire = await repositories.repertoires.create({
    title: `${label} repertoire`,
    color: 'w',
  });
  await repositories.repertoires.upsertPosition({
    repertoireId: repertoire.id,
    fen: START_FEN,
    sideToMove: 'w',
    depth: 0,
    moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: NOW }],
    note: `${label} note`,
  });
  return { study, repertoire };
}

/** Everything in every store, serialised, for a before/after comparison. */
async function snapshot(repositories: AppRepositories): Promise<string> {
  const stores: Record<string, unknown> = {};
  for (const name of Object.values(STORE_NAMES)) {
    try {
      stores[name] = await repositories.raw.getAll(name as never);
    } catch {
      stores[name] = 'unreadable';
    }
  }
  return JSON.stringify(stores);
}

type Mutation = {
  readonly name: string;
  readonly apply: (json: string, random: () => number) => string;
};

const MUTATIONS: readonly Mutation[] = [
  ...[0.1, 0.3, 0.5, 0.7, 0.9, 0.99].map((fraction) => ({
    name: `truncated at ${Math.round(fraction * 100)}%`,
    apply: (json: string) => json.slice(0, Math.floor(json.length * fraction)),
  })),
  ...[1, 2, 3, 4, 5].map((n) => ({
    name: `${n * 8} bytes flipped`,
    apply: (json: string, random: () => number) => {
      const bytes = [...json];
      for (let i = 0; i < n * 8; i += 1) {
        const at = Math.floor(random() * bytes.length);
        bytes[at] = String.fromCharCode(
          (bytes[at]!.charCodeAt(0) ^ (1 + Math.floor(random() * 126))) % 127 || 33,
        );
      }
      return bytes.join('');
    },
  })),
  {
    name: 'wrong version',
    apply: (json) => JSON.stringify({ ...JSON.parse(json), version: BACKUP_VERSION + 1 }),
  },
  {
    name: 'wrong format',
    apply: (json) => JSON.stringify({ ...JSON.parse(json), format: 'somebody-elses-backup' }),
  },
  {
    name: 'a string where the stores should be',
    apply: (json) => JSON.stringify({ ...JSON.parse(json), stores: 'nope' }),
  },
  ...Object.values(STORE_NAMES).map((store) => ({
    name: `a number in the ${store} store`,
    apply: (json: string) => {
      const backup = JSON.parse(json);
      backup.stores[store] = [42];
      return JSON.stringify(backup);
    },
  })),
  ...Object.values(STORE_NAMES).map((store) => ({
    name: `a record with no id in the ${store} store`,
    apply: (json: string) => {
      const backup = JSON.parse(json);
      backup.stores[store] = [...(backup.stores[store] ?? []), { title: 'orphan', createdAt: NOW }];
      return JSON.stringify(backup);
    },
  })),
  {
    name: 'duplicate study identifiers',
    apply: (json) => {
      const backup = JSON.parse(json);
      const studies = backup.stores[STORE_NAMES.studies] ?? [];
      backup.stores[STORE_NAMES.studies] = [...studies, ...studies];
      return JSON.stringify(backup);
    },
  },
  {
    name: 'unknown extra objects at the top level and in the stores',
    apply: (json) => {
      const backup = JSON.parse(json);
      backup.somethingElse = { evil: true };
      backup.stores.notAStore = [{ id: 'x' }];
      return JSON.stringify(backup);
    },
  },
  {
    name: 'an oversized store (50,000 records)',
    apply: (json) => {
      const backup = JSON.parse(json);
      const one = backup.stores[STORE_NAMES.repertoirePositions]?.[0] ?? { id: 'p' };
      backup.stores[STORE_NAMES.repertoirePositions] = Array.from({ length: 50_000 }, (_, i) => ({
        ...one,
        id: `${one.id}-${i}`,
      }));
      return JSON.stringify(backup);
    },
  },
  { name: 'empty file', apply: () => '' },
  { name: 'not JSON at all', apply: () => 'PGN? [Event "x"] 1. e4 *' },
  { name: 'JSON null', apply: () => 'null' },
  { name: 'JSON array', apply: () => '[]' },
];

describe('backup chaos', () => {
  it('a valid backup restores in both modes, as the control', async () => {
    const source = createMemoryRepositories();
    await author(source, 'source');
    const backup = await createWorkspaceBackup(source.raw, {}, { now: NOW });
    for (const mode of ['merge', 'replace'] as const) {
      const target = createMemoryRepositories();
      await author(target, 'target');
      await restoreWorkspaceBackup(target.raw, JSON.parse(JSON.stringify(backup)), mode);
      const titles = (await target.studies.list()).map((s) => s.title).sort();
      expect(titles, mode).toContain('source study');
      if (mode === 'merge') expect(titles).toContain('target study');
      if (mode === 'replace') expect(titles).not.toContain('target study');
    }
  });

  it('every mutant is refused or absorbed without touching what was there, in both modes', async () => {
    const source = createMemoryRepositories();
    await author(source, 'source');
    const json = JSON.stringify(await createWorkspaceBackup(source.raw, {}, { now: NOW }));
    const random = mulberry32(46);
    const outcomes: string[] = [];

    for (const mutation of MUTATIONS) {
      const text = mutation.apply(json, random);
      for (const mode of ['merge', 'replace'] as const) {
        const target = createMemoryRepositories();
        await author(target, 'target');
        const before = await snapshot(target);

        let outcome: 'rejected' | 'restored';
        try {
          // The product hands the parsed file straight to restore, which
          // validates inside; a test that validated first would never see a
          // restore that clears before it validates.
          await restoreWorkspaceBackup(target.raw, JSON.parse(text), mode);
          outcome = 'restored';
        } catch {
          outcome = 'rejected';
        }
        outcomes.push(`${mutation.name} [${mode}]: ${outcome}`);

        const after = await snapshot(target);
        if (outcome === 'rejected') {
          expect(
            after,
            `${mutation.name} [${mode}] changed the profile after a rejected restore`,
          ).toBe(before);
        } else {
          // Absorbed: the only stores that may hold anything the target did
          // not author are the ones the backup validly described. The
          // target's own study survives a merge; a replace has replaced it
          // with the backup's — never with the mutant's garbage.
          const titles = (await target.studies.list()).map((s) => s.title);
          for (const title of titles)
            expect(title, mutation.name).toMatch(/^(source|target) study$/);
          if (mode === 'merge') expect(titles).toContain('target study');
        }
      }
    }
    // The register of what happened, for the reader: nothing here is a
    // finding unless an expectation above failed.
    expect(outcomes.length).toBe(MUTATIONS.length * 2);
    const rejected = outcomes.filter((o) => o.endsWith('rejected')).length;
    const restored = outcomes.length - rejected;
    console.log(`backup chaos: ${rejected} rejected, ${restored} absorbed`);
    // The comparison must be a real one: a snapshot that could not read the
    // stores would make "unchanged" vacuous.
    const probe = createMemoryRepositories();
    await author(probe, 'probe');
    expect(await snapshot(probe)).not.toContain('unreadable');
    expect(await snapshot(probe)).toContain('probe study');
  }, 60_000);
});
