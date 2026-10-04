'use client';

/**
 * A database's own icon — ChessBase's Databases grid gives each database a
 * picture of its own (screenshot 8: a trophy for Mega, pieces for Tactics).
 *
 * Kingfisher's tiles were told apart only by storage: blue for this browser,
 * grey for a SQLite file. A person can now choose a glyph and a colour for
 * each, kept in the `databaseIcons` preference by collection id; one
 * component draws it on the grid and in the sidebar, so the two agree.
 */

import type { ComponentType, SVGProps } from 'react';

import {
  Database,
  Endgame,
  Library,
  Notebook,
  Opening,
  Players,
  Repertoire,
  Tactics,
  Target,
  Team,
} from '@/components/icons';
import type { CollectionFacts } from '@/database/collections/types';
import { cn } from '@/lib/cn';
import { usePreferences, type DatabaseIconChoice } from '@/stores/preferences-store';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export const DATABASE_GLYPHS: Readonly<
  Record<DatabaseIconChoice['glyph'], { label: string; Icon: Icon }>
> = {
  database: { label: 'Database', Icon: Database },
  library: { label: 'Games', Icon: Library },
  opening: { label: 'Openings', Icon: Opening },
  repertoire: { label: 'Repertoire', Icon: Repertoire },
  players: { label: 'Players', Icon: Players },
  team: { label: 'Team', Icon: Team },
  tactics: { label: 'Tactics', Icon: Tactics },
  endgame: { label: 'Endgames', Icon: Endgame },
  notebook: { label: 'Notes', Icon: Notebook },
  target: { label: 'Preparation', Icon: Target },
};

export const DATABASE_COLOURS: Readonly<
  Record<DatabaseIconChoice['colour'], { label: string; tile: string; ink: string }>
> = {
  blue: {
    label: 'Blue',
    tile: 'bg-gradient-to-b from-[#4f8ff0] to-[#2563d4]',
    ink: 'text-[#3b7be6]',
  },
  slate: {
    label: 'Slate',
    tile: 'bg-gradient-to-b from-[#6f7785] to-[#4b525d]',
    ink: 'text-[#6b7380]',
  },
  gold: {
    label: 'Gold',
    tile: 'bg-gradient-to-b from-[#f2c14e] to-[#d99a1e]',
    ink: 'text-[#d99a1e]',
  },
  green: {
    label: 'Green',
    tile: 'bg-gradient-to-b from-[#4cc38a] to-[#23955f]',
    ink: 'text-[#2fa86c]',
  },
  red: {
    label: 'Red',
    tile: 'bg-gradient-to-b from-[#f0716b] to-[#cf3b35]',
    ink: 'text-[#dc4a43]',
  },
  purple: {
    label: 'Purple',
    tile: 'bg-gradient-to-b from-[#a07cf0] to-[#7449d6]',
    ink: 'text-[#8a60e6]',
  },
};

/** What a collection looks like when nobody has chosen: by where it is stored. */
export function defaultIcon(kind: CollectionFacts['kind']): DatabaseIconChoice {
  return kind === 'sqlite'
    ? { glyph: 'database', colour: 'slate' }
    : { glyph: 'library', colour: 'blue' };
}

export function useDatabaseIcon(
  collection: Pick<CollectionFacts, 'id' | 'kind'>,
): DatabaseIconChoice {
  const chosen = usePreferences((state) => state.databaseIcons[collection.id]);
  return chosen ?? defaultIcon(collection.kind);
}

/** The tile on the grid: a coloured square with a white glyph. */
export function DatabaseTileIcon({
  collection,
  className,
}: {
  readonly collection: Pick<CollectionFacts, 'id' | 'kind'>;
  readonly className?: string;
}) {
  const { glyph, colour } = useDatabaseIcon(collection);
  const { Icon } = DATABASE_GLYPHS[glyph];
  return (
    <span
      aria-hidden
      className={cn(className, DATABASE_COLOURS[colour].tile, 'text-white')}
      data-database-icon={`${glyph}:${colour}`}
    >
      <Icon className="h-7 w-7" />
    </span>
  );
}

/** The glyph alone, in the colour, where a tile would be too much (the sidebar). */
export function DatabaseGlyph({
  collection,
  className,
}: {
  readonly collection: Pick<CollectionFacts, 'id' | 'kind'>;
  readonly className?: string;
}) {
  const { glyph, colour } = useDatabaseIcon(collection);
  const { Icon } = DATABASE_GLYPHS[glyph];
  return (
    <Icon
      aria-hidden
      className={cn(className, DATABASE_COLOURS[colour].ink)}
      data-database-glyph={`${glyph}:${colour}`}
    />
  );
}
