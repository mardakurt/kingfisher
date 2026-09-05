/**
 * The Kingfisher Theory Book.
 *
 * The opening index answers "what is this position called". The catalog
 * answers "what openings are there". Neither answers the question a player
 * actually opens a book to ask: **what are the branches of this opening, and
 * where do they go?**
 *
 * A player who wants to look at the English Attack should not have to know and
 * play out `1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3` first. They
 * should be able to open the Sicilian, see the Najdorf under it, see the
 * English Attack under that, and put it on the board. That is what this module
 * builds: the named openings, as a tree.
 *
 * ## What it is not
 *
 * It is **not a Polyglot book** (`src/book/`), which is an engine's move
 * weights keyed by Zobrist hash. It is **not the explorer**, which reports what
 * was played in a population of games. It is **not the repertoire**, which is
 * what the user intends to play. Those are four different questions and
 * Kingfisher keeps them apart on purpose; a move being in this book means only
 * that the classification dataset gives the position after it a name.
 *
 * ## Identity, and how the tree is built
 *
 * A node's identity is `positionKey`, the same identity everything else in
 * Kingfisher uses, so a lookup from the board finds the same node however the
 * position was reached. **No new opening identities are created here** — every
 * node is an entry the CC0 dataset already names.
 *
 * The *tree*, though, is built from the dataset's own shortest line to each
 * position: a node's parent is the deepest other entry whose line is a proper
 * prefix of its own. That is a deliberate and stated limitation. Prefixing is
 * move-order dependent while position identity is not, so the tree is the
 * dataset's hierarchy rather than the complete transpositional graph. It is the
 * right structure for browsing — it is how the dataset's own names nest — and
 * transpositions are handled where they belong, at lookup time, because a
 * position reached by another move order still resolves to the same key.
 *
 * Provenance travels with every node: it is all one dataset, and
 * `THEORY_BOOK_PROVENANCE` says which.
 */

import { briefForLineage, type ResolvedBrief } from './variation-briefs';
import { loadOpeningCatalog, OPENING_ALIASES, type OpeningEntry } from './opening-catalog';

/** Where every fact in this book comes from. */
export const THEORY_BOOK_PROVENANCE = {
  dataset: 'lichess-org/chess-openings',
  licence: 'CC0-1.0',
  url: 'https://github.com/lichess-org/chess-openings',
  /** Briefs are Kingfisher's own prose; see `variation-briefs.ts`. */
  briefs: 'kingfisher',
} as const;

export interface TheoryBookNode {
  /** Canonical position key. The node's identity, and the board's. */
  readonly key: string;
  readonly eco: string;
  /** Opening family, e.g. "Sicilian Defense". */
  readonly name: string;
  /** Everything the dataset says after the family. */
  readonly variation?: string;
  /** `name: variation`, as the dataset writes it. */
  readonly label: string;
  /** Family first, then each named qualifier. */
  readonly lineage: readonly string[];
  /** The dataset's own shortest line to this position, in SAN. */
  readonly moves: readonly string[];
  /**
   * The moves that turn the parent into this node.
   *
   * What a book prints beside a branch. For a root it is the whole line.
   */
  readonly definingMoves: readonly string[];
  readonly plies: number;
  readonly parent: string | null;
  readonly children: readonly string[];
  /** Informal names a player might say out loud, from `OPENING_ALIASES`. */
  readonly aliases: readonly string[];
  /**
   * How many named positions the dataset records below this one.
   *
   * A structural fact about the classification, and deliberately nothing more.
   * It is **not** a popularity, strength or importance score — no game was
   * counted to produce it and no engine was asked. What it measures is how much
   * naming the dataset does under a line, which turns out to be the only
   * signal available for ordering eighty-two Sicilian variations so that the
   * Najdorf is near the top and the Amazon Attack is not. The Explorer answers
   * questions about how often something is actually played.
   */
  readonly namedBelow: number;
}

