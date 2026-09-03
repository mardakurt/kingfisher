'use client';

/**
 * The sheet a player actually reads on the morning of the game.
 *
 * Curated, never generated. Dumping the repertoire tree into it would produce
 * a document nobody reads, which is the failure mode this feature exists to
 * avoid: the value of a preparation sheet is entirely in what was left off it.
 *
 * So every card is here because the player put it here, carries their own
 * reason, and can be reordered — because the order is the order it gets read
 * in, twenty minutes before the round.
 */

import { useState } from 'react';

import { Button, IconButton } from '@/components/ui/Button';
import { ChevronDown, ChevronUp, Close } from '@/components/icons';
import { SheetBoard } from './SheetBoard';
import { writeLine } from './sheet-export';
import type { PreparationSessionRecord, PreparationSheetCard } from '@/persistence/domain';

export function GameDaySheet({
  session,
  onOpen,
  onEdit,
  onRemove,
  onMove,
  onPrint,
}: {
  readonly session: PreparationSessionRecord;
  readonly onOpen: (card: PreparationSheetCard) => void;
  readonly onEdit: (
    cardId: string,
    change: Partial<Omit<PreparationSheetCard, 'id' | 'createdAt'>>,
  ) => void;
  readonly onRemove: (cardId: string) => void;
  readonly onMove: (cardId: string, toIndex: number) => void;
  readonly onPrint: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line-subtle px-2.5">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
          Game-day sheet
        </h2>
        <span className="text-2xs text-tertiary tabular">{session.sheet.length}</span>
        <Button className="ml-auto" onClick={onPrint} disabled={session.sheet.length === 0}>
          Print / export
        </Button>
      </header>

      {session.sheet.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-xs font-medium text-secondary">Nothing on the sheet yet.</p>
          <p className="mx-auto mt-1 max-w-[38ch] text-2xs leading-relaxed text-tertiary">
            Add a position from the opening tree, the explorer, a model game or the board. What you
            leave off is what makes the rest worth reading.
          </p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {session.sheet.map((card, index) => (
            <li key={card.id} className="border-b border-line-subtle px-2.5 py-2">
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpen(card)}
                  className="shrink-0 rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={`Open position ${index + 1}`}
                >
                  <SheetBoard fen={card.fen} className="w-16" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-primary">
                    {card.line.length > 0 ? writeLine(card.line) : 'Position'}
                  </p>
                  {card.why ? (
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-secondary">
                      {card.why}
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-tertiary">
                    {card.intendedSan ? (
                      <span className="text-accent">Play {card.intendedSan}</span>
                    ) : null}
                    {card.source ? <span>from {card.source.replace('-', ' ')}</span> : null}
                  </p>
                  {card.note ? (
                    <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">{card.note}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconButton
                    label="Move up"
                    disabled={index === 0}
                    onClick={() => onMove(card.id, index - 1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === session.sheet.length - 1}
                    onClick={() => onMove(card.id, index + 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Remove from sheet" onClick={() => onRemove(card.id)}>
                    <Close className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>

              {editing === card.id ? (
                <CardEditor
                  card={card}
                  onDone={(change) => {
                    onEdit(card.id, change);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <Button className="mt-1.5" onClick={() => setEditing(card.id)}>
                  Edit note
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CardEditor({
  card,
  onDone,
  onCancel,
}: {
  readonly card: PreparationSheetCard;
  readonly onDone: (change: Partial<Omit<PreparationSheetCard, 'id' | 'createdAt'>>) => void;
  readonly onCancel: () => void;
}) {
  const [why, setWhy] = useState(card.why ?? '');
  const [note, setNote] = useState(card.note ?? '');

  return (
    <form
      className="mt-1.5 flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onDone({ why: why.trim() || undefined, note: note.trim() || undefined });
      }}
    >
      <label className="text-[10px] text-tertiary">
        Why it matters
        <input
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          className="mt-0.5 h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
        />
      </label>
      <label className="text-[10px] text-tertiary">
        Note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="mt-0.5 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2 py-1 text-[11px] leading-relaxed text-primary outline-none focus:border-accent/60"
        />
      </label>
      <div className="flex gap-1.5">
        <Button type="submit" variant="accent">
          Save
        </Button>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
