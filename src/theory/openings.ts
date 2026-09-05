/**
 * Opening classification.
 *
 * Kingfisher classifies positions itself rather than repeating whatever an
 * imported PGN happened to put in its `[ECO]` tag. Two reasons, and they are
 * both practical rather than tidy: a great many PGNs carry no tag at all, and a
 * great many of the ones that do carry a tag that was computed by a different
 * program, at a different depth, from a different table, and disagrees with the
 * one next to it in the same file.
 *
 * The classification is a lookup, not an algorithm with taste. `data/openings/`
 * holds a CC0 dataset of named positions; `scripts/build-opening-index.mjs`
 * replays each of its lines through this application's own rules code and
 * writes out the resulting canonical position keys. Classifying a game is
 * therefore: walk the line, and keep the deepest position that is in the index.
 *
 * Two consequences fall out of keying on position rather than on move order,
 * and both are the point:
 *
 *  - **Transpositions converge.** 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 and 1.c4 e6 2.Nc3
 *    Bb4 3.d4 Nf6 are the same position and get the same name, without a
 *    special case anywhere.
 *  - **Depth wins.** A Sicilian that reaches a Najdorf is a Najdorf. Naming it
 *    from the second move, which is what reading `[ECO]` off a two-move prefix
 *    amounts to, throws away the part the reader cares about.
 *
 * The index is loaded on demand. It is roughly half a megabyte of source and
 * has no business in the first paint of a board.
 */

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';

/** One named opening position, as the dataset defines it. */
export interface OpeningClassification {
  readonly eco: string;
  /** Opening family, e.g. "Sicilian Defense". */
  readonly name: string;
  /** Everything the dataset says after the family, when it says anything. */
  readonly variation?: string;
  /**
   * Dataset-defined ancestry, from family to the deepest named qualifier.
   *
   * Lichess opening names use `Family: Variation, Subvariation, ...`. Keeping
   * that structure makes identity useful without pretending that an Explorer
   * statistic or a repertoire choice is part of the opening's name.
   */
  readonly lineage?: readonly string[];
  /** Plies of the dataset's own shortest line to this position. */
  readonly datasetPlies: number;
}

/** A classification plus where in *this* game it was recognised. */
export interface GameClassification extends OpeningClassification {
  /** Ply of the game at which the deepest known position was reached. */
  readonly ply: number;
  /** The node carrying it, when classification walked a tree. */
  readonly nodeId?: NodeId;
  /**
   * The dataset's own shortest line to the named position, in SAN.
   *
   * Present only where the caller had the index to hand. It is the canonical
   * sequence for the variation, not the move order this game used to reach
   * it — a player who transposed still wants to see what defines the line.
   */
  readonly line?: string;
}

export interface OpeningIndex {
  readonly digest: string;
  readonly entries: number;
  readonly deepestPly: number;
  lookup(key: string): OpeningClassification | null;
  /**
   * The dataset's own shortest line to a named position, in SAN.
   *
   * Deliberately not reconstructed from the game in front of the user: the
   * question a brief answers is "what sequence defines this variation", and
   * the answer has to be the canonical one, not whichever move order this
   * player happened to use to transpose into it.
   */
  line(key: string): string | null;
}

/*
  One in-flight load, shared. Several panels classify the same position at the
  same moment on a route change, and each of them awaiting its own dynamic
  import would parse half a megabyte several times over.
*/
let pending: Promise<OpeningIndex> | null = null;
let loaded: OpeningIndex | null = null;

