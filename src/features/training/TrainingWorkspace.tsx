'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Plus, Target, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { invalidateTraining, useTrainingItems } from '@/features/persistence/queries';
import { cn } from '@/lib/cn';
import {
  ANSWER_SOURCE_LABEL,
  EVALUATION_BANDS,
  type ReviewGrade,
  type TrainingItemRecord,
  type TrainingMode,
} from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import {
  countQueue,
  describeInterval,
  orderQueue,
  previewGrades,
  stageOf,
} from '@/training/schedule';
import { wasCorrect } from '@/training/answer';
import { useUi } from '@/stores/ui-store';

import { TrainingAnswer, type AttemptState } from './TrainingAnswer';
import { NavButton } from '@/features/shell/NavButton';

const MODE_LABEL: Record<TrainingMode, string> = {
  'repertoire-recall': 'Repertoire Recall',
  'best-move': 'Find the Best Move',
  candidates: 'Candidate Moves',
  evaluate: 'Evaluate the Position',
  plan: 'Choose the Plan',
};

const GRADES: readonly { id: ReviewGrade; label: string }[] = [
  { id: 'again', label: 'Again' },
  { id: 'hard', label: 'Hard' },
  { id: 'good', label: 'Good' },
  { id: 'easy', label: 'Easy' },
];

