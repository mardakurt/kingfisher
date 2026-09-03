/**
 * Structural identity of a position, for research rather than for judgement.
 *
 * Two questions a strong player asks constantly, and which nothing in
 * Kingfisher could answer until now:
 *
 *   "Where else have I had this pawn structure?"
 *   "Show me games with an isolated d-pawn and an open c-file."
 *
 * Both need a *deterministic, documented, indexable* identity — not a learned
 * embedding. Everything here is a pure function of the FEN, computed the same
 * way in the browser, in the Worker and in the companion, so a key stored on
 * import still matches a key computed live months later. Nothing here scores,
 * ranks or interprets: it reduces a position to facts that can be compared for
 * equality and indexed.
 *
 * Two identities, deliberately separate:
 *
 *   - The **pawn skeleton key** is the pawns and nothing else. Two positions
 *     with identical pawns and completely different pieces share it, which is
 *     exactly the point — that is what "the same structure" means to a player.
 *   - The **structure signature** is a small set of coarse structural facts
 *     (isolated/doubled/passed pawns, open and semi-open files, bishop pair,
 *     material profile, king placement). It groups positions that are similar
 *     without being identical.
 *
 * See ADR 0024 for the format guarantees and why they are frozen.
 */

import { fileLetterOf, rankOf, squareAt } from './board';
import { positionFeatures, type PositionFeatures } from './features';
import { parseFen, type FenParts } from './fen';
import { isOk } from './result';
import type { Color, FileLetter, Square } from './types';
import { FILES } from './types';

/**
 * Format version, embedded in every key.
 *
 * A stored key that was computed by an older definition must never be compared
 * for equality against a new one, and must never be silently treated as a
 * miss either. The prefix makes a format change visible: a collection indexed
 * at `p1` is detectable, and can be reindexed rather than quietly answering
 * the wrong question.
 */
export const SKELETON_VERSION = 'p1';
export const SIGNATURE_VERSION = 's1';

/**
 * The pawns, and only the pawns.
 *
 * `p1:` then eight file groups separated by `/`, each listing the ranks of the
 * White pawns on that file in ascending order, a `|`, then the Black pawns.
 * A file with no pawns is empty on both sides. Files are always a–h, so the
 * key is fixed-shape and lexicographically groupable by the a-file first.
 *
 *   p1:2|7/2|7/2|7/2|7/2|7/2|7/2|7/2|7      the initial position
 *   p1:2|7/2|7/2|7//2|7/2|7/2|7/2|7 + 4|5   after 1.d4 d5
 *
 * Side to move, castling rights, en passant and the piece placement are all
 * deliberately absent. Two positions reached by different move orders, with
 * different pieces, at different points in different games, share a skeleton
 * if and only if their pawns stand on the same squares.
 */
export function pawnSkeletonKey(fen: string): string {
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return `${SKELETON_VERSION}:invalid`;
  return pawnSkeletonKeyFromParts(parsed.value);
}

export function pawnSkeletonKeyFromParts(parts: FenParts): string {
  const white: Record<FileLetter, number[]> = emptyFiles();
  const black: Record<FileLetter, number[]> = emptyFiles();

  for (let index = 0; index < 64; index += 1) {
    const piece = parts.board[index];
    if (!piece || piece.type !== 'p') continue;
    const square = squareAt(index);
    // Rank as the digit a player would say, so the key is readable as squares.
    (piece.color === 'w' ? white : black)[fileLetterOf(square)].push(rankOf(square) + 1);
  }

  const groups = FILES.map((file) => {
    const ours = white[file].sort((a, b) => a - b).join('');
    const theirs = black[file].sort((a, b) => a - b).join('');
    return `${ours}|${theirs}`;
  });
  return `${SKELETON_VERSION}:${groups.join('/')}`;
}

/**
 * Human-readable form of a skeleton key, for a result row or a tooltip.
 *
 * The two sides are named rather than distinguished by letter case: a file is
 * a lower-case letter in every other part of the product, and a reader should
 * not have to know a private convention to tell whose pawn is on d4.
 */
export function describePawnSkeleton(key: string): string {
  const body = key.startsWith(`${SKELETON_VERSION}:`)
    ? key.slice(SKELETON_VERSION.length + 1)
    : key;
  if (body === 'invalid') return 'Unreadable position';
  const groups = body.split('/');
  const white: string[] = [];
  const black: string[] = [];
  groups.forEach((group, fileIndex) => {
    const [ours = '', theirs = ''] = group.split('|');
    for (const rank of ours) white.push(`${FILES[fileIndex]}${rank}`);
    for (const rank of theirs) black.push(`${FILES[fileIndex]}${rank}`);
  });
  if (white.length === 0 && black.length === 0) return 'No pawns';
  return [
    white.length ? `White ${white.join(' ')}` : 'White none',
    black.length ? `Black ${black.join(' ')}` : 'Black none',
  ].join(' · ');
}

