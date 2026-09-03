import { describe, expect, it } from 'vitest';

import { isThreefoldRepetition, positionAt } from './game';
import { START_FEN } from './fen';
import { parsePgn } from './pgn';
import { serializePgn } from './pgn/serialize';
import { Position } from './position';
import { expect as unwrap } from './result';
import {
  addMove,
  createTree,
  mustGetNode,
  promoteVariation,
  removeVariation,
  truncateAfter,
} from './tree/tree';
import type { GameTree, NodeId } from './tree/types';
import { asFen, type ChessMove } from './types';

/**
 * Deterministic seeded randomized testing for the tree/PGN infrastructure.
 *
 * Hand-authored fixtures test the cases someone thought of. These tests
 * generate legal games — biased toward castling, en passant, promotion,
 * checks and terminal positions, which is where a tree or PGN bug is most
 * likely to hide — and check properties that must hold for *any* legal game,
 * not just the ones already in a fixture file. Every seed is fixed, so a
 * failure here is exactly as reproducible as a hand-written test.
 */

// --- A tiny, dependency-free seeded PRNG (mulberry32) --------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, items: readonly T[]): T => {
  const value = items[Math.floor(rng() * items.length)];
  if (value === undefined) throw new Error('pick() called on an empty list');
  return value;
};

const isSpecial = (move: ChessMove): boolean =>
  move.flags.capture ||
  move.flags.enPassant ||
  move.flags.promotion ||
  move.flags.kingsideCastle ||
  move.flags.queensideCastle;

/**
 * Weighted toward castling, en passant, promotion and captures when any are
 * legal, so special-move coverage does not depend on rolling them by luck
 * over a purely uniform distribution.
 */
function pickBiasedMove(rng: () => number, moves: readonly ChessMove[]): ChessMove {
  const special = moves.filter(isSpecial);
  if (special.length > 0 && rng() < 0.6) return pick(rng, special);
  return pick(rng, moves);
}

interface RandomGame {
  readonly tree: GameTree;
  readonly leafId: NodeId;
  /** Node ids where a sibling variation was planted, for the editing tests. */
  readonly variationPoints: readonly NodeId[];
}

/**
 * Plays a random legal game from `startFen`, occasionally branching a
 * variation off the mainline, until `maxPlies` is reached or the game ends
 * (checkmate, stalemate, or no side has a legal move left).
 */
function randomGame(seed: number, startFen = START_FEN, maxPlies = 50): RandomGame {
  const rng = mulberry32(seed);
  let tree = createTree(startFen);
  let currentId = tree.rootId;
  const variationPoints: NodeId[] = [];

  for (let ply = 0; ply < maxPlies; ply += 1) {
    const position = positionAt(tree, currentId);
    const moves = position.legalMoves();
    if (moves.length === 0) break;

    const chosen = pickBiasedMove(rng, moves);
    const played = addMove(tree, currentId, chosen);
    tree = played.tree;

    // Occasionally branch: play a second, different legal move as a sibling
    // variation without following it, so the tree has real variation
    // structure for the editing properties below to exercise.
    if (moves.length > 1 && rng() < 0.2) {
      const alternatives = moves.filter((move) => move.uci !== chosen.uci);
      const branch = pickBiasedMove(rng, alternatives);
      const withVariation = addMove(tree, currentId, branch);
      tree = withVariation.tree;
      variationPoints.push(withVariation.nodeId);
    }

    currentId = played.nodeId;
  }

  return { tree, leafId: currentId, variationPoints };
}

// --- Properties that must hold for any tree produced above ----------------

/** Every node is reachable from the root exactly once, with no orphans. */
function assertWellFormed(tree: GameTree): void {
  const visited = new Set<NodeId>();
  const stack: NodeId[] = [tree.rootId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    expect(visited.has(id), `${id} visited twice — the tree has a cycle or a shared child`).toBe(
      false,
    );
    visited.add(id);
    const node = mustGetNode(tree, id);
    for (const childId of node.children) {
      expect(mustGetNode(tree, childId).parentId).toBe(id);
      stack.push(childId);
    }
  }
  expect(visited.size).toBe(Object.keys(tree.nodes).length);
}

/** Every move on the tree is legal from its parent's position. */
function assertEveryMoveIsLegal(tree: GameTree): void {
  const stack: NodeId[] = [tree.rootId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    const node = mustGetNode(tree, id);
    for (const childId of node.children) {
      const child = mustGetNode(tree, childId);
      const legal = positionAt(tree, id).legalMoves();
      expect(legal.some((move) => move.uci === child.move?.uci)).toBe(true);
      stack.push(childId);
    }
  }
}

/** One line per leaf: the SAN sequence from the root, and the FEN it reaches. */
function lineSignatures(tree: GameTree): ReadonlySet<string> {
  const lines = new Set<string>();
  const walk = (id: NodeId, sanPath: readonly string[]): void => {
    const node = mustGetNode(tree, id);
    if (node.children.length === 0) {
      lines.add(`${sanPath.join(' ')}|${node.fen}`);
      return;
    }
    for (const childId of node.children) {
      const child = mustGetNode(tree, childId);
      walk(childId, child.move ? [...sanPath, child.move.san] : sanPath);
    }
  };
  walk(tree.rootId, []);
  return lines;
}

const SEEDS = Array.from({ length: 16 }, (_, index) => index * 104_729 + 7);