/** Turn the dataset's documented name convention into an explicit lineage. */
export function openingLineage(name: string, variation?: string): readonly string[] {
  const qualifiers = (variation ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [name, ...qualifiers];
}

export function loadOpeningIndex(): Promise<OpeningIndex> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import('./opening-index.generated')
    .then((module) => {
      const cache = new Map<string, OpeningClassification>();
      const index: OpeningIndex = {
        digest: module.OPENING_DATASET_DIGEST,
        entries: module.OPENING_ENTRY_COUNT,
        deepestPly: module.OPENING_DEEPEST_PLY,
        lookup(key: string): OpeningClassification | null {
          const hit = cache.get(key);
          if (hit) return hit;
          const packed = module.OPENING_POSITIONS[key];
          if (!packed) return null;
          const label = module.OPENING_LABELS[packed[1]] ?? '';
          const colon = label.indexOf(': ');
          const value: OpeningClassification = {
            eco: module.OPENING_LABELS[packed[0]] ?? '',
            name: colon === -1 ? label : label.slice(0, colon),
            ...(colon === -1 ? {} : { variation: label.slice(colon + 2) }),
            lineage: openingLineage(
              colon === -1 ? label : label.slice(0, colon),
              colon === -1 ? undefined : label.slice(colon + 2),
            ),
            datasetPlies: packed[2],
          };
          cache.set(key, value);
          return value;
        },
        line(key: string): string | null {
          return module.OPENING_LINES[key] ?? null;
        },
      };
      loaded = index;
      return index;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** The index if it is already in memory, for render paths that cannot await. */
export const openingIndexIfLoaded = (): OpeningIndex | null => loaded;

/** Reset the memoized index. Tests only. */
export function resetOpeningIndexForTests(): void {
  pending = null;
  loaded = null;
}

/** One position, classified or not. Never guesses from a prefix. */
export const classifyPosition = (index: OpeningIndex, fen: Fen | string) =>
  index.lookup(positionKey(fen));

/**
 * The deepest known opening position on a sequence of positions.
 *
 * `fens[i]` is the position after ply `startPly + i`. Walking forward and
 * keeping the last hit is the same answer as the dataset's own suggested
 * "play backwards until a name is found", and is cheaper on a long game
 * because it visits the opening rather than the endgame first.
 *
 * The dataset's shortest-line depth is not a bound on the game's ply. A
 * repetition or delayed transposition can reach a named position much later.
 */
export function classifyLine(
  index: OpeningIndex,
  fens: readonly (Fen | string)[],
  startPly = 1,
): GameClassification | null {
  let best: GameClassification | null = null;
  for (let i = 0; i < fens.length; i += 1) {
    const hit = index.lookup(positionKey(fens[i] as string));
    if (hit) best = { ...hit, ply: startPly + i };
  }
  return best;
}

/**
 * Classify a game from its main line.
 *
 * Variations are deliberately not consulted. A game is classified by what was
 * played; an analyst's sideline showing what *could* have been played is not
 * evidence about which opening the game was.
 */
export function classifyGameTree(index: OpeningIndex, tree: GameTree): GameClassification | null {
  const path = mainlinePath(tree);
  let best: GameClassification | null = null;
  for (const id of path) {
    const node = tree.nodes[id];
    if (!node) continue;
    const hit = index.lookup(positionKey(node.fen));
    if (hit) best = { ...hit, ply: node.ply, nodeId: id };
  }
  return best;
}

/** How Kingfisher's answer relates to the one the source file declared. */
export type OpeningAgreement =
  'agree' | 'differ' | 'only-declared' | 'only-computed' | 'unclassified';

/** What a PGN said about the opening, before Kingfisher looked. */
export interface DeclaredOpening {
  readonly eco?: string;
  readonly opening?: string;
  readonly variation?: string;
}

/**
 * Both answers, kept apart.
 *
 * Deleting the imported tags and replacing them with a computed value would
 * destroy evidence: a game whose source disagrees with Kingfisher is worth
 * knowing about, and the disagreement is usually about depth rather than about
 * being wrong. So both are stored, and any surface that shows one can say
 * where it came from.
 */
export interface OpeningAttribution {
  readonly computed: GameClassification | null;
  readonly declared: DeclaredOpening | null;
  readonly agreement: OpeningAgreement;
}

const sameEco = (a?: string, b?: string) =>
  Boolean(a) && Boolean(b) && a?.toUpperCase() === b?.toUpperCase();

export function attributeOpening(
  computed: GameClassification | null,
  declared: DeclaredOpening | null,
): OpeningAttribution {
  const hasDeclared = Boolean(declared && (declared.eco || declared.opening));
  if (!computed && !hasDeclared) {
    return { computed: null, declared: null, agreement: 'unclassified' };
  }
  if (!computed) return { computed: null, declared, agreement: 'only-declared' };
  if (!hasDeclared) return { computed, declared: null, agreement: 'only-computed' };
  /*
    Compared on ECO alone. Opening *names* are not standardised — "Ruy Lopez"
    and "Spanish Game" are the same opening, and calling those a disagreement
    would flag most of a normal import. ECO codes are a shared vocabulary, so a
    difference in them is a real difference.
  */
  return {
    computed,
    declared,
    agreement: sameEco(computed.eco, declared?.eco) || !declared?.eco ? 'agree' : 'differ',
  };
}

/** The one-line label a panel prints. */
export const openingLabel = (opening: OpeningClassification): string =>
  opening.variation ? `${opening.name}: ${opening.variation}` : opening.name;
