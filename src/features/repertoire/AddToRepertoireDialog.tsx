'use client';

/**
 * Filing a line into a repertoire, from wherever the user is analysing.
 *
 * The whole line is offered by default rather than a single move, because a
 * repertoire built one move at a time never gets built. Only the moves of the
 * repertoire's own colour retain the selected role; opponent moves are stored
 * as expected continuations so later game analysis can report who deviated.
 */

import { useMemo, useState } from 'react';

import { moveNumberOfPly } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Tabs';
import { useRepertoireMutation, useRepertoires } from '@/features/repertoire/mutations';
import { lineToKnowledge } from '@/repertoire';
import { REPERTOIRE_ROLES, type RepertoireRole } from '@/persistence/domain';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

const NEW_REPERTOIRE = '__new__';

const ROLE_LABEL: Record<RepertoireRole, string> = {
  main: 'Main',
  alternative: 'Alternative',
  candidate: 'Candidate',
  avoid: 'Avoid',
};

const ROLE_HINT: Record<RepertoireRole, string> = {
  main: 'What you intend to play here.',
  alternative: 'A second answer you are equally happy with.',
  candidate: 'Under consideration; not yet trusted.',
  avoid: 'Decided against — recorded so you do not reconsider it every season.',
};

export function AddToRepertoireDialog() {
  const open = useUi((state) => state.addToRepertoireOpen);
  return open ? <AddToRepertoireForm /> : null;
}

function AddToRepertoireForm() {
  const setOpen = useUi((state) => state.setAddToRepertoireOpen);
  const notify = useUi((state) => state.notify);
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);

  const repertoires = useRepertoires();
  const list = repertoires.data ?? [];

  const [choice, setChoice] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'w' | 'b'>('w');
  const [role, setRole] = useState<RepertoireRole>('main');
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<'line' | 'move'>('line');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = choice || (list[0]?.id ?? NEW_REPERTOIRE);
  const creating = selected === NEW_REPERTOIRE;
  const color = creating ? newColor : (list.find((r) => r.id === selected)?.color ?? 'w');

  const entries = useMemo(
    () => lineToKnowledge(tree, currentId, color, role, note || undefined),
    [tree, currentId, color, role, note],
  );
  const staged = scope === 'move' ? entries.slice(-1) : entries;
  const ownCount = staged.filter((entry) => !entry.move.expected).length;

  const save = useRepertoireMutation();

  const submit = async () => {
    if (creating && !newTitle.trim()) {
      setError('Name the new repertoire.');
      return;
    }
    if (staged.length === 0) {
      setError('Play at least one move before adding this line.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await save.mutateAsync({
        repertoireId: creating ? null : selected,
        title: newTitle.trim(),
        color,
        entries: staged,
      });
      notify({
        tone: 'success',
        message: `${staged.length} position${staged.length === 1 ? '' : 's'} saved to ${result.title}.`,
        detail:
          staged.length > 1
            ? 'Positions already known were updated rather than duplicated.'
            : undefined,
      });
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That could not be saved.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : setOpen(false))}
      title="Add to repertoire"
      description="Positions are stored canonically, so a line you reach by a different move order is the same knowledge."
      width="w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : `Save ${staged.length} position${staged.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <label className="block text-2xs text-tertiary">
        Repertoire
        <select
          value={selected}
          onChange={(event) => setChoice(event.target.value)}
          className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
        >
          {list.map((repertoire) => (
            <option key={repertoire.id} value={repertoire.id}>
              {repertoire.title} ({repertoire.color === 'w' ? 'White' : 'Black'})
            </option>
          ))}
          <option value={NEW_REPERTOIRE}>New repertoire…</option>
        </select>
      </label>

      {creating && (
        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1 text-2xs text-tertiary">
            Title
            <input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="1.e4 main repertoire"
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
            />
          </label>
          <div className="text-2xs text-tertiary">
            Side
            <Segmented
              className="mt-1"
              items={[
                { id: 'w', label: 'White' },
                { id: 'b', label: 'Black' },
              ]}
              value={newColor}
              onChange={(value) => setNewColor(value)}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="text-2xs text-tertiary">
          Store
          <Segmented
            className="mt-1"
            items={[
              { id: 'line', label: `Whole line (${entries.length})` },
              { id: 'move', label: 'Last move only' },
            ]}
            value={scope}
            onChange={(value) => setScope(value)}
          />
        </div>
        <div className="text-2xs text-tertiary">
          Role
          <Segmented
            className="mt-1"
            items={REPERTOIRE_ROLES.map((id) => ({ id, label: ROLE_LABEL[id] }))}
            value={role}
            onChange={(value) => setRole(value)}
          />
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-tertiary">{ROLE_HINT[role]}</p>

      <label className="mt-3 block text-2xs text-tertiary">
        Note on the last move (optional)
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this move, and what to remember about it"
          className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
        />
      </label>

      {/* What will actually be stored, before it is stored. */}
      <div className="mt-3 rounded-[4px] border border-line-subtle bg-surface-inset p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-tertiary">
          To be recorded — {ownCount} {color === 'w' ? 'White' : 'Black'} decision
          {ownCount === 1 ? '' : 's'}, {staged.length - ownCount} expected repl
          {staged.length - ownCount === 1 ? 'y' : 'ies'}
        </p>
        {staged.length === 0 ? (
          <p className="text-2xs text-tertiary">Nothing yet — play a move first.</p>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-secondary [overflow-wrap:anywhere]">
            {staged.map((entry, index) => (
              <span key={`${entry.positionKey}-${entry.move.uci}`} className="mr-1.5">
                {/* Numbered by the side that actually plays the move: an
                    opponent reply shown as "2.c5" is a different game. */}
                {(entry.sideToMove === 'w' || index === 0) && (
                  <span className="text-tertiary tabular">
                    {moveNumberOfPly(entry.ply)}
                    {entry.sideToMove === 'w' ? '.' : '…'}
                  </span>
                )}{' '}
                <span
                  className={cn(
                    entry.move.expected ? 'text-tertiary italic' : 'text-secondary',
                    index === staged.length - 1 && !entry.move.expected && 'text-primary',
                  )}
                >
                  {entry.move.san}
                </span>
              </span>
            ))}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-tertiary">
          Your moves keep the role above; the opponent’s are stored as expected replies, which is
          what later lets a game say who left the preparation first.
        </p>
      </div>

      {error && <p className="mt-2 text-2xs text-negative">{error}</p>}
    </Dialog>
  );
}
