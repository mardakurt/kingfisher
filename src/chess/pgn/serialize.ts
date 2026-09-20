/**
 * `GameTree` → PGN.
 *
 * The output aims to be readable by a human and losslessly re-readable by this
 * parser: variations nest, comments keep their structured commands, and move
 * numbers are repeated wherever a reader would otherwise lose the thread.
 */

import { START_FEN } from '../fen';
import { formatComment } from './comment-commands';
import { collectSubtree, mustGetNode } from '../tree/tree';
import type { GameTree, MoveNode, NodeId } from '../tree/types';
import { moveNumberOfPly } from '../tree/types';

/** Tags the standard requires, in the order it requires them. */
const SEVEN_TAG_ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'] as const;

const DEFAULT_TAGS: Readonly<Record<string, string>> = {
  Event: '?',
  Site: '?',
  Date: '????.??.??',
  Round: '?',
  White: '?',
  Black: '?',
  Result: '*',
};

export interface SerializeOptions {
  /** Wrap movetext at this column. Set to 0 to emit a single long line. */
  readonly lineWidth?: number;
  readonly includeHeaders?: boolean;
  readonly includeComments?: boolean;
  readonly includeVariations?: boolean;
  readonly includeNags?: boolean;
}

export function serializePgn(tree: GameTree, options: SerializeOptions = {}): string {
  const {
    lineWidth = 80,
    includeHeaders = true,
    includeComments = true,
    includeVariations = true,
    includeNags = true,
  } = options;

  const tokens: string[] = [];
  const root = mustGetNode(tree, tree.rootId);

  if (includeComments) {
    // The starting position can carry arrows and highlights of its own; the
    // parser reads them from a comment before the first move, so they are
    // written back the same way rather than lost on the way out.
    const rootComment = formatComment({ text: root.comment ?? '', shapes: root.shapes });
    if (rootComment) tokens.push(`{ ${rootComment} }`);
  }

  writeChildren(tree, root, tokens, true, {
    includeComments,
    includeVariations,
    includeNags,
  });

  const result = tree.headers.Result ?? '*';
  tokens.push(result);

  const movetext = layout(tokens, lineWidth);
  if (!includeHeaders) return movetext;

  return `${serializeHeaders(tree)}\n\n${movetext}\n`;
}

/**
 * The game from one move on, as its own PGN.
 *
 * A study's opening line is often forty moves of which the last twelve are
 * the point, and sharing them meant exporting the whole chapter and asking
 * the reader to scroll. This writes the position at `nodeId` as the start
 * (`[SetUp "1"]` and `[FEN]`, so any reader can set it up) and everything
 * below it — every variation, comment, glyph and arrow — as the movetext.
 * The node's own comment and shapes describe the position reached, so they
 * become the game's opening comment; its NAG describes the move that led
 * here, which is not part of this game, and is left behind. Ply numbers are
 * kept, so "24...Rxe4" is still move 24.
 */
export function serializePgnFrom(
  tree: GameTree,
  nodeId: NodeId,
  options: SerializeOptions = {},
): string {
  if (nodeId === tree.rootId) return serializePgn(tree, options);
  const node = mustGetNode(tree, nodeId);
  const nodes: Record<NodeId, MoveNode> = {};
  for (const id of collectSubtree(tree, nodeId)) {
    if (id === nodeId) continue;
    nodes[id] = mustGetNode(tree, id);
  }
  const root: MoveNode = {
    id: nodeId,
    parentId: null,
    children: node.children,
    move: null,
    fen: node.fen,
    ply: node.ply,
    nags: [],
    shapes: node.shapes,
    meta: {},
    ...(node.comment ? { comment: node.comment } : {}),
  };
  nodes[nodeId] = root;
  // The start is no longer what the headers said it was; the serializer
  // writes the tags for the new one from `startFen`.
  const { SetUp: _setUp, FEN: _fen, ...headers } = tree.headers;
  return serializePgn(
    { rootId: nodeId, nodes, startFen: node.fen, headers, nextId: tree.nextId },
    options,
  );
}