/** How many pawns a skeleton holds, without reconstructing a board. */
export function pawnSkeletonCount(key: string): number {
  const body = key.startsWith(`${SKELETON_VERSION}:`)
    ? key.slice(SKELETON_VERSION.length + 1)
    : key;
  if (body === 'invalid') return 0;
  return body.split('/').reduce((total, group) => total + group.replace('|', '').length, 0);
}

/**
 * The coarse structural facts, as a flat record.
 *
 * Everything is either a boolean or a small integer, so each field can be a
 * filter and the whole thing can be an index key. The values come from
 * `positionFeatures`, which is the existing, tested feature extractor — this
 * module adds identity, not new chess analysis.
 */
export interface StructureFacts {
  readonly whiteIsolated: readonly FileLetter[];
  readonly blackIsolated: readonly FileLetter[];
  readonly whiteDoubled: readonly FileLetter[];
  readonly blackDoubled: readonly FileLetter[];
  readonly whitePassed: readonly FileLetter[];
  readonly blackPassed: readonly FileLetter[];
  readonly whiteBackward: readonly FileLetter[];
  readonly blackBackward: readonly FileLetter[];
  readonly openFiles: readonly FileLetter[];
  readonly whiteSemiOpenFiles: readonly FileLetter[];
  readonly blackSemiOpenFiles: readonly FileLetter[];
  readonly whiteIslands: number;
  readonly blackIslands: number;
  readonly whiteBishopPair: boolean;
  readonly blackBishopPair: boolean;
  readonly whiteCastled: boolean;
  readonly blackCastled: boolean;
  readonly whiteKingSide: KingSide;
  readonly blackKingSide: KingSide;
  readonly materialProfile: string;
  readonly materialBalance: number;
  readonly pieceCount: number;
  readonly pawnCount: number;
}

/** Which third of the board the king stands in. Coarse on purpose. */
export type KingSide = 'queenside' | 'centre' | 'kingside' | 'absent';

export function structureFacts(fen: string): StructureFacts | null {
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return null;
  return structureFactsFromFeatures(positionFeatures(parsed.value), parsed.value);
}

export function structureFactsFromFeatures(
  features: PositionFeatures,
  parts: FenParts,
): StructureFacts {
  const { white, black, material, pieceCount } = features;
  return {
    whiteIsolated: filesOf(white.pawns.isolated),
    blackIsolated: filesOf(black.pawns.isolated),
    whiteDoubled: filesOf(white.pawns.doubled),
    blackDoubled: filesOf(black.pawns.doubled),
    whitePassed: filesOf(white.pawns.passed),
    blackPassed: filesOf(black.pawns.passed),
    whiteBackward: filesOf(white.pawns.backward),
    blackBackward: filesOf(black.pawns.backward),
    // An open file is open for both sides, so White's list is the whole truth.
    openFiles: [...white.files.open],
    whiteSemiOpenFiles: [...white.files.semiOpen],
    blackSemiOpenFiles: [...black.files.semiOpen],
    whiteIslands: white.pawns.islands,
    blackIslands: black.pawns.islands,
    whiteBishopPair: white.bishopPair,
    blackBishopPair: black.bishopPair,
    whiteCastled: white.castled,
    blackCastled: black.castled,
    whiteKingSide: kingSideOf(white.kingSquare),
    blackKingSide: kingSideOf(black.kingSquare),
    materialProfile: materialProfileOf(material.difference),
    materialBalance: material.balance,
    pieceCount,
    pawnCount: countPawns(parts),
  };
}

/**
 * A single comparable string for "structurally similar".
 *
 * Deliberately coarser than `StructureFacts`: it carries the *files* that
 * matter and the material profile, and drops counts that change every move.
 * Two positions sharing a signature are the same structural type; they are not
 * the same position, and the signature never claims they are.
 *
 *   s1:wi=d;bi=;wp=;bp=;of=c;wso=c;bso=d;bp2=1;mat=eq;k=kk
 */
export function structureSignature(facts: StructureFacts): string {
  const parts = [
    `wi=${facts.whiteIsolated.join('')}`,
    `bi=${facts.blackIsolated.join('')}`,
    `wp=${facts.whitePassed.join('')}`,
    `bp=${facts.blackPassed.join('')}`,
    `of=${facts.openFiles.join('')}`,
    `wso=${facts.whiteSemiOpenFiles.join('')}`,
    `bso=${facts.blackSemiOpenFiles.join('')}`,
    `bpr=${facts.whiteBishopPair ? 'w' : ''}${facts.blackBishopPair ? 'b' : ''}`,
    `mat=${facts.materialProfile}`,
    `k=${facts.whiteKingSide[0]}${facts.blackKingSide[0]}`,
  ];
  return `${SIGNATURE_VERSION}:${parts.join(';')}`;
}

/** The structural facts a user can filter on, as one flat list of chess claims. */
export interface StructureClaim {
  readonly id: string;
  readonly label: string;
}

