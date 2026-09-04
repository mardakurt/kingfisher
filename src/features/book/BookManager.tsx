'use client';

/**
 * Settings → Engine → Books.
 *
 * Two things a book list has to make obvious. Which book answers first — books
 * are searched in order and never merged, because averaging two authors'
 * weights produces a number neither of them would recognise. And whether the
 * *engine* is using a book of its own, which is the one place a book can lie
 * to you: an engine playing from its internal book returns a move instantly
 * with no search behind it, and a panel that reports that as an evaluation is
 * reporting a fact that does not exist.
 */

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ArrowDown, ArrowUp, Import, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { addPolyglotBook, listBookRecords, removeBook, updateBook } from '@/book/registry';
import { KINGFISHER_BOOK_ID } from '@/book/kingfisher-book';
import { useUi } from '@/stores/ui-store';

const formatBytes = (value: number): string =>
  value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.round(value / 1e3)} kB`;

export function BookManager() {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const books = useQuery({ queryKey: ['opening-books'], queryFn: listBookRecords, retry: false });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['opening-books'] });
    // A changed book list changes what the Book panel answers.
    void queryClient.invalidateQueries({ queryKey: ['opening-book'] });
  };

  const change = useMutation({
    mutationFn: async (input: { id: string; change: Parameters<typeof updateBook>[1] }) =>
      updateBook(input.id, input.change),
    onSuccess: refresh,
  });

  const add = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = await addPolyglotBook(file.name, bytes);
      notify({
        tone: 'success',
        message: `Added “${record.name}” — ${(record.entries ?? 0).toLocaleString()} positions.`,
      });
      refresh();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That file could not be added.',
        ...(error instanceof Error && 'remedy' in error
          ? { detail: String((error as { remedy?: unknown }).remedy) }
          : {}),
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const list = books.data ?? [];

  const move = (id: string, direction: -1 | 1) => {
    const index = list.findIndex((book) => book.id === id);
    const swap = list[index + direction];
    const current = list[index];
    if (!swap || !current) return;
    change.mutate({ id: current.id, change: { priority: swap.priority } });
    change.mutate({ id: swap.id, change: { priority: current.priority } });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs text-primary">Opening books</h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          A book says what to play; the explorer says what has been played. They are separate panels
          for that reason, and books are searched in order rather than merged — the first one that
          knows the position answers, and the Book panel names it.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {list.map((book, index) => (
          <li
            key={book.id}
            className="flex items-start gap-2.5 rounded-[4px] border border-line bg-surface-inset p-2.5"
            data-book-row={book.id}
          >
            <Toggle
              label={`Use ${book.name}`}
              checked={book.enabled}
              onChange={(value) => change.mutate({ id: book.id, change: { enabled: value } })}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xs text-primary">{book.name}</p>
              <p className="truncate text-[10px] text-tertiary">
                {book.kind === 'kingfisher'
                  ? book.origin
                  : `${(book.entries ?? 0).toLocaleString()} positions · ${formatBytes(book.bytes ?? 0)} · Polyglot`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={`Consult ${book.name} earlier`}
                disabled={index === 0}
                onClick={() => move(book.id, -1)}
                className="rounded-[3px] p-1 text-tertiary hover:bg-surface-2 hover:text-primary disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Consult ${book.name} later`}
                disabled={index === list.length - 1}
                onClick={() => move(book.id, 1)}
                className="rounded-[3px] p-1 text-tertiary hover:bg-surface-2 hover:text-primary disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {book.id === KINGFISHER_BOOK_ID ? null : (
                <Button
                  variant="subtle"
                  icon={<Trash />}
                  aria-label={`Remove ${book.name}`}
                  onClick={async () => {
                    await removeBook(book.id);
                    refresh();
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div>
        <input
          ref={input}
          type="file"
          accept=".bin"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void add(file);
          }}
        />
        <Button icon={<Import />} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading…' : 'Add a Polyglot book'}
        </Button>
        <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
          A standard <code className="font-mono">.bin</code>. The file is checked before it is
          stored — a file that is not a Polyglot book is refused rather than added and left
          answering nothing.
        </p>
      </div>

      <div className="rounded-[4px] border border-line bg-surface-2 p-2.5">
        <p className="flex items-start gap-1.5 text-[10.5px] text-secondary">
          <Warning className="mt-[1px] h-3.5 w-3.5 shrink-0 text-caution" />
          <span>
            <strong className="text-primary">Engines never play from their own book.</strong>{' '}
            Kingfisher sets <code className="font-mono">OwnBook</code> to false on every engine that
            has the option. An engine answering from an internal book returns a move instantly with
            no search behind it, and an evaluation panel that showed that as a score would be
            reporting a number the engine never computed.
          </span>
        </p>
      </div>
    </div>
  );
}