export function serializeHeaders(tree: GameTree): string {
  const tags: [string, string][] = [];
  const seen = new Set<string>();

  for (const key of SEVEN_TAG_ROSTER) {
    tags.push([key, tree.headers[key] ?? DEFAULT_TAGS[key] ?? '?']);
    seen.add(key);
  }

  const custom = tree.startFen !== START_FEN;
  if (custom && !tree.headers.SetUp) {
    tags.push(['SetUp', '1']);
    seen.add('SetUp');
  }
  if (custom && !tree.headers.FEN) {
    tags.push(['FEN', tree.startFen]);
    seen.add('FEN');
  }

  for (const [key, value] of Object.entries(tree.headers)) {
    if (seen.has(key)) continue;
    tags.push([key, value]);
  }

  return tags.map(([key, value]) => `[${key} "${escapeTag(value)}"]`).join('\n');
}

interface WriteOptions {
  readonly includeComments: boolean;
  readonly includeVariations: boolean;
  readonly includeNags: boolean;
}

function writeChildren(
  tree: GameTree,
  parent: MoveNode,
  tokens: string[],
  forceNumber: boolean,
  options: WriteOptions,
): void {
  const [mainId, ...alternativeIds] = parent.children;
  if (!mainId) return;

  const main = mustGetNode(tree, mainId);
  const wroteComment = writeMove(main, tokens, forceNumber, options);

  let branched = false;
  if (options.includeVariations) {
    for (const altId of alternativeIds) {
      tokens.push('(');
      const alt = mustGetNode(tree, altId);
      const altComment = writeMove(alt, tokens, true, options);
      writeChildren(tree, alt, tokens, altComment, options);
      tokens.push(')');
      branched = true;
    }
  }

  // After a comment or a side line, a reader needs the move number again.
  writeChildren(tree, main, tokens, wroteComment || branched, options);
}

/** Returns true when trailing content means the next move must repeat its number. */
function writeMove(
  node: MoveNode,
  tokens: string[],
  forceNumber: boolean,
  options: WriteOptions,
): boolean {
  const move = node.move;
  if (!move) return false;

  if (options.includeComments && node.preComment) tokens.push(`{ ${node.preComment} }`);

  const isWhite = node.ply % 2 === 1;
  const number = moveNumberOfPly(node.ply);
  if (isWhite) tokens.push(`${number}.`);
  else if (forceNumber || node.preComment) tokens.push(`${number}...`);

  tokens.push(move.san);

  if (options.includeNags) {
    for (const nag of node.nags) tokens.push(`$${nag}`);
  }

  const commentText = options.includeComments
    ? formatComment({
        text: node.comment ?? '',
        shapes: node.shapes,
        ...(node.evaluation ? { score: node.evaluation.score } : {}),
        ...(node.meta.clockSeconds !== undefined ? { clockSeconds: node.meta.clockSeconds } : {}),
        ...(node.meta.elapsedSeconds !== undefined
          ? { elapsedSeconds: node.meta.elapsedSeconds }
          : {}),
      })
    : '';

  if (commentText) {
    tokens.push(`{ ${commentText} }`);
    return true;
  }
  return false;
}

/**
 * Join tokens into movetext, wrapping at `width` columns (0 disables wrapping).
 * Parentheses hug their contents the way every PGN reader expects: `(2. Bc4)`.
 */
function layout(tokens: readonly string[], width: number): string {
  const lines: string[] = [];
  let current = '';
  let previous = '';

  for (const token of tokens) {
    const glued = previous === '(' || token === ')';
    if (current === '') {
      current = token;
      previous = token;
      continue;
    }
    const candidate = current + (glued ? '' : ' ') + token;
    if (width > 0 && candidate.length > width && !glued) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
    previous = token;
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}

const escapeTag = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Just the moves, e.g. for pasting a line into a chat message. */
export function serializeMovetext(tree: GameTree, nodeIds: readonly NodeId[]): string {
  const tokens: string[] = [];
  let expectNumber = true;

  for (const id of nodeIds) {
    const node = tree.nodes[id];
    if (!node?.move) continue;
    const isWhite = node.ply % 2 === 1;
    const number = moveNumberOfPly(node.ply);
    if (isWhite) tokens.push(`${number}.`);
    else if (expectNumber) tokens.push(`${number}...`);
    tokens.push(node.move.san);
    expectNumber = false;
  }

  return tokens.join(' ');
}
