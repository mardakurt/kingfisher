'use client';

/**
 * Filing a position report into a study.
 *
 * Two destinations, because they answer different questions. A **new chapter**
 * is for a position somebody wants to come back to: it starts at the position
 * itself, with the report as the chapter's opening note, so opening it puts the
 * board and the evidence together. **Appending to the open chapter** is for
 * work in progress: the report lands on the move you are looking at, in the
 * comment the move already has.
 *
 * Either way the note carries the moment it was taken and says that its figures
 * were measurements — the rule in ADR 0037. A stored report that reads like a
 * standing fact about the position is worse than no stored report, because in
 * six months nobody will be able to tell which numbers still hold.
 */

import { useState } from 'react';

import { setComment, setHeaders } from '@/chess/tree/tree';
import { createTree } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  invalidateStudies,
  useRepositoryMutation,
  useStudies,
} from '@/features/persistence/queries';
import type { StudyId } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { reportToStoredNote, type PositionReport } from './report';

const NEW_STUDY = '__new__';

type Destination = 'new-chapter' | 'current-chapter';

interface SaveReportDialogProps {
  readonly report: PositionReport;
  readonly context?: string;
  readonly onClose: () => void;
}

export function SaveReportDialog({ report, context, onClose }: SaveReportDialogProps) {
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const currentId = useAnalysis((state) => state.currentId);
  const comment = useAnalysis((state) => state.comment);

  const studies = useStudies();
  const list = studies.data ?? [];
  const inChapter = document.kind === 'study-chapter';

  const [destination, setDestination] = useState<Destination>(
    inChapter ? 'current-chapter' : 'new-chapter',
  );
  const [studyId, setStudyId] = useState<StudyId | typeof NEW_STUDY | ''>('');
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('Position report');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStudyId = studyId || (list[0]?.id ?? NEW_STUDY);
  const creatingStudy = effectiveStudyId === NEW_STUDY;

  const save = useRepositoryMutation(
    async (
      repositories,
      input: { studyId: StudyId | null; studyTitle: string; chapterTitle: string },
    ) => {
      const study = input.studyId ? await repositories.studies.get(input.studyId) : null;
      const target =
        study?.study ?? (await repositories.studies.create({ title: input.studyTitle }));

      /*
        A chapter that begins at the reported position rather than at the start
        of a game. The report is about *this* position, and a chapter that
        opened at move one would make the reader find it again.
      */
      const base = createTree(report.fen as Fen, {
        Event: input.chapterTitle,
        FEN: report.fen,
        SetUp: '1',
      });
      const tree = setComment(base, base.rootId, reportToStoredNote(report, context));

      return {
        study: target,
        chapter: await repositories.studies.createChapter({
          studyId: target.id,
          title: input.chapterTitle,
          tree: setHeaders(tree, tree.headers),
        }),
      };
    },
    (client) => invalidateStudies(client),
  );

  const submit = async () => {
    setError(null);
    if (destination === 'current-chapter') {
      /*
        Appended to whatever is already on the node rather than replacing it.
        A comment somebody wrote is theirs; a report is an addition to it, and
        overwriting a note to make room for evidence would be the wrong trade.
      */
      const existing = useAnalysis.getState().tree.nodes[currentId]?.comment ?? '';
      const note = reportToStoredNote(report, context);
      comment(currentId, existing ? `${existing}\n\n${note}` : note);
      notify({
        tone: 'success',
        message: 'Report added to this move’s note.',
        detail: inChapter
          ? 'Saved with the chapter.'
          : 'This document is not a study chapter yet, so the note is in the draft until you save it to a study.',
      });
      onClose();
      return;
    }

    if (creatingStudy && !newStudyTitle.trim()) {
      setError('Name the new study.');
      return;
    }
    setBusy(true);
    try {
      const result = await save.mutateAsync({
        studyId: creatingStudy ? null : (effectiveStudyId as StudyId),
        studyTitle: newStudyTitle.trim(),
        chapterTitle: chapterTitle.trim() || 'Position report',
      });
      notify({
        tone: 'success',
        message: `Saved to “${result.study.title}” as “${result.chapter.title}”.`,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Save report to a study"
      description="The note records when it was taken and that its figures were measurements at that moment."
      footer={
        <div className="flex w-full items-center gap-2">
          {error ? <span className="text-xs text-negative">{error}</span> : null}
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="accent" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : 'Save report'}
            </Button>
          </div>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Where to save the report</legend>
        <Choice
          checked={destination === 'current-chapter'}
          onSelect={() => setDestination('current-chapter')}
          label="Append to the move I am on"
          hint={
            inChapter
              ? `Added to the note on this move in “${document.title}”.`
              : 'This document is not a study chapter, so the note stays in the draft until you save it to one.'
          }
        />
        <Choice
          checked={destination === 'new-chapter'}
          onSelect={() => setDestination('new-chapter')}
          label="Save as a new chapter"
          hint="A chapter that opens at this position, with the report as its note."
        />
      </fieldset>

      {destination === 'new-chapter' ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-tertiary">
            Study
            <select
              value={effectiveStudyId}
              onChange={(event) => setStudyId(event.target.value as StudyId)}
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
            >
              {list.map((study) => (
                <option key={study.id} value={study.id}>
                  {study.title}
                </option>
              ))}
              <option value={NEW_STUDY}>New study…</option>
            </select>
          </label>
          {creatingStudy ? (
            <label className="text-xs text-tertiary">
              New study title
              <input
                value={newStudyTitle}
                onChange={(event) => setNewStudyTitle(event.target.value)}
                placeholder="Endgame research"
                className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
              />
            </label>
          ) : null}
          <label className="text-xs text-tertiary">
            Chapter title
            <input
              value={chapterTitle}
              onChange={(event) => setChapterTitle(event.target.value)}
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
            />
          </label>
        </div>
      ) : null}
    </Dialog>
  );
}

function Choice({
  checked,
  onSelect,
  label,
  hint,
}: {
  readonly checked: boolean;
  readonly onSelect: () => void;
  readonly label: string;
  readonly hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-[4px] border border-line p-2.5 hover:bg-surface-2">
      <input
        type="radio"
        name="report-destination"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-primary">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-tertiary">{hint}</span>
      </span>
    </label>
  );
}
