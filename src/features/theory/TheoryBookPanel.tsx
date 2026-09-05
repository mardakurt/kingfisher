'use client';

/**
 * The Theory Book: what the branches of this opening are, and where they go.
 *
 * Four different questions get asked about a position and Kingfisher keeps
 * them apart on purpose, because conflating them is how a statistic becomes
 * mistaken for theory:
 *
 *   **Theory Book** — what are the established, named branches here?
 *   **Explorer**    — what has actually been played, in a population you name?
 *   **Book Moves**  — what does a Polyglot book weight here?
 *   **Repertoire**  — what do *you* intend to play?
 *
 * This panel answers the first and only the first. It shows no counts, no
 * percentages and no evaluation: a move appears because the CC0 classification
 * dataset gives the position after it a name, which is the one claim this
 * panel is entitled to make. Anything a player would want to know about
 * frequency is the Explorer's job, one tab away, and it labels its numbers
 * with the source they came from.
 *
 * The other half of its job is being useful past the point where the dataset
 * stops naming things. Twenty plies into a Najdorf nothing is named, and the
 * honest answer is not "nothing found" — it is "Najdorf, English Attack, five
 * moves further on", with the branches that were available at that point.
 */

import { useEffect, useState } from 'react';

import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { nodePath } from '@/chess/tree/tree';
import { cn } from '@/lib/cn';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import {
  loadTheoryBook,
  THEORY_BOOK_PROVENANCE,
  type TheoryBook,
  type TheoryBookNode,
} from '@/theory/theory-book';

