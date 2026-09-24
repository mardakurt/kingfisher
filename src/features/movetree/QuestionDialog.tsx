'use client';

/**
 * Asking a move as a question: the prompt, and optionally what finding it is
 * worth and how long the student has — ChessBase's training annotation
 * carries both (Phase 85). Blank means none: no score is invented and no
 * clock runs.
 */

import { useState } from 'react';

import { DEFAULT_QUESTION_PROMPT, type QuestionSettings } from '@/chess/tree/questions';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** A whole number of at least one, or undefined for a blank field; NaN for anything else. */
function whole(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 ? Number(trimmed) : Number.NaN;
}

export function QuestionDialog({
  san,
  initialPrompt,
  initialPoints,
  initialSeconds,
  editing,
  onSubmit,
  onCancel,
}: {
  readonly san: string;
  readonly initialPrompt: string;
  readonly initialPoints?: number;
  readonly initialSeconds?: number;
  readonly editing: boolean;
  readonly onSubmit: (prompt: string, settings: QuestionSettings) => void;
  readonly onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt || DEFAULT_QUESTION_PROMPT);
  const [points, setPoints] = useState(initialPoints ? String(initialPoints) : '');
  const [seconds, setSeconds] = useState(initialSeconds ? String(initialSeconds) : '');
  const parsedPoints = whole(points);
  const parsedSeconds = whole(seconds);
  const invalid =
    !prompt.trim() || Number.isNaN(parsedPoints ?? 0) || Number.isNaN(parsedSeconds ?? 0);

  const submit = () => {
    if (invalid) return;
    onSubmit(prompt.trim(), {
      ...(parsedPoints !== undefined ? { points: parsedPoints } : {}),
      ...(parsedSeconds !== undefined ? { seconds: parsedSeconds } : {}),
    });
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title={editing ? `The question at ${san}` : `Ask ${san} as a question`}
      description="When the chapter is solved, the board stops before this move and asks for it. The move is the answer; a sibling you marked ! or !! is accepted too."
      width="w-[460px]"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="accent" disabled={invalid} onClick={submit} data-question-save>
            {editing ? 'Save' : 'Ask it'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-xs text-secondary">
          Question
          <input
            className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            autoFocus
          />
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-xs text-secondary">
            Points (optional)
            <input
              className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
              inputMode="numeric"
              placeholder="none"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
          </label>
          <label className="block flex-1 text-xs text-secondary">
            Time limit in seconds (optional)
            <input
              className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
              inputMode="numeric"
              placeholder="untimed"
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
        </div>
        {Number.isNaN(parsedPoints ?? 0) || Number.isNaN(parsedSeconds ?? 0) ? (
          <p className="text-xs text-negative" role="alert">
            Points and the time limit are whole numbers of at least one, or blank.
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
