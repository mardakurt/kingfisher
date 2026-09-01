/**
 * PGN → `GameTree`.
 *
 * Variations are the reason this parser exists: `chess.js` (and most simple
 * importers) flatten a game to its main line, which would throw away exactly
 * the data this application is built around. Parsing is recovery-oriented — a
 * single illegal move truncates the variation it appears in and is reported,
 * rather than failing the whole file.
 */

import { Position } from '../position';
import { START_FEN } from '../fen';
import { fail, ok, type Result } from '../result';
import { addMove, createTree, mustGetNode, setComment, setPreComment } from '../tree/tree';
import type { GameTree, NodeId } from '../tree/types';
import { parseComment } from './comment-commands';
import { tokenize, type Token } from './lexer';

export interface PgnIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly line?: number;
}

export interface ParsedGame {
  readonly tree: GameTree;
  readonly issues: readonly PgnIssue[];
}

export interface ParsePgnResult {
  readonly games: readonly ParsedGame[];
  readonly issues: readonly PgnIssue[];
}

/** Parse a file that may hold any number of games. */
export function parsePgn(source: string): ParsePgnResult {
  const tokens = tokenize(source);
  const games: ParsedGame[] = [];
  const issues: PgnIssue[] = [];

  let cursor = 0;
  while (cursor < tokens.length) {
    const before = cursor;
    const parsed = parseOneGame(tokens, cursor);
    cursor = parsed.nextIndex;
    if (parsed.game) games.push(parsed.game);
    // Defensive: never loop on a token the game parser refused to consume.
    if (cursor <= before) cursor = before + 1;
  }

  if (games.length === 0) {
    issues.push({ severity: 'error', message: 'No games found in this PGN.' });
  }
  return { games, issues };
}

/** Parse exactly one game, failing when the text contains none. */
export function parseSingleGame(source: string): Result<ParsedGame> {
  const { games } = parsePgn(source);
  const first = games[0];
  if (!first) return fail('invalid-pgn', 'No games found in this PGN.');
  return ok(first);
}

interface GameParse {
  readonly game: ParsedGame | null;
  readonly nextIndex: number;
}

interface Frame {
  readonly cursor: NodeId;
  readonly lastMove: NodeId | null;
  readonly pending: string[];
}

