'use client';

/**
 * The session, as a strip rather than a screen.
 *
 * A preparation session is context, not a destination: the player is preparing
 * *while* looking at an opening tree, not looking at a session record. So it
 * lives as one row above the workspace that says which game is being prepared
 * for, and gets out of the way. Making it a landing page with cards would put
 * a click between the player and the board every time they come back.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Target } from '@/components/icons';
import type { PreparationSessionRecord } from '@/persistence/domain';

export function SessionBar({
  sessions,
  active,
  onSelect,
  onCreate,
  onOpenSheet,
  sheetCount,
}: {
  readonly sessions: readonly PreparationSessionRecord[];
  readonly active: PreparationSessionRecord | null;
  readonly onSelect: (id: string | null) => void;
  readonly onCreate: (input: {
    title: string;
    opponent?: string;
    myColor: 'w' | 'b';
    event?: string;
    round?: string;
    gameDate?: string;
  }) => void;
  readonly onOpenSheet: () => void;
  readonly sheetCount: number;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-9 shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle bg-surface-2 px-2 sm:px-3">
      <Target className="h-3.5 w-3.5 shrink-0 text-accent" />
      <label className="flex min-w-0 items-center gap-1.5 text-[10px] text-tertiary">
        Session
        <select
          aria-label="Preparation session"
          value={active?.id ?? ''}
          onChange={(event) => onSelect(event.target.value || null)}
          className="h-6 max-w-[22ch] rounded-[3px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary outline-none focus:border-accent/60"
        >
          <option value="">No session</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
              {session.opponent ? ` · ${session.opponent}` : ''}
            </option>
          ))}
        </select>
      </label>

      {active ? (
        <>
          {/* The three facts that decide what preparation even means. */}
          <span className="text-[10px] text-secondary tabular">
            I have {active.myColor === 'w' ? 'White' : 'Black'}
            {active.round ? ` · Round ${active.round}` : ''}
            {active.gameDate ? ` · ${active.gameDate}` : ''}
          </span>
          <Button className="ml-auto" onClick={onOpenSheet}>
            Game-day sheet
            <span className="ml-1 text-tertiary tabular">{sheetCount}</span>
          </Button>
        </>
      ) : (
        <span className="text-[10px] text-tertiary">
          Create a session to collect a game-day sheet.
        </span>
      )}

      <Button className={active ? '' : 'ml-auto'} onClick={() => setCreating(true)}>
        New session
      </Button>

      {creating ? (
        <NewSessionDialog
          onClose={() => setCreating(false)}
          onCreate={(input) => {
            onCreate(input);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NewSessionDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (input: {
    title: string;
    opponent?: string;
    myColor: 'w' | 'b';
    event?: string;
    round?: string;
    gameDate?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [opponent, setOpponent] = useState('');
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [event, setEvent] = useState('');
  const [round, setRound] = useState('');
  const [gameDate, setGameDate] = useState('');

  return (
    <Dialog open title="New preparation session" onClose={onClose}>
      <form
        className="flex flex-col gap-3 px-4 py-3"
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!title.trim()) return;
          onCreate({
            title: title.trim(),
            ...(opponent.trim() ? { opponent: opponent.trim() } : {}),
            myColor,
            ...(event.trim() ? { event: event.trim() } : {}),
            ...(round.trim() ? { round: round.trim() } : {}),
            ...(gameDate ? { gameDate } : {}),
          });
        }}
      >
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(change) => setTitle(change.target.value)}
            placeholder="Round 6"
            className={INPUT}
          />
        </Field>
        <Field label="Opponent">
          <input
            value={opponent}
            onChange={(change) => setOpponent(change.target.value)}
            placeholder="Exact name as it appears in your games"
            className={INPUT}
          />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-2xs text-tertiary">My colour</legend>
          <div className="flex gap-3">
            {(['w', 'b'] as const).map((color) => (
              <label key={color} className="flex items-center gap-1.5 text-xs text-primary">
                <input
                  type="radio"
                  name="my-color"
                  checked={myColor === color}
                  onChange={() => setMyColor(color)}
                  className="accent-accent"
                />
                {color === 'w' ? 'White' : 'Black'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Event">
            <input
              value={event}
              onChange={(change) => setEvent(change.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Round">
            <input
              value={round}
              onChange={(change) => setRound(change.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Game date">
            <input
              type="date"
              value={gameDate}
              onChange={(change) => setGameDate(change.target.value)}
              className={INPUT}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={!title.trim()}>
            Create session
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const INPUT =
  'h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60';

const Field = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1 text-2xs text-tertiary">
    {label}
    {children}
  </label>
);