/** Where a line sits in the book, when the book does not name its last position. */
export interface TheoryBookMatch {
  readonly node: TheoryBookNode;
  /** Ply of the line at which that node was reached. */
  readonly ply: number;
  /** Plies played past the last named position. Zero means an exact match. */
  readonly beyond: number;
}

export interface TheoryBook {
  readonly size: number;
  /** Openings with no named ancestor — the top of the book. */
  readonly roots: readonly TheoryBookNode[];
  node(key: string): TheoryBookNode | null;
  children(key: string): readonly TheoryBookNode[];
  /**
   * Root-to-node path, so a panel can say where the reader is.
   *
   * Empty when the key is not in the book, which is the common case: most
   * positions in a real game are past the last named one.
   */
  path(key: string): readonly TheoryBookNode[];
  /**
   * The path as a reader wants it, without the same name four times.
   *
   * The dataset names several successive positions in a line identically —
   * 1.e4 c5, 2.Nf3 and 3.d4 are all just "Sicilian Defense" — so the raw path
   * is structurally right and reads badly. This keeps the deepest node of each
   * run of identical labels.
   */
  crumbs(key: string): readonly TheoryBookNode[];
  /**
   * The deepest named position on a line, and how far past it the line goes.
   *
   * This is what makes the book useful at move twenty. A position key cannot
   * find its own ancestors — that is the point of a canonical key — so a
   * reader deep in a theoretical line is located by walking the moves that got
   * them there, exactly as the classifier does. Twenty plies into a Najdorf
   * the dataset names nothing, and the honest answer is still "Najdorf,
   * English Attack, six moves further on".
   */
  deepest(moves: readonly string[]): TheoryBookMatch | null;
  /** The brief for a node, inherited from its nearest described ancestor. */
  brief(key: string): ResolvedBrief | null;
  /**
   * The named variations directly below a node, however many moves down.
   *
   * `children` is the move tree: the Sicilian's children are 2.Nf3, 2.c3,
   * 2.Nc3 and so on, one ply at a time. That is right at the board and wrong
   * in a book — a player looking at the Sicilian wants the Najdorf, the
   * Dragon and the Sveshnikov, which are four and five plies down and reached
   * through three intermediate positions the dataset also calls "Sicilian
   * Defense".
   *
   * So this reads the *names* rather than the moves: the descendants whose
   * lineage extends this node's by exactly one term, shallowest of each. It is
   * how the index of a book is organised, and it is what makes browsing
   * Sicilian → Najdorf → English Attack three clicks instead of nine.
   */
  variations(key: string): readonly TheoryBookNode[];
  /** Every node whose family is exactly this, ordered as the book reads. */
  family(name: string): readonly TheoryBookNode[];
  /** The families, in the order they should be offered. */
  families(): readonly string[];
}

/**
 * Informal names, indexed by the dataset term they resolve to.
 *
 * `OPENING_ALIASES` maps what a player types onto a term the dataset contains.
 * A node wants the reverse — "which of these nicknames apply to me" — so the
 * mapping is inverted once and matched against the node's own label.
 */
const ALIASES_BY_TERM = (() => {
  const byTerm = new Map<string, string[]>();
  for (const [alias, term] of Object.entries(OPENING_ALIASES)) {
    const list = byTerm.get(term) ?? [];
    list.push(alias);
    byTerm.set(term, list);
  }
  return byTerm;
})();

function aliasesFor(entry: OpeningEntry): readonly string[] {
  const found: string[] = [];
  for (const [term, aliases] of ALIASES_BY_TERM) {
    if (entry.label.includes(term)) found.push(...aliases);
  }
  return [...new Set(found)].sort();
}

/**
 * The dataset's `Family: Variation, Sub` label, as a lineage.
 *
 * Shared with the classifier's own reading of the same field, so a brief
 * matched here and a brief matched under the board cannot disagree.
 */
