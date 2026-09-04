/**
 * The workspace sections.
 *
 * Every section listed here is built and reachable. There is deliberately no
 * `ready` flag: a disabled entry was honest while the product had holes, but
 * shipping a permanently dead row is just placeholder UI.
 *
 * Three things this file is responsible for, and they are all about being able
 * to find something in a list that has grown to thirteen entries:
 *
 *  - **Groups.** Thirteen equally-weighted rows is a menu nobody reads. Four
 *    named groups turn it into four short lists, and the names say what the
 *    sections are *for* rather than what they are called.
 *  - **One icon per section, never shared.** Openings and Opening Files used
 *    the same branching lines; Preparation and Endgame used the same bullseye.
 *    In the collapsed rail, where the icon is the only label, that made four
 *    sections into two. `navigation.test.ts` fails if it happens again.
 *  - **`hint` is the tooltip**, and the only label in the collapsed rail, so
 *    each one has to say what the section is for.
 */

import type { ComponentType, SVGProps } from 'react';

import {
  Board,
  Clock,
  Database,
  Dossier,
  Endgame,
  Library,
  Notebook,
  Opening,
  Players,
  Recall,
  Repertoire,
  Review,
  Target,
} from '@/components/icons';

export type NavGroupId = 'start' | 'study' | 'prepare' | 'improve' | 'data';

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly hint: string;
  readonly group: NavGroupId;
}

/** `start` has no heading: one row does not need a title above it. */
export const NAV_GROUPS: readonly { readonly id: NavGroupId; readonly label: string | null }[] = [
  { id: 'start', label: null },
  { id: 'study', label: 'Study' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'improve', label: 'Improve' },
  { id: 'data', label: 'Data' },
];

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'recent',
    label: 'Recent',
    href: '/recent',
    icon: Clock,
    hint: 'Continue where you left off, and your pinned work.',
    group: 'start',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    href: '/analysis',
    icon: Board,
    hint: 'Analyse a position or game with engine and evidence.',
    group: 'study',
  },
  {
    id: 'openings',
    label: 'Openings',
    href: '/openings',
    icon: Opening,
    hint: 'Browse the opening library and explore theory with database evidence.',
    group: 'study',
  },
  {
    id: 'studies',
    label: 'Studies',
    href: '/studies',
    icon: Notebook,
    hint: 'Notebooks of chapters and analysis.',
    group: 'study',
  },
  {
    id: 'repertoire',
    label: 'Repertoire',
    href: '/repertoire',
    icon: Repertoire,
    hint: 'Maintain lines you intend to play.',
    group: 'study',
  },
  {
    id: 'preparation',
    label: 'Preparation',
    href: '/preparation',
    icon: Target,
    hint: 'Prepare for a specific opponent from their games.',
    group: 'prepare',
  },
  {
    id: 'players',
    label: 'Players',
    href: '/players',
    icon: Players,
    hint: 'Search elite and historical players across your reference sources.',
    group: 'prepare',
  },
  {
    id: 'opening-files',
    label: 'Opening Files',
    href: '/opening-files',
    icon: Dossier,
    hint: 'One subject, and everything already stored about it.',
    group: 'prepare',
  },
  {
    id: 'review',
    label: 'Review',
    href: '/review',
    icon: Review,
    hint: 'Study your own decisions: record first, reveal the evidence after.',
    group: 'improve',
  },
  {
    id: 'training',
    label: 'Training',
    href: '/training',
    icon: Recall,
    hint: 'Calculation and recall from your own positions.',
    group: 'improve',
  },
  {
    id: 'endgame',
    label: 'Endgame',
    href: '/endgame',
    icon: Endgame,
    hint: 'A library of endgames, with tablebase proof beside them.',
    group: 'improve',
  },
  {
    id: 'games',
    label: 'Games',
    href: '/games',
    icon: Library,
    hint: 'Import and review your own games.',
    group: 'data',
  },
  {
    id: 'databases',
    label: 'Databases',
    href: '/databases',
    icon: Database,
    hint: 'Collections, reference packs, and what each source may answer.',
    group: 'data',
  },
];

export const sectionsInGroup = (group: NavGroupId): readonly NavSection[] =>
  NAV_SECTIONS.filter((section) => section.group === group);
