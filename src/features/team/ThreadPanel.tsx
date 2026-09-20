'use client';

/**
 * One assignment's thread, and the one thing you can do next.
 *
 * The brief at the top, the handovers in order, and an action box at the
 * bottom whose first button depends on who you are: a student sees "Hand in
 * what's on the board", a coach sees "Return with notes" and "Accept". Nothing
 * is hidden from anyone — the file can be edited by whoever holds it, so a
 * permission would be theatre — but the button you need is the one you see
 * first, which is what a coach with thirty students needs from this panel.
 */

import { useState } from 'react';

import { serializePgn } from '@/chess/pgn';
import { Button } from '@/components/ui/Button';
import { PanelBody, PanelHeader } from '@/components/ui/Panel';
import type { AssignmentRecord, Handover, ReviewVerdict, TeamRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import {
  assignmentStatus,
  describeEvidence,
  handoverEvidence,
  STATUS_LABEL,
  threadOrder,
} from '@/team';
import { cn } from '@/lib/cn';

import { describeDue, KIND_LABEL, REVIEWING_ROLES, ROLE_LABEL, shortDate } from './labels';

export interface HandoverDraft {
  readonly kind: Handover['kind'];
  readonly note: string;
  readonly pgn?: string;
  readonly verdict?: ReviewVerdict;
  readonly evidence?: Handover['evidence'];
}

export function ThreadPanel({
  team,
  assignment,
  onOpenBoard,
  onHandover,
  onArchive,
  busy,
}: {
  readonly team: TeamRecord;
  readonly assignment: AssignmentRecord;
  readonly onOpenBoard: (handover: Handover) => void;
  readonly onHandover: (draft: HandoverDraft) => void;
  readonly onArchive: () => void;
  readonly busy: boolean;
}) {
  const [note, setNote] = useState('');
  const [attachBoard, setAttachBoard] = useState(true);
  const boardHasMoves = useAnalysis(
    (state) => (state.tree.nodes[state.tree.rootId]?.children.length ?? 0) > 0,
  );
  const me = team.members.find((member) => member.id === team.me) ?? null;
  const nameOf = (id: string | undefined) =>
    team.members.find((member) => member.id === id)?.name ?? 'someone no longer in the team';
  const status = assignmentStatus(assignment);
  const iReview = me ? REVIEWING_ROLES.has(me.role) && assignment.assignedTo !== me.id : false;
  const due = describeDue(assignment.due);

  const snapshot = (): Pick<HandoverDraft, 'pgn' | 'evidence'> => {
    const tree = useAnalysis.getState().tree;
    return { pgn: serializePgn(tree), evidence: handoverEvidence(tree) };
  };

  const submit = (kind: Handover['kind'], verdict?: ReviewVerdict) => {
    const withBoard = kind === 'hand-in' || (attachBoard && boardHasMoves);
    onHandover({ kind, note, ...(verdict ? { verdict } : {}), ...(withBoard ? snapshot() : {}) });
    setNote('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-team-thread>
      <PanelHeader
        actions={
          assignment.archived ? null : (
            <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          )
        }
      >
        <span className="truncate normal-case tracking-normal text-primary">
          {assignment.title}
        </span>
      </PanelHeader>
      <PanelBody className="px-3 py-3">
        <p className="text-[10.5px] text-tertiary">
          {KIND_LABEL[assignment.kind]} · set by {nameOf(assignment.setBy)}
          {assignment.assignedTo
            ? ` · for ${nameOf(assignment.assignedTo)}`
            : ' · for the whole team'}
          {due ? ` · ${due}` : ''}
        </p>
        <p className="mt-1">
          <span
            className={cn(
              'inline-block rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium',
              status === 'accepted' && 'bg-positive/15 text-positive',
              status === 'handed-in' && 'bg-accent/15 text-accent',
              status === 'returned' && 'bg-caution/15 text-caution',
              status === 'todo' && 'bg-surface-3 text-secondary',
            )}
            data-team-status={status}
          >
            {STATUS_LABEL[status]}
          </span>
        </p>
        {assignment.brief ? (
          <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-primary">
            {assignment.brief}
          </p>
        ) : null}

        <h4 className="mt-4 text-[9.5px] uppercase tracking-wide text-tertiary">Thread</h4>
        {assignment.handovers.length === 0 ? (
          <p className="mt-1 text-[10.5px] text-tertiary">Nothing handed over yet.</p>
        ) : (
          <ol className="mt-1 flex flex-col gap-2">
            {threadOrder(assignment.handovers).map((handover) => (
              <li
                key={handover.id}
                className="rounded-[4px] border border-line-subtle bg-surface-2 px-2.5 py-2"
                data-team-handover={handover.kind}
              >
                <p className="text-[10.5px] text-secondary">
                  <span className="font-medium text-primary">{handover.authorName}</span>
                  {' · '}
                  {handover.kind === 'hand-in'
                    ? 'handed in'
                    : handover.kind === 'review'
                      ? handover.verdict === 'accepted'
                        ? 'accepted'
                        : 'returned with notes'
                      : 'noted'}
                  {' · '}
                  {shortDate(handover.at)}
                </p>
                {handover.note ? (
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-primary">
                    {handover.note}
                  </p>
                ) : null}
                {handover.pgn ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="subtle" onClick={() => onOpenBoard(handover)}>
                      Open on board
                    </Button>
                    <span className="text-[10px] text-tertiary">
                      {describeEvidence(handover.evidence)}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {me ? (
          <div className="mt-4 border-t border-line-subtle pt-3" data-team-actions>
            <p className="text-[10px] text-tertiary">
              You are {me.name} ({ROLE_LABEL[me.role]}).
            </p>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                iReview
                  ? 'What to fix, what was good, what to look at next.'
                  : 'What you found, and where you were unsure.'
              }
              aria-label="Note"
              className="mt-1.5 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2 py-1.5 text-[11px] leading-relaxed text-primary outline-none focus:border-accent/60"
            />
            {iReview ? (
              <>
                <label className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-secondary">
                  <input
                    type="checkbox"
                    checked={attachBoard && boardHasMoves}
                    disabled={!boardHasMoves}
                    onChange={(event) => setAttachBoard(event.target.checked)}
                    className="accent-accent"
                  />
                  Attach what is on the board
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={busy}
                    onClick={() => submit('review', 'needs-work')}
                  >
                    Return with notes
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={busy}
                    onClick={() => submit('review', 'accepted')}
                  >
                    Accept
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => submit('note')}>
                    Add a note
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={busy || !boardHasMoves}
                  title={boardHasMoves ? undefined : 'Put your analysis on the board first.'}
                  onClick={() => submit('hand-in')}
                >
                  Hand in what’s on the board
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => submit('note')}>
                  Add a note
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </PanelBody>
    </div>
  );
}