/** Moves in `1.e4 c5 2.Nf3` form. */
export function numberedFrom(moves: readonly string[], startPly: number): string {
  const parts: string[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    const ply = startPly + index;
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}.${moves[index]}`);
    else if (index === 0) parts.push(`${(ply - 1) / 2 + 1}...${moves[index]}`);
    else parts.push(moves[index] as string);
  }
  return parts.join(' ');
}

export function TheoryBookPanel() {
  const { tree, currentId } = useChessWorkspace();
  const loadPgn = useAnalysis((state) => state.loadPgn);
  const toEnd = useAnalysis((state) => state.toEnd);
  const notify = useUi((state) => state.notify);
  const showBrief = usePreferences((state) => state.showVariationBrief);
  const [book, setBook] = useState<TheoryBook | null>(null);

  useEffect(() => {
    let live = true;
    void loadTheoryBook().then(
      (loaded) => {
        if (live) setBook(loaded);
      },
      () => {
        /* A failed chunk load leaves the panel empty; nothing else depends on it. */
      },
    );
    return () => {
      live = false;
    };
  }, []);

  /*
    The line actually played to get here, which is what locates a position the
    dataset does not name. A canonical position key deliberately cannot find
    its own ancestors — that is what makes transpositions converge — so the
    moves are how a reader deep in a line is placed.
  */
  const line: string[] = [];
  for (const id of nodePath(tree, currentId)) {
    const node = tree.nodes[id];
    if (node?.move?.san) line.push(node.move.san);
  }

  const match = book?.deepest(line) ?? null;

  const openLine = (moves: readonly string[]) => {
    /*
      Through the PGN parser rather than by pushing moves into the tree, so a
      line the book offers is validated by exactly the code that validates an
      imported game. The library does the same.
    */
    const result = loadPgn(`${numberedFrom(moves, 0)} *`);
    if (!result.ok) {
      notify({ tone: 'error', message: result.error.message });
      return;
    }
    /*
      And then to the end of it. Loading a game leaves the board on the starting
      position, which is right for opening a document and wrong here: somebody
      who clicked "English Attack" asked to be *in* the English Attack, not to
      be handed the moves to it.
    */
    toEnd();
  };

  if (!book) {
    return (
      <div className="flex min-h-0 flex-col">
        <PanelHeader>Theory Book</PanelHeader>
        <PanelBody>
          <p className="text-xs text-tertiary">Loading the opening library…</p>
        </PanelBody>
      </div>
    );
  }

  /*
    At the start of a game there is nothing to be deep in, and the useful thing
    is the top of the book: the openings themselves, to be browsed into. A
    player who wants to look at the Najdorf should not have to play 1.e4 c5
    before the book will talk to them.
  */
  if (line.length === 0) {
    return (
      <div className="flex min-h-0 flex-col" data-theory-book="roots">
        <PanelHeader>Theory Book</PanelHeader>
        <PanelBody>
          <p className="text-2xs leading-relaxed text-tertiary">
            {book.size.toLocaleString()} named positions. Open one to see its branches, or play into
            a line on the board.
          </p>
          <ul className="mt-2" data-book-branches={book.roots.length}>
            {book.roots.map((root) => (
              <li key={root.key} className="border-b border-line-subtle last:border-0">
                <button
                  type="button"
                  onClick={() => openLine(root.moves)}
                  className="flex w-full items-baseline gap-2 py-1.5 text-left hover:bg-surface-2"
                  data-book-branch
                >
                  <span className="font-mono text-2xs text-accent">
                    {numberedFrom(root.moves, 0)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-secondary">
                    {root.label}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-tertiary">{root.eco}</span>
                </button>
              </li>
            ))}
          </ul>
          <Provenance />
        </PanelBody>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex min-h-0 flex-col" data-theory-book="unnamed">
        <PanelHeader>Theory Book</PanelHeader>
        <PanelBody>
          <EmptyState
            title="Not a named opening"
            description="Nothing on this line reaches a position the classification dataset names. The Explorer can still say what has been played here."
          />
          <Provenance />
        </PanelBody>
      </div>
    );
  }

  const { node, beyond } = match;
  const crumbs = book.crumbs(node.key);
  const branches = book.children(node.key);
  const variations = book.variations(node.key);
  const brief = book.brief(node.key);
  /*
    Which list leads, decided by the data rather than by a rule about depth.
    At 1.e4 the "variations of the King's Pawn Game" are a handful of minor
    lines while the *moves* are the Sicilian, the French and the Caro-Kann; at
    the Sicilian it is the other way round. Comparing how much theory sits under
    each list's best entry gets both right without special-casing either.
  */
  const sections: readonly ('variations' | 'moves')[] =
    variations.length > 0 && (variations[0]?.namedBelow ?? 0) >= (branches[0]?.namedBelow ?? 0)
      ? ['variations', 'moves']
      : ['moves', 'variations'];

  return (
    <div className="flex min-h-0 flex-col" data-theory-book="located">
      <PanelHeader actions={<span className="font-mono text-2xs text-tertiary">{node.eco}</span>}>
        Theory Book
      </PanelHeader>
      <PanelBody>
        {/* Where the reader is, family first, each step clickable. */}
        <nav className="flex flex-wrap items-center gap-x-1 gap-y-0.5" data-book-crumbs>
          {crumbs.map((crumb, index) => (
            <span key={crumb.key} className="flex items-center gap-1">
              {index > 0 ? <span className="text-tertiary">›</span> : null}
              <button
                type="button"
                onClick={() => openLine(crumb.moves)}
                className={cn(
                  'rounded-[3px] px-1 py-0.5 text-xs hover:bg-surface-2',
                  index === crumbs.length - 1 ? 'font-semibold text-primary' : 'text-secondary',
                )}
              >
                {index === 0 ? crumb.label : (crumb.lineage.at(-1) ?? crumb.label)}
              </button>
            </span>
          ))}
        </nav>

        {/*
          The one thing this panel must never do is let a name be read as a
          description of the position on the board. Five plies past the last
          named position, it says so.
        */}
        {beyond > 0 ? (
          <p className="mt-2 text-2xs text-tertiary" data-book-beyond={beyond}>
            The dataset names nothing past move {Math.ceil(match.ply / 2)}. You are {beyond}{' '}
            {beyond === 1 ? 'ply' : 'plies'} further on; the name above describes the variation, not
            this position.
          </p>
        ) : null}

        {node.aliases.length > 0 ? (
          <p className="mt-2 text-2xs text-tertiary">
            Also called: {node.aliases.slice(0, 4).join(', ')}
          </p>
        ) : null}

        {showBrief && brief ? (
          <section className="mt-3 border-t border-line-subtle pt-2">
            <p className="text-xs leading-relaxed text-secondary">{brief.brief.defining}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-2xs">
              <dt className="text-tertiary">White</dt>
              <dd className="text-secondary">{brief.brief.white}</dd>
              <dt className="text-tertiary">Black</dt>
              <dd className="text-secondary">{brief.brief.black}</dd>
            </dl>
            {brief.inherited ? (
              <p className="mt-1.5 text-2xs text-tertiary">
                Describes {brief.matched.at(-1)}, the nearest variation with a written explanation.
              </p>
            ) : null}
          </section>
        ) : null}

        {/*
          Two lists, because they answer two questions. "Variations" is how a
          book is indexed — the Najdorf is under the Sicilian, four moves down
          and past three positions the dataset also calls "Sicilian Defense".
          "Next moves" is the move tree, which is what you want when you are at
          the board rather than looking something up.
        */}
        {sections.map((section) =>
          section === 'variations' ? (
            variations.length === 0 ? null : (
              <BranchList
                key="variations"
                title="Variations"
                nodes={variations}
                from={node}
                onOpen={openLine}
                showMoves={false}
              />
            )
          ) : (
            <BranchList
              key="moves"
              title="Next moves"
              nodes={branches}
              from={node}
              onOpen={openLine}
              showMoves
              empty="The dataset names nothing below this. That is a statement about the classification, not about the position — the Explorer can still say what has been played."
            />
          ),
        )}

        <Provenance />
      </PanelBody>
    </div>
  );
}

/** Enough to see the shape of an opening; the rest is behind one click. */
const VISIBLE = 12;

/**
 * One list of book entries, either variations or next moves.
 *
 * Long lists are truncated rather than scrolled away from: the Sicilian has
 * eighty-two named variations and a panel that showed all of them would bury
 * the eight a player has heard of.
 */
function BranchList({
  title,
  nodes,
  from,
  onOpen,
  showMoves,
  empty,
}: {
  readonly title: string;
  readonly nodes: readonly TheoryBookNode[];
  readonly from: TheoryBookNode;
  readonly onOpen: (moves: readonly string[]) => void;
  readonly showMoves: boolean;
  readonly empty?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? nodes : nodes.slice(0, VISIBLE);

  return (
    <section className="mt-3 border-t border-line-subtle pt-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        {nodes.length === 0 ? title : `${title} (${nodes.length})`}
      </h3>
      {nodes.length === 0 ? (
        empty ? (
          <p className="mt-1.5 text-2xs leading-relaxed text-tertiary">{empty}</p>
        ) : null
      ) : (
        <>
          <ul className="mt-1.5" data-book-branches={nodes.length}>
            {shown.map((branch) => (
              <li key={branch.key} className="border-b border-line-subtle last:border-0">
                <button
                  type="button"
                  onClick={() => onOpen(branch.moves)}
                  className="flex w-full items-baseline gap-2 py-1.5 text-left hover:bg-surface-2"
                  data-book-branch
                >
                  <span className="shrink-0 font-mono text-2xs text-accent">
                    {showMoves
                      ? numberedFrom(branch.definingMoves, from.plies)
                      : `${branch.plies > from.plies ? `+${branch.plies - from.plies}` : ''}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-secondary">
                    {branchName(from, branch)}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-tertiary">{branch.eco}</span>
                </button>
              </li>
            ))}
          </ul>
          {nodes.length > VISIBLE ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-2xs text-tertiary hover:text-secondary"
            >
              {expanded ? 'Show fewer' : `Show all ${nodes.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * What to call a branch, given where the reader already is.
 *
 * Repeating "Sicilian Defense: Najdorf Variation, " in front of every one of
 * ten branches is nine-tenths noise. The parent's label is a prefix of the
 * child's whenever the dataset nests them, so it is dropped.
 */
function branchName(parent: TheoryBookNode, branch: TheoryBookNode): string {
  if (branch.label === parent.label) return branch.label;
  if (branch.label.startsWith(`${parent.label}, `)) {
    return branch.label.slice(parent.label.length + 2);
  }
  if (branch.label.startsWith(`${parent.label}: `)) {
    return branch.label.slice(parent.label.length + 2);
  }
  return branch.lineage.at(-1) ?? branch.label;
}

/** Every claim in this panel comes from one dataset. It says which. */
function Provenance() {
  return (
    <p className="mt-3 border-t border-line-subtle pt-2 text-2xs leading-relaxed text-tertiary">
      Opening names and lines from{' '}
      <a
        href={THEORY_BOOK_PROVENANCE.url}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-secondary"
      >
        {THEORY_BOOK_PROVENANCE.dataset}
      </a>{' '}
      ({THEORY_BOOK_PROVENANCE.licence}). Explanations are written by Kingfisher. No counts,
      evaluations or engine output appear on this panel.
    </p>
  );
}
