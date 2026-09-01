/**
 * The workspace sections.
 *
 * Sections that exist but are not built yet are listed with `ready: false`
 * rather than hidden: the shape of the product should be visible, and a
 * disabled entry is honest where a fake screen is not.
 */

import type { ComponentType, SVGProps } from 'react';

import {
  Board,
  Database,
  Library,
  Notebook,
  Opening,
  Repertoire,
  Target,
} from '@/components/icons';

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly ready: boolean;
  readonly hint?: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { id: 'analysis', label: 'Analysis', href: '/analysis', icon: Board, ready: true },
  {
    id: 'games',
    label: 'Games',
    href: '/games',
    icon: Library,
    ready: true,
    hint: 'Import and review your own games.',
  },
  {
    id: 'database',
    label: 'Preparation',
    href: '/database',
    icon: Database,
    ready: true,
    hint: 'Prepare for opponents from local games.',
  },
  {
    id: 'openings',
    label: 'Openings',
    href: '/openings',
    icon: Opening,
    ready: true,
    hint: 'Explore theory with database evidence.',
  },
  {
    id: 'repertoire',
    label: 'Repertoire',
    href: '/repertoire',
    icon: Repertoire,
    ready: true,
    hint: 'Maintain lines you intend to play.',
  },
  {
    id: 'studies',
    label: 'Studies',
    href: '/studies',
    icon: Notebook,
    ready: true,
    hint: 'Notebooks of chapters and analysis.',
  },
  {
    id: 'training',
    label: 'Training',
    href: '/training',
    icon: Target,
    ready: true,
    hint: 'Calculation and recall from your own positions.',
  },
];
