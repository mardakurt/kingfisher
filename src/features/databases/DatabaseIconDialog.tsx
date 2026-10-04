'use client';

/** Choose a database's icon: a glyph and a colour, or back to the default. */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { CollectionFacts } from '@/database/collections/types';
import { cn } from '@/lib/cn';
import { usePreferences, type DatabaseIconChoice } from '@/stores/preferences-store';

import { DATABASE_COLOURS, DATABASE_GLYPHS, defaultIcon } from './database-appearance';

export function DatabaseIconDialog({
  collection,
  onClose,
}: {
  readonly collection: CollectionFacts | null;
  readonly onClose: () => void;
}) {
  return collection ? (
    <Picker key={collection.id} collection={collection} onClose={onClose} />
  ) : null;
}

function Picker({
  collection,
  onClose,
}: {
  readonly collection: CollectionFacts;
  readonly onClose: () => void;
}) {
  const icons = usePreferences((state) => state.databaseIcons);
  const set = usePreferences((state) => state.set);
  const [choice, setChoice] = useState<DatabaseIconChoice>(
    icons[collection.id] ?? defaultIcon(collection.kind),
  );
  const save = (next: DatabaseIconChoice | null) => {
    const rest = { ...icons };
    delete rest[collection.id];
    set('databaseIcons', next ? { ...rest, [collection.id]: next } : rest);
    onClose();
  };
  const { Icon } = DATABASE_GLYPHS[choice.glyph];
  return (
    <Dialog
      open
      onClose={onClose}
      title="Change icon"
      description={`How “${collection.name}” looks on the Databases grid and in the sidebar.`}
      footer={
        <>
          <Button variant="subtle" onClick={() => save(null)}>
            Use the default
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => save(choice)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex gap-5">
        <span
          aria-hidden
          className={cn(
            'flex size-16 shrink-0 items-center justify-center rounded-[14px] text-white shadow-[var(--shadow-panel)]',
            DATABASE_COLOURS[choice.colour].tile,
          )}
        >
          <Icon className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <div role="radiogroup" aria-label="Glyph" className="grid grid-cols-5 gap-1.5">
            {Object.entries(DATABASE_GLYPHS).map(([id, glyph]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={choice.glyph === id}
                aria-label={glyph.label}
                title={glyph.label}
                onClick={() => setChoice({ ...choice, glyph: id as DatabaseIconChoice['glyph'] })}
                className={cn(
                  'flex h-9 items-center justify-center rounded-[var(--radius-control)] border text-secondary',
                  choice.glyph === id
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-line-subtle hover:bg-surface-2',
                )}
              >
                <glyph.Icon className="h-[18px] w-[18px]" />
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Colour" className="mt-3 flex gap-2">
            {Object.entries(DATABASE_COLOURS).map(([id, colour]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={choice.colour === id}
                aria-label={colour.label}
                title={colour.label}
                onClick={() => setChoice({ ...choice, colour: id as DatabaseIconChoice['colour'] })}
                className={cn(
                  'size-7 rounded-full ring-offset-2 ring-offset-[var(--surface-1)]',
                  colour.tile,
                  choice.colour === id ? 'ring-2 ring-accent' : '',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