export function structureClaims(facts: StructureFacts): readonly StructureClaim[] {
  const claims: StructureClaim[] = [];
  const add = (id: string, label: string) => claims.push({ id, label });

  for (const file of facts.whiteIsolated) add(`w-isolated-${file}`, `White isolated ${file}-pawn`);
  for (const file of facts.blackIsolated) add(`b-isolated-${file}`, `Black isolated ${file}-pawn`);
  for (const file of facts.whiteDoubled) add(`w-doubled-${file}`, `White doubled ${file}-pawns`);
  for (const file of facts.blackDoubled) add(`b-doubled-${file}`, `Black doubled ${file}-pawns`);
  for (const file of facts.whitePassed) add(`w-passed-${file}`, `White passed ${file}-pawn`);
  for (const file of facts.blackPassed) add(`b-passed-${file}`, `Black passed ${file}-pawn`);
  for (const file of facts.whiteBackward) add(`w-backward-${file}`, `White backward ${file}-pawn`);
  for (const file of facts.blackBackward) add(`b-backward-${file}`, `Black backward ${file}-pawn`);
  for (const file of facts.openFiles) add(`open-${file}`, `Open ${file}-file`);
  for (const file of facts.whiteSemiOpenFiles) {
    add(`w-semi-${file}`, `White semi-open ${file}-file`);
  }
  for (const file of facts.blackSemiOpenFiles) {
    add(`b-semi-${file}`, `Black semi-open ${file}-file`);
  }
  if (facts.whiteBishopPair) add('w-bishop-pair', 'White bishop pair');
  if (facts.blackBishopPair) add('b-bishop-pair', 'Black bishop pair');
  if (facts.materialProfile !== 'eq') add(`mat-${facts.materialProfile}`, materialLabel(facts));
  add(
    `islands-${facts.whiteIslands}-${facts.blackIslands}`,
    `${facts.whiteIslands} vs ${facts.blackIslands} pawn islands`,
  );
  if (facts.whiteCastled) add('w-castled', 'White has castled');
  if (facts.blackCastled) add('b-castled', 'Black has castled');
  return claims;
}

/**
 * How much two sets of structural facts have in common.
 *
 * A count of shared claims and the total on each side — not a similarity
 * score. The caller decides what "close enough" means, and the result table
 * shows the count so the reader can decide too.
 */
export interface StructureOverlap {
  readonly shared: number;
  readonly queryTotal: number;
  readonly candidateTotal: number;
  readonly missing: readonly string[];
}

export function structureOverlap(
  query: readonly StructureClaim[],
  candidate: readonly StructureClaim[],
): StructureOverlap {
  const candidateIds = new Set(candidate.map((claim) => claim.id));
  const missing = query.filter((claim) => !candidateIds.has(claim.id));
  return {
    shared: query.length - missing.length,
    queryTotal: query.length,
    candidateTotal: candidate.length,
    missing: missing.map((claim) => claim.label),
  };
}

// --- internals -------------------------------------------------------------

const emptyFiles = (): Record<FileLetter, number[]> => ({
  a: [],
  b: [],
  c: [],
  d: [],
  e: [],
  f: [],
  g: [],
  h: [],
});

const filesOf = (squares: readonly Square[]): readonly FileLetter[] => {
  const seen = new Set<FileLetter>();
  for (const square of squares) seen.add(fileLetterOf(square));
  return FILES.filter((file) => seen.has(file));
};

const kingSideOf = (square: Square | null): KingSide => {
  if (!square) return 'absent';
  const file = fileLetterOf(square);
  if (file === 'a' || file === 'b' || file === 'c') return 'queenside';
  if (file === 'f' || file === 'g' || file === 'h') return 'kingside';
  return 'centre';
};

/**
 * Material difference as a short token.
 *
 * `eq` when every piece type is level, otherwise the non-zero differences in
 * a fixed order — `q+1n-1` is a queen for a knight either way round, which is
 * what makes it comparable between two positions.
 */
function materialProfileOf(difference: {
  readonly p: number;
  readonly n: number;
  readonly b: number;
  readonly r: number;
  readonly q: number;
}): string {
  const parts: string[] = [];
  for (const type of ['q', 'r', 'b', 'n', 'p'] as const) {
    const value = difference[type];
    if (value !== 0) parts.push(`${type}${value > 0 ? '+' : ''}${value}`);
  }
  return parts.length === 0 ? 'eq' : parts.join('');
}

function materialLabel(facts: StructureFacts): string {
  const side = facts.materialBalance > 0 ? 'White' : 'Black';
  return `Material imbalance (${facts.materialProfile}), ${side} ahead by ${Math.abs(facts.materialBalance)}`;
}

function countPawns(parts: FenParts): number {
  let total = 0;
  for (let index = 0; index < 64; index += 1) {
    if (parts.board[index]?.type === 'p') total += 1;
  }
  return total;
}

/** Exported for the search UI, which needs to name a colour's claims. */
export const claimColor = (id: string): Color | null =>
  id.startsWith('w-') ? 'w' : id.startsWith('b-') ? 'b' : null;
