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
  Clock,
  Database,
  Library,
  Notebook,
  Opening,
  Recall,
  Repertoire,
  Review,
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
    id: 'recent',
    label: 'Recent',
    href: '/recent',
    icon: Clock,
    hint: 'Continue where you left off, and your pinned work.',
  },
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
    id: 'review',
    label: 'Review',
    href: '/review',
    icon: Review,
    hint: 'Study your own decisions: record first, reveal the evidence after.',
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
    id: 'opening-files',
    label: 'Opening Files',
    href: '/opening-files',
    icon: Opening,
    hint: 'One subject, and everything already stored about it.',
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
    id: 'endgame',
    label: 'Endgame',
    href: '/endgame',
    icon: Target,
    hint: 'A library of endgames, with tablebase proof beside them.',
  },
  {
    id: 'training',
    label: 'Training',
    href: '/training',
    icon: Recall,
    hint: 'Calculation and recall from your own positions.',
  },
];