function lineageOf(entry: OpeningEntry): readonly string[] {
  const parts = [entry.name];
  if (entry.variation) {
    for (const part of entry.variation.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) parts.push(trimmed);
    }
  }
  return parts;
}

function build(entries: readonly OpeningEntry[]): TheoryBook {
  /*
    Longest-proper-prefix lookup, done once. Keying on the joined line rather
    than walking positions keeps this string work: 3,810 entries at up to
    around thirty plies is a few tens of thousands of map lookups, which is
    fast enough to do on demand and avoids a second generated artefact that
    could fall out of step with the index.
  */
  const byLine = new Map<string, OpeningEntry>();
  for (const entry of entries) byLine.set(entry.moves.join(' '), entry);

  const nodes = new Map<string, TheoryBookNode>();
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];

  for (const entry of entries) {
    let parent: OpeningEntry | null = null;
    for (let length = entry.moves.length - 1; length > 0; length -= 1) {
      const candidate = byLine.get(entry.moves.slice(0, length).join(' '));
      // A dataset entry can share a position key with a shorter line; that is
      // the same node, not its own parent.
      if (candidate && candidate.key !== entry.key) {
        parent = candidate;
        break;
      }
    }

    nodes.set(entry.key, {
      key: entry.key,
      eco: entry.eco,
      name: entry.name,
      ...(entry.variation ? { variation: entry.variation } : {}),
      label: entry.label,
      lineage: lineageOf(entry),
      moves: entry.moves,
      definingMoves: parent ? entry.moves.slice(parent.moves.length) : entry.moves,
      plies: entry.plies,
      parent: parent?.key ?? null,
      children: [],
      aliases: aliasesFor(entry),
      namedBelow: 0,
    });

    if (parent) {
      const siblings = childrenOf.get(parent.key) ?? [];
      siblings.push(entry.key);
      childrenOf.set(parent.key, siblings);
    } else {
      roots.push(entry.key);
    }
  }

  /*
    Subtree sizes, counted upwards from each node through its parent chain.
    One pass over the nodes rather than a traversal per node: the naive version
    is 3,810 traversals of an average branch and shows up as a visible pause
    the first time the panel opens.
  */
  const below = new Map<string, number>();
  for (const node of nodes.values()) {
    let parent = node.parent;
    for (let step = 0; parent && step < 64; step += 1) {
      below.set(parent, (below.get(parent) ?? 0) + 1);
      parent = nodes.get(parent)?.parent ?? null;
    }
  }
  for (const [key, count] of below) {
    const node = nodes.get(key);
    if (node) nodes.set(key, { ...node, namedBelow: count });
  }

  /*
    Children in book order, which is not alphabetical order. Sorting the
    nineteen replies to 1.e4 by name put the Sicilian seventeenth, behind the
    Borg Defense and the Lemming Defense; sorting by how much the dataset
    records below each puts it first. See `namedBelow` for what that number is
    and — importantly — what it is not.
  */
  for (const [key, keys] of childrenOf) {
    keys.sort((a, b) => {
      const left = nodes.get(a);
      const right = nodes.get(b);
      if (!left || !right) return 0;
      return (
        right.namedBelow - left.namedBelow ||
        left.plies - right.plies ||
        left.label.localeCompare(right.label)
      );
    });
    const node = nodes.get(key);
    if (node) nodes.set(key, { ...node, children: keys });
  }

  const byFamily = new Map<string, TheoryBookNode[]>();
  for (const node of nodes.values()) {
    const list = byFamily.get(node.name) ?? [];
    list.push(node);
    byFamily.set(node.name, list);
  }
  for (const list of byFamily.values()) {
    list.sort((a, b) => a.plies - b.plies || a.label.localeCompare(b.label));
  }

  const rootNodes = roots
    .map((key) => nodes.get(key))
    .filter((node): node is TheoryBookNode => node !== undefined)
    .sort((a, b) => a.eco.localeCompare(b.eco) || a.label.localeCompare(b.label));

  const api: TheoryBook = {
    size: nodes.size,
    roots: rootNodes,
    node: (key) => nodes.get(key) ?? null,
    children: (key) =>
      (nodes.get(key)?.children ?? [])
        .map((child) => nodes.get(child))
        .filter((node): node is TheoryBookNode => node !== undefined),
    path: (key) => {
      const out: TheoryBookNode[] = [];
      let current = nodes.get(key);
      /*
        Bounded rather than `while (current)`: the parent links are built from
        strictly shorter lines so a cycle is impossible, but a book that hung
        the UI would be a worse bug than a book that truncated.
      */
      for (let step = 0; current && step < 64; step += 1) {
        out.unshift(current);
        current = current.parent ? nodes.get(current.parent) : undefined;
      }
      return out;
    },
    crumbs: (key) => {
      /*
        The shallowest node of each name, in path order. A label can appear in
        two separate runs — 1.e4 c5 and 3.d4 are both "Sicilian Defense", with
        "Modern Variations" between them — so collapsing only adjacent repeats
        leaves the name in twice. And the shallowest is the one worth keeping:
        a reader clicking "Sicilian Defense" means 1.e4 c5, not the third move
        of one particular line into it.
      */
      const full = api.path(key);
      const seen = new Set<string>();
      const out: TheoryBookNode[] = [];
      for (const node of full) {
        if (seen.has(node.label)) continue;
        seen.add(node.label);
        out.push(node);
      }
      return out;
    },
    deepest: (moves) => {
      let best: TheoryBookMatch | null = null;
      for (let ply = 1; ply <= moves.length; ply += 1) {
        const entry = byLine.get(moves.slice(0, ply).join(' '));
        const node = entry ? nodes.get(entry.key) : undefined;
        if (node) best = { node, ply, beyond: moves.length - ply };
      }
      return best;
    },
    variations: (key) => {
      const node = nodes.get(key);
      if (!node) return [];
      const depth = node.lineage.length;
      const prefix = node.moves.join(' ');
      const shallowest = new Map<string, TheoryBookNode>();
      for (const candidate of nodes.values()) {
        if (candidate.lineage.length !== depth + 1) continue;
        if (candidate.moves.length <= node.moves.length) continue;
        // Genuinely below this position, not merely similarly named.
        if (!candidate.moves.slice(0, node.moves.length).join(' ').startsWith(prefix)) continue;
        let extendsLineage = true;
        for (let index = 0; index < depth; index += 1) {
          if (candidate.lineage[index] !== node.lineage[index]) {
            extendsLineage = false;
            break;
          }
        }
        if (!extendsLineage) continue;
        const term = candidate.lineage[depth] as string;
        const current = shallowest.get(term);
        if (!current || candidate.plies < current.plies) shallowest.set(term, candidate);
      }
      /*
        Most-documented first. Sorting by depth alone buried the Najdorf under
        seventy 3-ply gambits; sorting by how much the dataset says below a
        line puts the variations a player has heard of where they can see them,
        using nothing but the dataset's own structure.
      */
      return [...shallowest.values()].sort(
        (a, b) =>
          b.namedBelow - a.namedBelow || a.plies - b.plies || a.label.localeCompare(b.label),
      );
    },
    brief: (key) => {
      const node = nodes.get(key);
      return node ? briefForLineage(node.lineage) : null;
    },
    family: (name) => byFamily.get(name) ?? [],
    families: () =>
      [...byFamily.keys()].sort((a, b) => {
        const left = byFamily.get(a)?.[0];
        const right = byFamily.get(b)?.[0];
        return (left?.eco ?? '').localeCompare(right?.eco ?? '') || a.localeCompare(b);
      }),
  };
  return api;
}

let book: Promise<TheoryBook> | null = null;

/** The book, built once per session from the same index the classifier uses. */
export function loadTheoryBook(): Promise<TheoryBook> {
  book ??= loadOpeningCatalog().then(build);
  return book;
}

export function resetTheoryBookForTests(): void {
  book = null;
}
