/**
 * `GameTree` → PGN.
 *
 * The output aims to be readable by a human and losslessly re-readable by this
 * parser: variations nest, comments keep their structured commands, and move
 * numbers are repeated wherever a reader would otherwise lose the thread.
 */

import { START_FEN } from '../fen';
import { formatComment } from './comment-commands';
import { mustGetNode } from '../tree/tree';
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

  if (includeComments && root.comment) tokens.push(`{ ${root.comment} }`);

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
