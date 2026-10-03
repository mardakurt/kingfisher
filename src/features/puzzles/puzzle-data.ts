'use client';

/**
 * Reading the shipped puzzle set: a manifest and one JSON shard per 100-point
 * rating band, under `public/data/puzzles/`, built by
 * `scripts/build-puzzles.mjs`. Shards are fetched only when a band is needed,
 * and come from the application's own origin, so the set works offline in the
 * Mac application and from the browser cache on the web.
 */

import { puzzleBucket, puzzleFromRow, type Puzzle, type PuzzleRow } from '@/training/puzzles';

export interface PuzzleManifest {
  readonly source: string;
  readonly url: string;
  readonly licence: string;
  readonly sourceLastModified: string | null;
  readonly builtAt: string;
  readonly totals: {
    readonly shipped: number;
    readonly sourceRows: number;
    readonly eligible: number;
  };
  readonly themes: Readonly<Record<string, number>>;
  readonly bands: readonly {
    readonly band: number;
    readonly file: string;
    readonly count: number;
  }[];
}

const BASE = '/data/puzzles';
let manifest: Promise<PuzzleManifest> | null = null;
const shards = new Map<number, Promise<readonly Puzzle[]>>();

export function loadPuzzleManifest(): Promise<PuzzleManifest> {
  manifest ??= fetch(`${BASE}/manifest.json`).then(async (response) => {
    if (!response.ok)
      throw new Error(`The puzzle set could not be read (HTTP ${response.status}).`);
    return (await response.json()) as PuzzleManifest;
  });
  manifest.catch(() => {
    manifest = null;
  });
  return manifest;
}

async function loadBand(file: string, band: number): Promise<readonly Puzzle[]> {
  let pending = shards.get(band);
  if (!pending) {
    pending = fetch(`${BASE}/${file}`).then(async (response) => {
      if (!response.ok)
        throw new Error(`Puzzle band ${band} could not be read (HTTP ${response.status}).`);
      return ((await response.json()) as PuzzleRow[]).map(puzzleFromRow);
    });
    pending.catch(() => shards.delete(band));
    shards.set(band, pending);
  }
  return pending;
}

/** The puzzles in the bands at and either side of `rating`, clamped to the set. */
export async function puzzlesNear(rating: number): Promise<readonly Puzzle[]> {
  const { bands } = await loadPuzzleManifest();
  const centre = puzzleBucket(rating);
  const wanted = bands.filter((entry) => Math.abs(entry.band - centre) <= 100);
  const chosen = wanted.length > 0 ? wanted : bands.slice(rating < 1500 ? 0 : -2);
  const loaded = await Promise.all(chosen.map((entry) => loadBand(entry.file, entry.band)));
  return loaded.flat();
}

/** "kingsideAttack" → "Kingside attack". */
export const themeLabel = (theme: string): string => {
  const words = theme
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One puzzle by id, for a link to it: every band is read, since the id says nothing of its rating. */
export async function puzzleById(id: string): Promise<Puzzle | null> {
  const { bands } = await loadPuzzleManifest();
  const all = await Promise.all(bands.map((entry) => loadBand(entry.file, entry.band)));
  return all.flat().find((puzzle) => puzzle.id === id) ?? null;
}
