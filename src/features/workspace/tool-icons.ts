import type { ComponentType, SVGProps } from 'react';

import {
  Board,
  Database,
  Dossier,
  Endgame,
  EngineAnalysis,
  Filter,
  Info,
  Library,
  Notebook,
  Opening,
  Pencil,
  PlayPosition,
  Players,
  Recall,
  Repertoire,
  Review,
  Search,
  Target,
} from '@/components/icons';

import type { WorkspaceModuleId } from './layout-model';

export type WorkspaceToolIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** One semantic icon mapping consumed by tabs, overflow menus and galleries. */
export const WORKSPACE_TOOL_ICONS: Readonly<Record<WorkspaceModuleId, WorkspaceToolIcon>> = {
  engine: EngineAnalysis,
  explorer: Search,
  'theory-book': Library,
  'opening-report': Opening,
  book: Notebook,
  database: Database,
  repertoire: Repertoire,
  'repertoire-health': Review,
  'model-games': Notebook,
  'personal-results': Players,
  features: Filter,
  transpositions: Opening,
  'theory-radar': Target,
  calculation: Pencil,
  'guess-the-move': Recall,
  candidates: Board,
  tablebase: Endgame,
  companion: Info,
  document: Notebook,
  conversion: Endgame,
  play: PlayPosition,
  report: Dossier,
  notes: Pencil,
  'move-tree': Opening,
};
