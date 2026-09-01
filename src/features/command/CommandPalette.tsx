'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Search } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

import { useCommands, type Command } from './useCommands';

/**
 * Command palette.
 *
 * Ranking is subsequence matching with a bonus for prefix hits — enough to make
 * "cpgn" find "Copy PGN" without pulling in a fuzzy-search dependency for
 * twenty entries.
 */
export function CommandPalette() {
  const open = useUi((state) => state.commandPaletteOpen);
  // Mounting the palette only while it is open means its query and selection
  // start fresh by construction, with no state to reset.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const setOpen = useUi((state) => state.setCommandPaletteOpen);
  const commands = useCommands();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => rank(commands, query), [commands, query]);
  const selected = Math.min(index, Math.max(0, matches.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeys);
    return () => document.removeEventListener('keydown', handleDialogKeys);
  }, [setOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    void command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-3 pt-[7dvh] animate-fade-in sm:p-4 sm:pt-[14vh]"
      onPointerDown={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Command palette"
        className="max-h-[calc(100dvh-2rem)] w-[540px] max-w-full overflow-hidden rounded-[6px] border border-line-strong bg-surface-1 shadow-2xl animate-rise sm:max-w-[92vw]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line-subtle px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIndex(Math.min(selected + 1, matches.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIndex(Math.max(selected - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(matches[selected]);
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder="Type a command…"
            className="h-11 w-full bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
          />
        </div>

        <div ref={listRef} className="max-h-[min(46vh,calc(100dvh-8rem))] overflow-y-auto py-1">
          {matches.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-tertiary">No matching command.</p>
          ) : (
            matches.map((command, position) => (
              <button
                key={command.id}
                type="button"
                data-active={position === selected}
                onPointerEnter={() => setIndex(position)}
                onClick={() => run(command)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs',
                  position === selected ? 'bg-surface-3 text-primary' : 'text-secondary',
                )}
              >
                <span className="w-[74px] shrink-0 text-2xs uppercase tracking-wide text-tertiary">
                  {command.group}
                </span>
                <span className="min-w-0 flex-1 truncate">{command.title}</span>
                {command.shortcut && (
                  <kbd className="shrink-0 rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                    {command.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function rank(commands: readonly Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...commands];

  const scored: { command: Command; score: number }[] = [];

  for (const command of commands) {
    const haystack = `${command.title} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
    const score = subsequenceScore(haystack, needle);
    if (score > 0) scored.push({ command, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.command);
}

function subsequenceScore(haystack: string, needle: string): number {
  let score = 0;
  let cursor = 0;

  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return 0;
    // Matching at a word boundary is a much stronger signal than mid-word.
    score += found === cursor ? 3 : haystack[found - 1] === ' ' ? 2 : 1;
    cursor = found + 1;
  }
  return score;
}
