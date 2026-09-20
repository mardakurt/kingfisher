'use client';

/**
 * One assignment's thread, and the one thing you can do next.
 *
 * The brief at the top, the handovers in order, and an action box **pinned
 * under the thread** whose first button depends on who you are: a student
 * or a second sees "Hand in what's on the board"; a coach, or the player a
 * second's file is for, sees "Return with notes" and "Accept". Pinned, because a thread of ten handovers scrolls and the button
 * a coach reaches for thirty times an evening must not move. Nothing is
 * hidden from anyone — the file can be edited by whoever holds it, so a
 * permission would be theatre — but the button you need is the one you see
 * first.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { serializePgn } from '@/chess/pgn';
import { Button } from '@/components/ui/Button';
import { PanelBody, PanelHeader } from '@/components/ui/Panel';
import type { AssignmentRecord, Handover, ReviewVerdict, TeamRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import {
  assignmentStatus,
  describeEvidence,
  handoverEvidence,
  STATUS_LABEL,
  threadOrder,
} from '@/team';
import { cn } from '@/lib/cn';

import { describeDue, KIND_LABEL, REVIEWING_ROLES, ROLE_LABEL, shortDate } from './labels';
import { WhoAmI } from './WhoAmI';

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
  onChooseMe,
  busy,
}: {
  readonly team: TeamRecord;
  readonly assignment: AssignmentRecord;
  readonly onOpenBoard: (handover: Handover) => void;
  readonly onHandover: (draft: HandoverDraft) => void;
  readonly onArchive: (archived: boolean) => void;
  readonly onChooseMe: (memberId: string) => void;
  readonly busy: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [attachBoard, setAttachBoard] = useState(true);
  const notify = useUi((state) => state.notify);
  const openImport = useUi((state) => state.setImportOpen);
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

  const copyPgn = async (handover: Handover) => {
    if (!handover.pgn) return;
    try {
      await navigator.clipboard.writeText(handover.pgn);
      notify({
        tone: 'success',
        message: 'PGN copied. Paste it into ChessBase, a study, or anywhere.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not copy the PGN.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-team-thread>
      <PanelHeader
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onArchive(!assignment.archived)}
            disabled={busy}
          >
            {assignment.archived ? 'Unarchive' : 'Archive'}
          </Button>
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
          {assignment.archived ? ' · archived' : ''}
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
        {assignment.opponent ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-line-subtle bg-surface-2 px-2.5 py-1.5">
            <span className="text-[11px] text-primary">
              vs {assignment.opponent}
              {assignment.myColor
                ? ` · we have ${assignment.myColor === 'w' ? 'White' : 'Black'}`
                : ''}
            </span>
            <Button
              size="sm"
              variant="subtle"
              className="ml-auto"
              onClick={() =>
                router.push(`/preparation?player=${encodeURIComponent(assignment.opponent!)}`)
              }
            >
              Open in Preparation
            </Button>
          </div>
        ) : null}
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
                  <>
                    <p className="mt-1 text-[10px] text-tertiary">
                      {describeEvidence(handover.evidence)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="subtle" onClick={() => onOpenBoard(handover)}>
                        Open on board
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void copyPgn(handover)}>
                        Copy PGN
                      </Button>
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </PanelBody>

      {/* Pinned under the thread: the one thing to do next never scrolls away. */}
      {me ? (
        <div className="shrink-0 border-t border-line-subtle px-3 py-2.5" data-team-actions>
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
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={busy || !boardHasMoves}
                  onClick={() => submit('hand-in')}
                >
                  Hand in what’s on the board
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => submit('note')}>
                  Add a note
                </Button>
              </div>
              {!boardHasMoves ? (
                <p className="mt-1.5 text-[10.5px] text-tertiary" data-team-empty-board>
                  The board is empty. Play your moves on it, or{' '}
                  <button
                    type="button"
                    className="text-accent underline-offset-2 hover:underline"
                    onClick={() => openImport(true)}
                  >
                    import a PGN
                  </button>
                  ; then hand it in.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="shrink-0 border-t border-line-subtle px-3 py-2.5" data-team-who>
          <WhoAmI team={team} onChoose={onChooseMe} busy={busy} />
        </div>
      )}
    </div>
  );
}
