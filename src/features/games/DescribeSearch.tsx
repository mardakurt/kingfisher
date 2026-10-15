'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { GameQuery } from '@/database/query/ast';
import { parseNaturalQuery } from '@/database/query/natural';

const EXAMPLES = [
  'Carlsen as Black in the Najdorf since 2018',
  'rook endgames by Rubinstein',
  'Kasparov vs Karpov, Grünfeld, draws',
  'IQP positions in the Tarrasch, both players over 2600',
];

/**
 * Describe the games in a sentence; see exactly what it will search for
 * before it runs; apply it to the ordinary filters, where every condition
 * can be checked and changed. Nothing is guessed: words the parser does not
 * know are listed, and a phrase it cannot express exactly stops the search.
 */
export function DescribeSearch({
  onApply,
  onClose,
}: {
  readonly onApply: (query: GameQuery) => void;
  readonly onClose: () => void;
}) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseNaturalQuery(text) : null), [text]);
  const ready = parsed?.query !== null && parsed?.query !== undefined;

  const apply = () => {
    if (!parsed?.query) return;
    onApply(parsed.query);
    onClose();
  };

  return (
    <section
      className="mx-3 mb-2 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-3 sm:mx-4"
      aria-label="Describe a search"
      data-describe-search
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
          placeholder={`Describe the games — e.g. “${EXAMPLES[0]}”`}
          aria-label="Describe the games to find"
          className="h-9 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-line bg-surface-0 px-3 text-sm text-primary outline-none placeholder:text-tertiary focus:border-accent"
        />
        <Button type="submit" variant="accent" disabled={!ready}>
          Search
        </Button>
        <Button onClick={onClose}>Close</Button>
      </form>

      <div className="mt-2.5 min-h-6 text-xs" aria-live="polite">
        {!parsed ? (
          <p className="text-tertiary">
            Try{' '}
            {EXAMPLES.slice(1).map((example, index) => (
              <span key={example}>
                {index > 0 ? ', ' : ''}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => setText(example)}
                >
                  {example}
                </button>
              </span>
            ))}
            . Players, colours, results, openings, ECO, years, ratings, time controls, structures
            and annotations are understood.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {parsed.parts.length > 0 ? (
              <span className="text-tertiary">Will search for</span>
            ) : (
              <span className="text-tertiary">Nothing understood yet.</span>
            )}
            {parsed.parts.map((part) => (
              <span
                key={`${part.label}:${part.value}`}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-primary"
                data-describe-part={part.label}
              >
                <span className="text-tertiary">{part.label}</span>
                {part.value}
              </span>
            ))}
            {parsed.unparsed.length > 0 && (
              <span className="text-caution" data-describe-unparsed>
                Not understood: {parsed.unparsed.map((word) => `“${word}”`).join(', ')}
              </span>
            )}
            {parsed.refusals.map((refusal) => (
              <span key={refusal} className="w-full text-negative" role="alert">
                {refusal}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
