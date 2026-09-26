'use client';

/**
 * The analysis toolbar.
 *
 * Now that documents persist there are far more than six things a user might
 * want here, and a row of twelve buttons is not a toolbar. Only the actions
 * taken constantly stay visible; everything that copies, exports or converts
 * lives behind one menu, where it is also discoverable by name.
 *
 * This is the *left* half of the header only — New, Import, the document menu
 * and the document's title. The position menu, position setup, command
 * search, theme and settings are the workspace frame's, and appear on every
 * route the same way; see `WorkspaceFrame`.
 */

import { Copy, Export, Import, Plus } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { START_FEN } from '@/chess/fen';
import type { CriticalCategory } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { DocumentHeader } from './DocumentHeader';
import { useCopyActions } from './useCopyActions';
import { useEvaluationWriteBack } from './useEvaluationWriteBack';

const CRITICAL_CATEGORIES: readonly { id: CriticalCategory; label: string }[] = [
  { id: 'opening', label: 'Opening' },
  { id: 'calculation', label: 'Calculation' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'time-trouble', label: 'Time trouble' },
];

export function Toolbar() {
  const newGame = useAnalysis((state) => state.newGame);
  const currentId = useAnalysis((state) => state.currentId);
  const rootId = useAnalysis((state) => state.tree.rootId);
  const critical = useAnalysis((state) => state.tree.nodes[state.currentId]?.meta.critical);
  const setCritical = useAnalysis((state) => state.setCritical);
  const clearMoves = useAnalysis((state) => state.clearMoves);
  const hasMoves = useAnalysis(
    (state) => (state.tree.nodes[state.tree.rootId]?.children.length ?? 0) > 0,
  );
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSaveToStudyOpen = useUi((state) => state.setSaveToStudyOpen);
  const setAddToRepertoireOpen = useUi((state) => state.setAddToRepertoireOpen);
  const setTrainingCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const setModelGameOpen = useUi((state) => state.setModelGameOpen);
  const copy = useCopyActions();
  const writeBack = useEvaluationWriteBack();

  const sections: readonly MenuSection[] = [
    {
      id: 'copy',
      items: [
        { id: 'pgn', label: 'Copy PGN', shortcut: '', icon: <Export />, run: copy.pgn },
        {
          id: 'pgn-from-here',
          label: 'Copy PGN from this move',
          icon: <Export />,
          disabled: currentId === rootId,
          run: copy.pgnFromHere,
        },
        { id: 'fen', label: 'Copy FEN', icon: <Copy />, run: copy.fen },
        { id: 'line', label: 'Copy this line (SAN)', icon: <Copy />, run: copy.sanLine },
        { id: 'uci', label: 'Copy this line (UCI)', icon: <Copy />, run: copy.uciLine },
      ],
    },
    {
      id: 'document',
      items: [
        { id: 'save', label: 'Save to study…', run: () => setSaveToStudyOpen(true) },
        {
          id: 'repertoire',
          label: 'Add to repertoire…',
          run: () => setAddToRepertoireOpen(true),
        },
        {
          id: 'training',
          label: 'Create training position…',
          run: () => setTrainingCaptureOpen(true),
        },
        {
          id: 'model-game',
          label: 'Mark as model game…',
          run: () => setModelGameOpen(true),
        },
        {
          id: 'import',
          label: 'Import PGN or FEN…',
          icon: <Import />,
          run: () => setImportOpen(true),
        },
        // Phase 86: stored engine evaluations into a study chapter, as one undoable batch.
        ...(writeBack.available
          ? [
              {
                id: 'add-evaluations',
                label: 'Add stored evaluations',
                run: () => void writeBack.add(),
              },
              {
                id: 'undo-evaluations',
                label: 'Undo added evaluations',
                disabled: !writeBack.canUndo,
                run: () => void writeBack.undo(),
              },
            ]
          : []),
      ],
    },
    {
      id: 'tree',
      items: [
        {
          id: 'clear-moves',
          label: 'Clear the move tree — back to the starting position',
          disabled: !hasMoves,
          danger: true,
          run: clearMoves,
        },
      ],
    },
    {
      /*
        Critical positions carry a category because "come back to this" and
        "I miscalculated here" lead to different work later. The categories are
        listed rather than hidden behind a submenu: five explicit items are
        easier to hit, and the current one shows as already chosen.
      */
      id: 'critical',
      items: [
        ...CRITICAL_CATEGORIES.map((entry) => ({
          id: `critical-${entry.id}`,
          label:
            critical === entry.id ? `Critical: ${entry.label} ✓` : `Mark critical — ${entry.label}`,
          run: () => setCritical(currentId, entry.id),
        })),
        ...(critical
          ? [
              {
                id: 'critical-clear',
                label: 'Unmark critical position',
                run: () => setCritical(currentId, null),
              },
            ]
          : []),
      ],
    },
  ];

  /*
    The header is one row and it does not wrap, so its width is a budget. On
    an iPad — 796 px of header beside the sidebar in landscape, 592 in
    portrait — the three toolbar labels, the document title and the header's
    own controls came to 835 px and the title was painted under "Position".
    The labels a person needs most are on the right (Position, Set up: the
    owner's Phase 53 report), so those keep theirs from `xs`, and these three
    — whose icons are the universal plus, download and share — give theirs
    up below `wide` (1080 px), where the row fits again with room to spare.
    Measured with `e2e/workspace-header-labels.spec.ts`.
  */
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-analysis-toolbar>
      {/* The document first, as a Mac document window names itself; the
          three actions on it follow as icons, their names on hover and for
          assistive technology. */}
      <div className="hidden min-w-0 flex-1 overflow-hidden md:block">
        <DocumentHeader />
      </div>

      <IconButton label="New analysis" onClick={() => newGame(START_FEN)}>
        <Plus />
      </IconButton>
      <IconButton label="Import PGN or FEN" onClick={() => setImportOpen(true)}>
        <Import />
      </IconButton>

      <Menu
        sections={sections}
        trigger={({ open, toggle, id }) => (
          <IconButton
            id={id}
            label="Document actions"
            aria-haspopup="menu"
            aria-expanded={open}
            active={open}
            onClick={toggle}
          >
            <Export />
          </IconButton>
        )}
      />
    </div>
  );
}