export function TrainingWorkspace() {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const setCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const training = useTrainingItems();
  const [now] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealedItemId, setRevealedItemId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{ itemId: string; state: AttemptState } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteItem, setDeleteItem] = useState<TrainingItemRecord | null>(null);
  const [scope, setScope] = useState<'due' | 'all'>('due');

  const items = useMemo(() => training.data ?? [], [training.data]);
  const queue = useMemo(() => orderQueue(items, now), [items, now]);
  const counts = useMemo(
    () =>
      countQueue(
        items.map((item) => item.schedule),
        now,
      ),
    [items, now],
  );
  const listed = scope === 'due' ? queue : items;
  const current = items.find((item) => item.id === selectedId) ?? queue[0] ?? items[0] ?? null;
  // Both the attempt and the reveal are keyed by item, so moving to another
  // card cannot show the previous card's answer as though it were this one's.
  const result = current && attempt?.itemId === current.id ? attempt.state : null;
  const revealed = current !== null && (revealedItemId === current.id || result !== null);

  const show = (id: string) => {
    setSelectedId(id);
    setRevealedItemId(null);
    setAttempt(null);
  };

  const grade = async (outcome: ReviewGrade) => {
    if (!current) return;
    setBusy(true);
    try {
      /*
        What the history records is whether the answer was right, not which
        button was pressed. Where nothing could be checked — a prose plan — the
        reviewer's own grade is the only evidence there is, so it stands in.
      */
      const correct = result ? wasCorrect(result.check, outcome !== 'again') : outcome !== 'again';
      const next = await (
        await getRepositories()
      ).training.review(current.id, outcome, correct, Date.now());
      invalidateTraining(queryClient);
      setSelectedId(null);
      setRevealedItemId(null);
      setAttempt(null);
      notify({
        tone: 'success',
        message: `${outcome === 'again' ? 'Returned' : 'Scheduled'} ${describeInterval(next.schedule.intervalDays)}.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The review could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: TrainingItemRecord) => {
    try {
      await (await getRepositories()).training.delete(item.id);
      invalidateTraining(queryClient);
      setSelectedId(null);
      notify({ tone: 'success', message: 'Training item deleted with its review history.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The item could not be deleted.',
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Target className="h-4 w-4 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Training</h1>
        <QueueSummary counts={counts} />
        <Button
          className="ml-auto"
          variant="accent"
          icon={<Plus />}
          onClick={() => setCaptureOpen(true)}
        >
          Create position
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:max-panes:grid-cols-[260px_minmax(360px,1fr)] md:overflow-hidden panes:grid-cols-[280px_minmax(430px,1fr)_350px]">
        <Panel className="min-h-[200px] border-b border-line-subtle md:min-h-0 md:border-r md:border-b-0">
          <PanelHeader
            actions={
              items.length ? (
                <Segmented
                  items={[
                    { id: 'due' as const, label: `Due ${queue.length}` },
                    { id: 'all' as const, label: `All ${items.length}` },
                  ]}
                  value={scope}
                  onChange={setScope}
                />
              ) : null
            }
          >
            Queue
          </PanelHeader>
          <PanelBody>
            {items.length === 0 ? (
              <EmptyState
                title="No training positions."
                description="Create one from a game, study, repertoire, or the current analysis position."
                action={<Button onClick={() => setCaptureOpen(true)}>Create position</Button>}
              />
            ) : listed.length === 0 ? (
              <EmptyState
                title="Nothing is due."
                description="Every item here is scheduled for a later day. Switch to All to review one early."
              />
            ) : (
              <ol className="divide-y divide-line-subtle">
                {listed.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => show(item.id)}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
                        current?.id === item.id && 'bg-accent-muted',
                      )}
                    >
                      <span className="block truncate text-[11.5px] text-secondary">
                        {item.prompt}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-tertiary">
                        <span>{MODE_LABEL[item.mode]}</span>
                        <span className="ml-auto capitalize">{stageOf(item.schedule)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </PanelBody>
        </Panel>

        <section className="flex min-h-[560px] min-w-0 flex-col px-3 py-3 sm:px-5 sm:py-4 md:min-h-0">
          {current ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xs font-medium text-primary">{current.prompt}</span>
                <span className="ml-auto text-[10px] text-tertiary">
                  {MODE_LABEL[current.mode]} · {current.sideToMove === 'w' ? 'White' : 'Black'} to
                  move
                </span>
              </div>
              <TrainingAnswer
                key={current.id}
                item={current}
                result={result}
                revealed={revealed}
                onSubmit={(state) => setAttempt({ itemId: current.id, state })}
                onReveal={() => setRevealedItemId(current.id)}
              />
              {revealed ? (
                <div className="mx-auto mt-2 w-full max-w-[620px]">
                  <GradeBar item={current} busy={busy} now={now} onGrade={grade} />
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="The review queue is empty." />
          )}
        </section>

        <aside className="min-h-[320px] border-t border-line-subtle bg-surface-1 panes:min-h-0 panes:border-t-0 panes:border-l">
          <Panel className="h-full">
            <PanelHeader
              actions={
                current ? (
                  <IconButton
                    label="Delete training item"
                    tone="danger"
                    onClick={() => setDeleteItem(current)}
                  >
                    <Trash />
                  </IconButton>
                ) : null
              }
            >
              Review details
            </PanelHeader>
            <PanelBody>
              {current ? <ReviewDetails item={current} revealed={revealed} /> : null}
            </PanelBody>
          </Panel>
        </aside>
      </div>
      <ConfirmDialog
        open={deleteItem !== null}
        title="Delete this training item?"
        description="The position and its complete review history will be removed from this device."
        confirmLabel="Delete training item"
        onCancel={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (deleteItem) await remove(deleteItem);
          setDeleteItem(null);
        }}
      />
    </div>
  );
}

function QueueSummary({ counts }: { readonly counts: ReturnType<typeof countQueue> }) {
  return (
    <div className="hidden items-center gap-3 text-[10.5px] text-tertiary tabular sm:flex">
      <span>Due {counts.due}</span>
      <span>New {counts.new}</span>
      <span>Learning {counts.learning}</span>
      <span>Mature {counts.mature}</span>
    </div>
  );
}

function GradeBar({
  item,
  busy,
  now,
  onGrade,
}: {
  readonly item: TrainingItemRecord;
  readonly busy: boolean;
  readonly now: number;
  readonly onGrade: (grade: ReviewGrade) => void;
}) {
  const previews = previewGrades(item.schedule, now);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {GRADES.map((grade) => (
        <Button
          key={grade.id}
          variant={grade.id === 'good' ? 'accent' : 'subtle'}
          className="h-auto flex-col justify-center gap-0.5 py-1.5"
          disabled={busy}
          onClick={() => onGrade(grade.id)}
        >
          <span>{grade.label}</span>
          <span className="text-[9.5px] font-normal opacity-70">
            {describeInterval(previews[grade.id])}
          </span>
        </Button>
      ))}
    </div>
  );
}

function ReviewDetails({
  item,
  revealed,
}: {
  readonly item: TrainingItemRecord;
  readonly revealed: boolean;
}) {
  const band = EVALUATION_BANDS.find((entry) => entry.id === item.expectedBand)?.label;
  return (
    <div className="divide-y divide-line-subtle text-[11.5px]">
      <section className="px-3 py-3">
        <p className="text-[10px] uppercase tracking-wide text-tertiary">Task</p>
        <p className="mt-1 text-secondary">{MODE_LABEL[item.mode]}</p>
        {item.source ? (
          <p className="mt-1 text-2xs text-tertiary">Source: {item.source.label}</p>
        ) : null}
      </section>
      <section className="px-3 py-3">
        <p className="text-[10px] uppercase tracking-wide text-tertiary">Answer</p>
        {!revealed ? (
          <p className="mt-1 text-tertiary">Hidden until you answer or reveal it.</p>
        ) : (
          <div className="mt-1 space-y-2 text-secondary">
            {item.solutionSan.length ? <p>{item.solutionSan.join(' / ')}</p> : null}
            {item.solutionSan.length ? (
              <p className="text-2xs text-tertiary">
                {ANSWER_SOURCE_LABEL[item.answerSource ?? 'user']}
              </p>
            ) : null}
            {item.candidatesUci.length ? <p>Candidates: {item.candidatesUci.join(', ')}</p> : null}
            {band ? <p>{band}</p> : null}
            {item.plans.map((plan) => (
              <p key={plan.color}>
                <span className="text-tertiary">{plan.color === 'w' ? 'White' : 'Black'}:</span>{' '}
                {plan.text}
              </p>
            ))}
            {item.explanation ? <p className="leading-relaxed">{item.explanation}</p> : null}
          </div>
        )}
      </section>
      <section className="px-3 py-3 text-2xs text-tertiary tabular">
        <p>Reviews {item.schedule.reviewCount}</p>
        <p className="mt-1">Lapses {item.schedule.lapses}</p>
        <p className="mt-1">Current interval {describeInterval(item.schedule.intervalDays)}</p>
      </section>
    </div>
  );
}
