'use client';

/**
 * Measured tendencies, with their rules printed.
 *
 * The definition sits under every row on purpose. A number like "queens
 * exchanged by move 20: 41 of 118" is only checkable if the reader can see what
 * "by move 20" was taken to mean, and a reader who can check a definition can
 * disagree with it — which is the difference between evidence and a verdict.
 *
 * Rows with a denominator of zero are shown as "no games could answer this"
 * rather than as 0%. They are different facts.
 */

import { TENDENCY_VERSION, type TendencyReport } from '@/player/tendencies';

export function TendencyPanel({
  report,
  pending,
}: {
  readonly report: TendencyReport | undefined;
  readonly pending: boolean;
}) {
  if (pending) {
    return <p className="text-sm text-tertiary">Reading the moves of these games…</p>;
  }
  if (!report || report.examined === 0) {
    return <p className="text-sm text-tertiary">No games were available to measure.</p>;
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-primary">Tendencies</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-tertiary">
        Observed in the {report.examined.toLocaleString()} most recent of the selected games. Every
        row is a rule, a count, and the number of games that could answer it — games that ended
        before the question arose are excluded rather than counted as a “no”. Kingfisher does not
        turn these into a description of anybody’s style.
      </p>

      <ul className="mt-4 divide-y divide-line-subtle">
        {report.results.map((row) => {
          const share = row.denominator === 0 ? null : (row.count / row.denominator) * 100;
          return (
            <li key={row.id} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 text-sm text-primary">{row.name}</span>
                {row.denominator === 0 ? (
                  <span className="shrink-0 text-xs text-tertiary">no games could answer this</span>
                ) : (
                  <>
                    <span className="shrink-0 text-sm text-primary tabular">
                      {row.count} of {row.denominator}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-secondary tabular">
                      {share?.toFixed(0)}%
                    </span>
                  </>
                )}
              </div>
              {row.denominator > 0 ? (
                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-inset"
                  aria-hidden
                >
                  <div className="h-full bg-accent" style={{ width: `${share ?? 0}%` }} />
                </div>
              ) : null}
              <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-tertiary">
                {row.definition}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[10px] text-tertiary">
        Definition set {TENDENCY_VERSION}. Changing any rule changes this version, so a figure
        recorded elsewhere can be told apart from one measured under a different definition.
      </p>
    </section>
  );
}
