'use client';

/**
 * What a named variation actually is, in three sentences.
 *
 * The panel beside this one says a position is the "Sicilian Defense: Najdorf
 * Variation, English Attack" and then shows how often each move scored. Both
 * are useless to a reader who does not already know what an English Attack is,
 * and that reader is most of the people an opening explorer is for.
 *
 * Two kinds of statement appear here and they are kept visibly apart:
 *
 *  - the **defining line**, which is the vendored CC0 dataset's own shortest
 *    sequence to the position, replayed through this application's rules code
 *    at build time — nobody typed it;
 *  - the **brief**, three authored sentences from `src/theory/variation-briefs`
 *    saying what each side is playing for.
 *
 * Nothing is generated while the user reads. A variation with no brief says so
 * rather than inventing one, which is still worth having next to the moves.
 *
 * One component, two densities. The explorer panel is a 300-pixel column and
 * the opening library is a full page; writing this twice would be two places
 * for the provenance wording to drift apart, which is the one thing it must
 * not do.
 */

import { useState } from 'react';

import { usePreferences } from '@/stores/preferences-store';
import { briefForLineage } from '@/theory/variation-briefs';

type Density = 'compact' | 'comfortable';

interface Props {
  /** Family first, e.g. `['Sicilian Defense', 'Najdorf Variation']`. */
  readonly lineage: readonly string[];
  /** The dataset's shortest line to the classified position, in SAN. */
  readonly definingLine?: string | null;
  /**
   * True when the classified position is behind the one on the board.
   *
   * The brief then describes the variation the player is in rather than the
   * position they are looking at, and saying so is the difference between
   * useful and misleading.
   */
  readonly behind?: boolean;
  readonly density?: Density;
}

const TEXT: Record<Density, { body: string; label: string; note: string; title: string }> = {
  compact: {
    body: 'text-[10.5px] leading-relaxed',
    label: 'text-[10px] uppercase tracking-wide text-tertiary',
    note: 'text-[9.5px] leading-relaxed text-tertiary',
    title: 'text-[11px] text-primary',
  },
  comfortable: {
    body: 'text-xs leading-relaxed',
    label: 'text-[11px] uppercase tracking-wide text-tertiary',
    note: 'text-[11px] leading-relaxed text-tertiary',
    title: 'text-sm text-primary',
  },
};

/** SAN tokens with move numbers put back, the way a player reads a line. */
function numbered(san: string): string {
  const tokens = san.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (i % 2 === 0) out.push(`${i / 2 + 1}.`);
    out.push(tokens[i] as string);
  }
  return out.join(' ');
}

export function VariationBriefPanel({
  lineage,
  definingLine,
  behind = false,
  density = 'compact',
}: Props) {
  const show = usePreferences((state) => state.showVariationBrief);
  const setPreference = usePreferences((state) => state.set);
  const [why, setWhy] = useState(false);

  const resolved = briefForLineage(lineage);
  if (lineage.length === 0) return null;

  const style = TEXT[density];
  const title = resolved ? resolved.matched.join(' → ') : lineage.join(' → ');
  const describes = resolved?.matched[resolved.matched.length - 1];

  return (
    <section
      className={
        density === 'compact'
          ? 'border-t border-line-subtle bg-surface-2/40 px-2.5 py-2'
          : 'mt-5 border-t border-line-subtle pt-3'
      }
      data-testid="variation-brief"
      data-brief-matched={resolved ? resolved.matched.join(' > ') : 'none'}
    >
      <div className="flex items-baseline gap-2">
        <h3 className={style.label}>About this variation</h3>
        <button
          type="button"
          onClick={() => setPreference('showVariationBrief', !show)}
          className="ml-auto shrink-0 text-[10px] text-accent underline-offset-2 hover:underline"
          aria-expanded={show}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>

      {show ? (
        <div className="mt-1.5 space-y-1.5">
          <p className={style.title}>{title}</p>

          {definingLine ? (
            <p
              className={`font-mono text-secondary ${density === 'compact' ? 'text-[10px]' : 'text-xs'} leading-relaxed`}
              data-testid="variation-brief-line"
            >
              {numbered(definingLine)}
            </p>
          ) : null}

          {resolved ? (
            <>
              <p className={`${style.body} text-secondary`}>{resolved.brief.defining}</p>
              <dl className={`space-y-1 ${style.body}`}>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-tertiary">White</dt>
                  <dd className="text-secondary">{resolved.brief.white}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-tertiary">Black</dt>
                  <dd className="text-secondary">{resolved.brief.black}</dd>
                </div>
              </dl>

              {/*
                Provenance, every time. A reader has to be able to tell the
                dataset's move list from Kingfisher's prose without asking, and
                an explanation that does not say where it came from is exactly
                the kind of confident text this project refuses to produce.
              */}
              <p className={style.note} data-testid="variation-brief-provenance">
                {resolved.inherited || behind
                  ? `Describes ${describes}, the last named variation on this line. `
                  : ''}
                Kingfisher summary; the line above is the opening dataset&rsquo;s own.{' '}
                {why ? (
                  <>
                    Briefs state only what defines a variation and what each side plays for — the
                    parts every reference agrees on. Evaluations and best-move claims are left to
                    the engine and the statistics beside them, which can be checked.
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWhy(true)}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    Why so short?
                  </button>
                )}
              </p>
            </>
          ) : (
            <p className={`${style.body} text-tertiary`} data-testid="variation-brief-missing">
              No brief has been written for this variation. The line above comes from the opening
              dataset; the statistics are the evidence.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
