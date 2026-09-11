'use client';

/**
 * The strategic transitions panel inside a critical review card.
 *
 * Phase 43: Phase 41 computed these transitions in `game-review.ts` for the
 * live review session, but never stored them on the review item, so a
 * player returning later saw a critical moment with no narrative about why
 * it mattered structurally. The transitions are now stored on the item;
 * this component is the surface that shows them.
 *
 * The vocabulary is deliberately narrow. Each row is one factual statement
 * — "Black creates a protected passed pawn on the d-file" — derived from
 * the same deterministic `featureTransitions` module the live review uses,
 * so the live reading and the persisted reading cannot drift apart. The
 * hierarchy in the parent CriticalInbox keeps tactical evidence (engine
 * changes, tablebase truth) ahead of strategic context, but this panel
 * is the place to look when "what changed structurally" is the actual
 * question.
 */
import type { FeatureTransition } from '@/chess/feature-transitions';

export function StrategicContextCard({
  transitions,
}: {
  readonly transitions: readonly FeatureTransition[];
}) {
  /*
    An empty list is a legitimate state — most moves change nothing worth
    surfacing — and is the explicit "show nothing" case. A heading with no
    rows would lie about the position.
  */
  if (transitions.length === 0) return null;

  return (
    <section
      className="border-t border-line-subtle bg-surface-2/40 px-3 py-2"
      data-strategic-context
    >
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        Strategic context
      </h4>
      <ul className="mt-1 space-y-1">
        {transitions.map((transition) => (
          <li
            key={transition.id}
            className="flex items-baseline gap-2 text-[11px] leading-relaxed text-secondary"
            data-strategic-transition={transition.kind}
          >
            <span
              aria-hidden
              className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
            <span>{transition.statement}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