describe.each(SEEDS)('a random legal game (seed %i)', (seed) => {
  it('is structurally well-formed and every move is legal', () => {
    const { tree } = randomGame(seed);
    assertWellFormed(tree);
    assertEveryMoveIsLegal(tree);
  });

  it('round-trips through PGN with the same lines, unchanged', () => {
    const { tree } = randomGame(seed);
    const reparsed = parsePgn(serializePgn(tree)).games[0];
    if (!reparsed) throw new Error('random game failed to reparse');
    expect(lineSignatures(reparsed.tree)).toEqual(lineSignatures(tree));
  });

  it('replaying the mainline move again reuses the node instead of duplicating it', () => {
    const { tree, leafId } = randomGame(seed, START_FEN, 12);
    const parentId = mustGetNode(tree, leafId).parentId;
    if (!parentId) return; // The game ended at the root; nothing to replay.
    const move = mustGetNode(tree, leafId).move;
    if (!move) throw new Error('leaf has no move');

    const replayed = addMove(tree, parentId, move);
    expect(replayed.existed).toBe(true);
    expect(replayed.nodeId).toBe(leafId);
    // Replaying is a genuine no-op: the tree it returns is the same tree.
    expect(replayed.tree).toBe(tree);
  });

  it('does not mutate the tree an edit was applied to', () => {
    const { tree, leafId } = randomGame(seed, START_FEN, 12);
    const before = structuredClone(tree);
    const position = positionAt(tree, leafId);
    const moves = position.legalMoves();
    if (moves.length === 0) return;
    addMove(tree, leafId, moves[0] as ChessMove);
    expect(tree).toEqual(before);
  });

  it('stays well-formed after promoting, removing, and truncating a variation', () => {
    const { tree, variationPoints } = randomGame(seed);
    let edited = tree;
    for (const id of variationPoints) {
      if (!edited.nodes[id]) continue; // An earlier edit in this loop may have removed it.
      edited = promoteVariation(edited, id);
      assertWellFormed(edited);
    }
    for (const id of variationPoints) {
      if (!edited.nodes[id]) continue;
      edited = truncateAfter(edited, id);
      assertWellFormed(edited);
      edited = removeVariation(edited, id).tree;
      assertWellFormed(edited);
    }
    // Every remaining move is still a legal move from its parent: editing
    // structure never rewrote a move into a different, illegal one.
    assertEveryMoveIsLegal(edited);
  });
});

// --- Curated SetUp/FEN starts for cases random play rarely reaches --------

describe('special move coverage', () => {
  it('round-trips a game that castles both sides', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const tree = createTree(asFen(fen));
    const white = unwrap(Position.fromFen(fen));
    const kingside = unwrap(white.playSan('O-O'));
    const afterWhite = addMove(tree, tree.rootId, kingside);
    const black = Position.fromTrustedFen(kingside.after);
    const queenside = unwrap(black.playSan('O-O-O'));
    const afterBlack = addMove(afterWhite.tree, afterWhite.nodeId, queenside);

    expect(kingside.flags.kingsideCastle).toBe(true);
    expect(queenside.flags.queensideCastle).toBe(true);
    const reparsed = parsePgn(serializePgn(afterBlack.tree)).games[0];
    if (!reparsed) throw new Error('castling game failed to reparse');
    expect(lineSignatures(reparsed.tree)).toEqual(lineSignatures(afterBlack.tree));
  });

  it('round-trips an en passant capture', () => {
    const fen = 'rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3';
    const tree = createTree(asFen(fen));
    const move = unwrap(unwrap(Position.fromFen(fen)).playSan('dxc6'));
    expect(move.flags.enPassant).toBe(true);
    const played = addMove(tree, tree.rootId, move).tree;

    assertWellFormed(played);
    const reparsed = parsePgn(serializePgn(played)).games[0];
    if (!reparsed) throw new Error('en passant game failed to reparse');
    expect(lineSignatures(reparsed.tree)).toEqual(lineSignatures(played));
  });

  it.each(['q', 'r', 'b', 'n'] as const)('round-trips promotion to %s', (piece) => {
    const fen = '8/4P3/8/8/8/8/8/4K1k1 w - - 0 1';
    const tree = createTree(asFen(fen));
    const move = unwrap(
      unwrap(Position.fromFen(fen)).play({ from: 'e7', to: 'e8', promotion: piece }),
    );
    expect(move.promotion).toBe(piece);
    const played = addMove(tree, tree.rootId, move).tree;

    const reparsed = parsePgn(serializePgn(played)).games[0];
    if (!reparsed) throw new Error('promotion game failed to reparse');
    expect(lineSignatures(reparsed.tree)).toEqual(lineSignatures(played));
  });

  it('reaches a checkmate leaf and the tree agrees the game is over', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const tree = createTree(asFen(fen));
    expect(unwrap(Position.fromFen(fen)).isCheckmate()).toBe(true);
    expect(positionAt(tree, tree.rootId).legalMoves()).toHaveLength(0);
  });

  it('reaches a stalemate leaf and the tree agrees the game is over', () => {
    const fen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const tree = createTree(asFen(fen));
    expect(positionAt(tree, tree.rootId).legalMoves()).toHaveLength(0);
    expect(unwrap(Position.fromFen(fen)).isStalemate()).toBe(true);
  });

  it('reaches a threefold repetition through a shuffled knight', () => {
    let tree = createTree(START_FEN);
    let id = tree.rootId;
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) {
      const move = unwrap(positionAt(tree, id).playSan(san));
      const result = addMove(tree, id, move);
      tree = result.tree;
      id = result.nodeId;
    }
    expect(isThreefoldRepetition(tree, id)).toBe(true);
  });
});
