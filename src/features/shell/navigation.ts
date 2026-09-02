/**
 * The workspace sections.
 *
 * Every section listed here is built and reachable. There is deliberately no
 * `ready` flag any more: a disabled entry was honest while the product had
 * holes, but shipping a permanently dead row is just placeholder UI.
 *
 * `hint` is the tooltip shown on hover, and the only label in the collapsed
 * rail, so each one has to say what the section is for.
 */

import type { ComponentType, SVGProps } from 'react';

import {
  Board,
  Database,
  Library,
  Notebook,
  Opening,
  Recall,
  Repertoire,
  Target,
} from '@/components/icons';

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly hint: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'analysis',
    label: 'Analysis',
    href: '/analysis',
    icon: Board,
    hint: 'Analyse a position or game with engine and evidence.',
  },
  {
    id: 'openings',
    label: 'Openings',
    href: '/openings',
    icon: Opening,
    hint: 'Explore theory with database evidence.',
  },
  {
    id: 'games',
    label: 'Games',
    href: '/games',
    icon: Library,
    hint: 'Import and review your own games.',
  },
  {
    id: 'preparation',
    label: 'Preparation',
    href: '/preparation',
    icon: Target,
    hint: 'Prepare for opponents from local games.',
  },
  {
    id: 'databases',
    label: 'Databases',
    href: '/databases',
    icon: Database,
    hint: 'Manage collections, providers and connection health.',
  },
  {
    id: 'repertoire',
    label: 'Repertoire',
    href: '/repertoire',
    icon: Repertoire,
    hint: 'Maintain lines you intend to play.',
  },
  {
    id: 'studies',
    label: 'Studies',
    href: '/studies',
    icon: Notebook,
    hint: 'Notebooks of chapters and analysis.',
  },
  {
    id: 'training',
    label: 'Training',
    href: '/training',
    icon: Recall,
    hint: 'Calculation and recall from your own positions.',
  },
];