function parseOneGame(tokens: readonly Token[], start: number): GameParse {
  const issues: PgnIssue[] = [];
  const headers: Record<string, string> = {};

  let index = start;
  while (index < tokens.length && tokens[index]?.type === 'tag') {
    const token = tokens[index] as Token;
    if (token.key) headers[token.key] = token.value;
    index += 1;
  }

  const startFen = resolveStartPosition(headers, issues);
  let tree = createTree(startFen.fen, headers);

  let cursor: NodeId = tree.rootId;
  let lastMove: NodeId | null = null;
  let pending: string[] = [];
  const stack: Frame[] = [];

  // Set while discarding the remainder of a variation that failed to parse.
  let skipping = false;
  let skipNesting = 0;
  let sawMovetext = false;

  const flushPendingTo = (nodeId: NodeId) => {
    if (pending.length === 0) return;
    tree = setPreComment(tree, nodeId, pending.join(' '));
    pending = [];
  };

  while (index < tokens.length) {
    const token = tokens[index] as Token;

    // A tag pair after movetext means the next game has begun.
    if (token.type === 'tag') {
      if (sawMovetext || Object.keys(headers).length > 0) break;
    }

    index += 1;

    if (skipping) {
      if (token.type === 'variation-start') {
        skipNesting += 1;
        continue;
      }
      if (token.type === 'variation-end') {
        if (skipNesting === 0) skipping = false;
        else {
          skipNesting -= 1;
          continue;
        }
      } else {
        continue;
      }
    }

    switch (token.type) {
      case 'move-number':
        break;

      case 'move': {
        sawMovetext = true;
        const played = Position.fromTrustedFen(mustGetNode(tree, cursor).fen).playSan(token.value);
        if (!played.ok) {
          issues.push({
            severity: 'error',
            message: `Illegal move "${token.value}"; the rest of this variation was skipped.`,
            line: token.line,
          });
          skipping = true;
          skipNesting = 0;
          break;
        }
        const result = addMove(tree, cursor, played.value);
        tree = result.tree;
        cursor = result.nodeId;
        lastMove = result.nodeId;
        flushPendingTo(result.nodeId);
        break;
      }

      case 'comment': {
        const data = parseComment(token.value);
        if (lastMove) {
          tree = applyCommentData(tree, lastMove, data, token.value);
        } else if (cursor === tree.rootId && stack.length === 0) {
          // Commentary before the first move belongs to the game, not a move.
          const existing = tree.nodes[tree.rootId]?.comment;
          tree = setComment(tree, tree.rootId, [existing, data.text].filter(Boolean).join(' '));
          if (data.shapes.length > 0) {
            tree = {
              ...tree,
              nodes: {
                ...tree.nodes,
                [tree.rootId]: { ...mustGetNode(tree, tree.rootId), shapes: data.shapes },
              },
            };
          }
        } else if (data.text) {
          pending.push(data.text);
        }
        break;
      }

      case 'nag': {
        const code = Number(token.value);
        if (lastMove && Number.isFinite(code) && code > 0) {
          const node = mustGetNode(tree, lastMove);
          if (!node.nags.includes(code)) {
            tree = {
              ...tree,
              nodes: {
                ...tree.nodes,
                [lastMove]: { ...node, nags: [...node.nags, code].sort((a, b) => a - b) },
              },
            };
          }
        }
        break;
      }

      case 'variation-start': {
        if (!lastMove) {
          issues.push({
            severity: 'warning',
            message: 'A variation was opened before any move; it was skipped.',
            line: token.line,
          });
          skipping = true;
          skipNesting = 0;
          break;
        }
        stack.push({ cursor, lastMove, pending });
        cursor = mustGetNode(tree, lastMove).parentId ?? tree.rootId;
        lastMove = null;
        pending = [];
        break;
      }

      case 'variation-end': {
        const frame = stack.pop();
        if (!frame) {
          issues.push({
            severity: 'warning',
            message: 'Unmatched ")" in movetext.',
            line: token.line,
          });
          break;
        }
        cursor = frame.cursor;
        lastMove = frame.lastMove;
        pending = frame.pending;
        break;
      }

      case 'result': {
        sawMovetext = true;
        if (stack.length === 0) {
          if (!headers.Result) headers.Result = token.value;
          return { game: { tree: { ...tree, headers: { ...headers } }, issues }, nextIndex: index };
        }
        break;
      }

      case 'unknown':
        issues.push({
          severity: 'warning',
          message: `Skipped unrecognised text "${truncate(token.value)}".`,
          line: token.line,
        });
        break;

      case 'tag':
        break;
    }
  }

  if (stack.length > 0) {
    issues.push({ severity: 'warning', message: 'Movetext ended inside an unclosed variation.' });
  }

  const hasContent = sawMovetext || Object.keys(headers).length > 0;
  if (!hasContent) return { game: null, nextIndex: index };

  return { game: { tree: { ...tree, headers: { ...headers } }, issues }, nextIndex: index };
}

function applyCommentData(
  tree: GameTree,
  nodeId: NodeId,
  data: ReturnType<typeof parseComment>,
  raw: string,
): GameTree {
  const node = mustGetNode(tree, nodeId);
  const text = data.text || (data.shapes.length === 0 && !data.score ? raw.trim() : '');
  const merged = [node.comment, text].filter(Boolean).join(' ').trim();

  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: {
        ...node,
        ...(merged ? { comment: merged } : {}),
        shapes: data.shapes.length > 0 ? [...node.shapes, ...data.shapes] : node.shapes,
        ...(data.score
          ? { evaluation: { ...node.evaluation, score: data.score, engine: 'PGN' } }
          : {}),
        meta: {
          ...node.meta,
          ...(data.clockSeconds !== undefined ? { clockSeconds: data.clockSeconds } : {}),
          ...(data.elapsedSeconds !== undefined ? { elapsedSeconds: data.elapsedSeconds } : {}),
        },
      },
    },
  };
}

function resolveStartPosition(
  headers: Record<string, string>,
  issues: PgnIssue[],
): { fen: typeof START_FEN } {
  const declared = headers.FEN;
  if (!declared) return { fen: START_FEN };

  const parsed = Position.fromFen(declared);
  if (!parsed.ok) {
    issues.push({
      severity: 'error',
      message: `The FEN tag is invalid (${parsed.error.message}); the standard start position was used.`,
    });
    return { fen: START_FEN };
  }
  return { fen: parsed.value.fen };
}

const truncate = (text: string, max = 24): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;
