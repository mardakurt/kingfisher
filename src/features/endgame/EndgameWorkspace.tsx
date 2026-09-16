'use client';

/**
 * The endgame laboratory.
 *
 * A library and a board, not a course. Kingfisher has no opinion about which
 * endgames a player should study — that is the coach's job or the player's —
 * so this stores the positions *they* decided were worth keeping, categorised
 * the way they think about them, and puts a tablebase and an engine beside
 * them.
 *
 * The one piece of real machinery here is conversion practice: play the
 * position out against the engine from the side you chose, with the tablebase
 * available to say whether you are still winning. That is the exercise a
 * strong player actually does, and it is the one thing a static position list
 * cannot give them.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Panel';
import { Target } from '@/components/icons';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { useEndgamePositions } from '@/features/preparation/queries';
import { getRepositories } from '@/persistence/repositories';
import {
  ENDGAME_CATEGORIES,
  ENDGAME_CATEGORY_LABEL,
  ENDGAME_GOAL_LABEL,
  type EndgameCategory,
  type EndgameGoal,
  type EndgamePositionRecord,
} from '@/persistence/domain';
import { countPieces } from '@/persistence/repositories/endgame-repository';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

const GOALS: readonly EndgameGoal[] = ['convert-win', 'hold-draw', 'find-best-move', 'study'];

export function EndgameWorkspace() {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const openDocument = useAnalysis((state) => state.openDocument);
  const node = useAnalysis((state) => state.tree.nodes[state.currentId]);

  const [category, setCategory] = useState<EndgameCategory | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useMemo(() => (category === 'all' ? {} : { category }), [category]);
  const positions = useEndgamePositions(query);

  const open = (record: EndgamePositionRecord) => {
    setSelectedId(record.id);
    openDocument({
      tree: createTree(record.fen, { Event: record.title, Result: '*' }),
      document: { kind: 'untitled', title: record.title },
      orientation: record.sideToMove,
    });
  };

  const save = async (input: {
    title: string;
    category: EndgameCategory;
    goal: EndgameGoal;
    note?: string;
  }) => {
    if (!node) return;
    setSaving(true);
    try {
      const repositories = await getRepositories();
      const record = await repositories.endgames.create({
        positionKey: positionKey(node.fen),
        fen: node.fen,
        sideToMove: node.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        ...input,
      });
      void client.invalidateQueries({ queryKey: ['persistence', 'endgames'] });
      setSelectedId(record.id);
      notify({
        tone: 'success',
        message: `Saved as ${ENDGAME_CATEGORY_LABEL[record.category].toLowerCase()}.`,
        detail: `${record.pieceCount} pieces — ${record.pieceCount <= 7 ? 'a tablebase can answer this' : 'beyond any tablebase'}.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not save the position.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const selected = (positions.data ?? []).find((record) => record.id === selectedId) ?? null;

  const railContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line-subtle px-2 py-1.5">
        <label className="text-[10px] text-tertiary">
          <span className="sr-only">Category</span>
          <select
            aria-label="Endgame category"
            value={category}
            onChange={(event) => setCategory(event.target.value as EndgameCategory | 'all')}
            className="h-6 w-full rounded-[3px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary"
          >
            <option value="all">Every category</option>
            {ENDGAME_CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {ENDGAME_CATEGORY_LABEL[entry]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {positions.isPending ? (
          <p className="px-3 py-3 text-2xs text-tertiary">Reading the library…</p>
        ) : (positions.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing saved yet."
            description="Set up an endgame on the board with Set up — or open one from a game — and save it with the category you think of it as."
          >
            {/*
              Phase 56: a small explainer for the feature the user has not
              noticed they do not have yet. Tablebases are an optional
              install on the desktop; they are not part of the empty-state
              pitch because the page is about *your* saved endgames, not
              Syzygy. But a new user who has not heard of either does not
              know what the tablebase panel above does or how to install
              them. Phase 59: the "Settings → Companion" mention used to
              be plain text; it is now a button that opens Settings at
              the Companion section so the user does not have to find
              Tablebases themselves.
            */}
            <p className="mt-3 text-2xs leading-relaxed text-tertiary">
              <strong className="font-medium text-secondary">Want tablebase lookups?</strong> The
              companion reads Syzygy files locally and tells you whether a side is still winning,
              drawn, or lost at the current position. Install them from{' '}
              <button
                type="button"
                onClick={() => openSettingsAt('companion')}
                className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-secondary"
              >
                Settings → Companion
              </button>{' '}
              — pick a folder of <code>.rtbw</code> and <code>.rtbz</code> files under{' '}
              <em>Tablebases</em> and the companion takes care of the rest. The Explorer in Analysis
              also benefits: positions are evaluated through the tablebase when one is available,
              and the chess engine otherwise.
            </p>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {positions.data?.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => open(record)}
                  className={cn(
                    'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
                    record.id === selectedId && 'bg-surface-2',
                  )}
                >
                  <p className="truncate text-[11.5px] text-primary">{record.title}</p>
                  <p className="mt-0.5 text-[10px] text-tertiary tabular">
                    {ENDGAME_CATEGORY_LABEL[record.category]} · {ENDGAME_GOAL_LABEL[record.goal]} ·{' '}
                    {record.pieceCount} pieces
                    {record.pieceCount <= 7 ? ' · tablebase' : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <WorkspaceFrame
      workspace="endgame"
      title="Endgame lab"
      subtitle={node ? `${countPieces(node.fen)} pieces on the board` : undefined}
      icon={<Target />}
      actions={<SaveButton disabled={saving || !node} onSave={save} />}
      rail={{ label: 'Library', width: 250, content: railContent }}
      board={{ mode: 'interactive', showEvaluationArtifacts: true }}
      belowBoard={
        selected ? (
          <div className="shrink-0 border-t border-line-subtle px-3 py-2">
            <p className="text-[11px] text-primary">{selected.title}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">
              {ENDGAME_GOAL_LABEL[selected.goal]}
              {selected.note ? ` · ${selected.note}` : ''}
            </p>
            {/* The honest framing for practice: the engine is an opponent
                here, not an oracle, and the tablebase is the referee. */}
            <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
              Open <span className="text-secondary">Play it out</span> to convert this against the
              engine. After every move the tablebase says what the position is now worth — it
              reports the result, not a verdict on your move.
            </p>
          </div>
        ) : undefined
      }
      contextLabel="Position"
    />
  );
}

