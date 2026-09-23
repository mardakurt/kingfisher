'use client';

/**
 * The opponent search box, with the player library behind it.
 *
 * Typing "Carl" offers Carlsen, with his title and how many games the
 * installed sources hold — the same catalog the Players route searches, so a
 * player who can be found there can be found here. The box used to match
 * exact spellings against the local collection only, which for a new user was
 * an empty box that found nobody, however famous.
 *
 * Choosing a suggestion submits with the catalog row, so the report can read
 * the packs under the identity they file the player by. Pressing Enter with a
 * free-typed name still works: it is how an unlisted club opponent is prepared
 * for, from imported games.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { Search } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { searchPlayers, usePlayerCatalog, type CatalogPlayer } from '@/reference/players';

export interface OpponentChoice {
  readonly name: string;
  readonly player: CatalogPlayer | null;
}

export function OpponentSearch({
  value,
  onChange,
  onSubmit,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (choice: OpponentChoice) => void;
}) {
  const catalog = usePlayerCatalog();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const typed = value.trim();
    if (typed.length < 2 || !catalog.data) return [];
    return searchPlayers(catalog.data, { query: typed, filter: 'all', limit: 8 });
  }, [catalog.data, value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const choose = (choice: OpponentChoice) => {
    setOpen(false);
    onChange(choice.name);
    onSubmit(choice);
  };

  return (
    <form
      ref={root as never}
      className="relative flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = value.trim();
        if (!typed) return;
        const highlighted = open ? suggestions[active] : undefined;
        choose(
          highlighted
            ? { name: highlighted.name, player: highlighted }
            : {
                name: typed,
                player:
                  suggestions.find((entry) => entry.name.toLowerCase() === typed.toLowerCase()) ??
                  null,
              },
        );
      }}
      data-opponent-search
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" />
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open || suggestions.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => (index + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-label="Player name"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="opponent-suggestions"
          aria-autocomplete="list"
          placeholder="Opponent's name…"
          className="h-8 w-full rounded-[6px] border border-line bg-surface-inset pr-2 pl-8 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
        />
        {open && suggestions.length > 0 ? (
          <ul
            id="opponent-suggestions"
            role="listbox"
            className="absolute top-full left-0 z-30 mt-1 w-full min-w-[320px] overflow-hidden rounded-[7px] border border-line bg-surface-1 py-1 shadow-lg"
          >
            {suggestions.map((player, index) => (
              <li
                key={player.key}
                role="option"
                aria-selected={index === active}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose({ name: player.name, player });
                }}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs',
                  index === active ? 'bg-surface-2 text-primary' : 'text-secondary',
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {player.title ? (
                    <span className="mr-1.5 text-[10px] font-medium text-accent">
                      {player.title}
                    </span>
                  ) : null}
                  {player.name}
                  {player.titled?.citizenship ? (
                    <span className="ml-1.5 text-[10px] text-tertiary">
                      {player.titled.citizenship}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[10px] text-tertiary tabular">
                  {player.games > 0
                    ? `${player.games.toLocaleString()} reference ${player.games === 1 ? 'game' : 'games'}`
                    : 'no reference games'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button variant="accent" type="submit" disabled={!value.trim()}>
        Prepare
      </Button>
    </form>
  );
}
