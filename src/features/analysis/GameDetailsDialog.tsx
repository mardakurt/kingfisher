'use client';

/**
 * The game's details — players, event, date, result — edited where the game
 * is analysed.
 *
 * ChessBase's "game data" dialog. Kingfisher could edit these headers only
 * on the Scoresheet, so a misspelled name or a missing date in an imported
 * game could not be fixed on the board where the game was being annotated,
 * and every search, explorer filter and preparation report read the wrong
 * value. One Save is one undoable edit; an emptied field is removed rather
 * than written as an empty tag, and a game's other tags are kept as they are.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAnalysis } from '@/stores/analysis-store';

/** The Seven Tag Roster, then the tags a database most often reads. */
export const GAME_DETAIL_FIELDS = [
  { key: 'White', label: 'White' },
  { key: 'WhiteElo', label: 'White rating' },
  { key: 'Black', label: 'Black' },
  { key: 'BlackElo', label: 'Black rating' },
  { key: 'Event', label: 'Event' },
  { key: 'Site', label: 'Site' },
  { key: 'Date', label: 'Date', placeholder: 'YYYY.MM.DD' },
  { key: 'Round', label: 'Round' },
  { key: 'ECO', label: 'ECO' },
  { key: 'Annotator', label: 'Annotator' },
] as const;

const RESULTS = ['*', '1-0', '0-1', '1/2-1/2'] as const;

/** A PGN date: YYYY.MM.DD, with "??" for what is not known. */
const DATE = /^(\d{4}|\?{4})\.(\d{2}|\?{2})\.(\d{2}|\?{2})$/;
const RATING = /^\d{1,4}$/;

export function GameDetailsDialog({ onClose }: { readonly onClose: () => void }) {
  const headers = useAnalysis((state) => state.tree.headers);
  const setHeaderValues = useAnalysis((state) => state.setHeaderValues);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(GAME_DETAIL_FIELDS.map((field) => [field.key, headers[field.key] ?? ''])),
    Result: headers.Result ?? '*',
  }));

  const problems: string[] = [];
  const date = values.Date?.trim() ?? '';
  if (date && !DATE.test(date))
    problems.push('Date is written YYYY.MM.DD, with ?? for what is not known.');
  for (const key of ['WhiteElo', 'BlackElo'] as const) {
    const rating = values[key]?.trim() ?? '';
    if (rating && !RATING.test(rating))
      problems.push(`${key === 'WhiteElo' ? 'White' : 'Black'} rating is a number.`);
  }

  const save = () => {
    const changes: Record<string, string | null> = {};
    for (const [key, raw] of Object.entries(values)) {
      const value = raw.trim();
      const before = headers[key] ?? '';
      if (value === before) continue;
      changes[key] = value === '' ? null : value;
    }
    if (Object.keys(changes).length > 0) setHeaderValues(changes);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Game details"
      description="The game's players, event and result, as its PGN records them. Saved as one change you can undo."
      width="w-[560px]"
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save} disabled={problems.length > 0}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2" data-game-details>
        {GAME_DETAIL_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-[11.5px] text-secondary">
            {field.label}
            <input
              value={values[field.key] ?? ''}
              placeholder={'placeholder' in field ? field.placeholder : undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="h-8 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-[13px] text-primary"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[11.5px] text-secondary">
          Result
          <select
            value={values.Result}
            onChange={(event) =>
              setValues((current) => ({ ...current, Result: event.target.value }))
            }
            className="h-8 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-[13px] text-primary"
          >
            {RESULTS.map((result) => (
              <option key={result} value={result}>
                {result === '*' ? 'Not finished (*)' : result}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problems.length > 0 ? (
        <ul className="mt-3 text-[12px] text-negative" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}