function SaveButton({
  className,
  disabled,
  onSave,
}: {
  readonly className?: string;
  readonly disabled: boolean;
  readonly onSave: (input: {
    title: string;
    category: EndgameCategory;
    goal: EndgameGoal;
    note?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EndgameCategory>('rook');
  const [goal, setGoal] = useState<EndgameGoal>('convert-win');
  const [note, setNote] = useState('');

  return (
    <>
      <Button className={className} disabled={disabled} onClick={() => setOpen(true)}>
        Save this position
      </Button>
      {open ? (
        <Dialog open title="Save an endgame position" onClose={() => setOpen(false)}>
          <form
            className="flex flex-col gap-3 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return;
              onSave({
                title: title.trim(),
                category,
                goal,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              setOpen(false);
              setTitle('');
              setNote('');
            }}
          >
            <label className="flex flex-col gap-1 text-2xs text-tertiary">
              Title
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Lucena, rook behind the pawn"
                className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-2xs text-tertiary">
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as EndgameCategory)}
                  className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary"
                >
                  {ENDGAME_CATEGORIES.map((entry) => (
                    <option key={entry} value={entry}>
                      {ENDGAME_CATEGORY_LABEL[entry]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-2xs text-tertiary">
                What you are practising
                <select
                  value={goal}
                  onChange={(event) => setGoal(event.target.value as EndgameGoal)}
                  className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary"
                >
                  {GOALS.map((entry) => (
                    <option key={entry} value={entry}>
                      {ENDGAME_GOAL_LABEL[entry]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-2xs text-tertiary">
              Note
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="resize-y rounded-[4px] border border-line bg-surface-inset px-2 py-1 text-xs leading-relaxed text-primary outline-none focus:border-accent/60"
              />
            </label>
            <p className="text-[10px] leading-relaxed text-tertiary">
              The category is yours. &ldquo;Fortress&rdquo; and &ldquo;technical conversion&rdquo;
              describe what a position is <em>for</em>, and counting material cannot produce them.
            </p>
            <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={!title.trim()}>
                Save position
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
