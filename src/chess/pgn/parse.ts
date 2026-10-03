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
  /** Games read and deliberately not returned; see `PgnRefusal`. */
  readonly refused: readonly PgnRefusal[];
}

/**
 * A game the parser read and would not return.
 *
 * Kingfisher plays standard chess only, and a game it cannot play from the
 * position it was played from has no honest tree. The parser used to build
 * one anyway: an unreadable `[FEN]` became the standard start, and a
 * `[Variant "Chess960"]` tag was never looked at, so a Lichess export of
 * Chess960 games was replayed from RNBQKBNR until the first move that did not
 * fit, stored, classified ("A00 Ware Opening") and indexed into the explorer.
 * Refusing here is what makes every importer — the browser, the companion,
 * the kit — refuse it too.
 */
export interface PgnRefusal {
  readonly reason: 'variant' | 'start-position';
  /** The `[Variant]` tag as written, for `variant`. */
  readonly variant?: string;
  readonly message: string;
  /** "White – Black", when the tags name them. */
  readonly game?: string;
}

/**
 * Incremental facade over the one authoritative parser.
 *
 * It tokenizes once, then lets a Worker parse bounded groups of games and yield
 * between them for cancellation/back-pressure.  `parseOneGame` remains the
 * only grammar implementation, so worker imports cannot drift from ordinary
 * PGN loading.
 */
export interface PgnParserSession {
  readonly done: boolean;
  readonly parsedGames: number;
  readonly issues: readonly PgnIssue[];
  readonly refused: readonly PgnRefusal[];
  next(): ParsedGame | null;
}

export function createPgnParser(source: string): PgnParserSession {
  const tokens = tokenize(source);
  const issues: PgnIssue[] = [];
  const refused: PgnRefusal[] = [];
  let cursor = 0;
  let parsedGames = 0;
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    if (parsedGames === 0) {
      issues.push({
        severity: 'error',
        message:
          refused.length > 0
            ? `No standard chess games found in this PGN. ${describeRefusals(refused)}`
            : 'No games found in this PGN.',
      });
    }
  };

  return {
    get done() {
      const complete = cursor >= tokens.length;
      if (complete) finalize();
      return complete;
    },
    get parsedGames() {
      return parsedGames;
    },
    get issues() {
      return issues;
    },
    get refused() {
      return refused;
    },
    next() {
      while (cursor < tokens.length) {
        const before = cursor;
        const parsed = parseOneGame(tokens, cursor);
        cursor = parsed.nextIndex;
        // Defensive: never loop on a token the game parser refused to consume.
        if (cursor <= before) cursor = before + 1;
        if (parsed.refused) refused.push(parsed.refused);
        if (parsed.game) {
          parsedGames += 1;
          return parsed.game;
        }
      }
      finalize();
      return null;
    },
  };
}

/** Parse a file that may hold any number of games. */
export function parsePgn(source: string): ParsePgnResult {
  const parser = createPgnParser(source);
  const games: ParsedGame[] = [];
  while (!parser.done) {
    const game = parser.next();
    if (game) games.push(game);
  }
  return { games, issues: parser.issues, refused: parser.refused };
}

/** Parse exactly one game, failing when the text contains none. */
export function parseSingleGame(source: string): Result<ParsedGame> {
  const { games, refused } = parsePgn(source);
  const first = games[0];
  if (!first) {
    return fail('invalid-pgn', refused[0] ? refused[0].message : 'No games found in this PGN.');
  }
  return ok(first);
}

/**
 * One sentence for an import summary: how many games were refused and why,
 * grouped by variant so a file of Chess960 says "33 Chess960 games", not
 * thirty-three lines.
 */
export function describeRefusals(refused: readonly PgnRefusal[]): string {
  if (refused.length === 0) return '';
  const groups = new Map<string, number>();
  for (const refusal of refused) {
    const label =
      refusal.reason === 'variant' ? (refusal.variant ?? 'variant') : 'unreadable start position';
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  const parts = [...groups].map(([label, count]) =>
    label === 'unreadable start position'
      ? `${count} game${count === 1 ? '' : 's'} with an unreadable [FEN] tag`
      : `${count} ${label} game${count === 1 ? '' : 's'}`,
  );
  return `${parts.join(', ')} not imported: Kingfisher plays standard chess only, from a position it can read.`;
}

/** `[Variant]` values that mean standard chess. Lichess writes "From Position" for a standard game set up from a FEN. */
const STANDARD_VARIANTS = new Set([
  '',
  'standard',
  'chess',
  'normal',
  'from position',
  'fromposition',
]);

function refusalOf(headers: Record<string, string>): PgnRefusal | null {
  const players =
    headers.White || headers.Black
      ? `${headers.White ?? '?'} – ${headers.Black ?? '?'}`
      : undefined;
  const variant = (headers.Variant ?? '').trim();
  if (!STANDARD_VARIANTS.has(variant.toLowerCase())) {
    return {
      reason: 'variant',
      variant,
      message: `This is a ${variant} game. Kingfisher plays standard chess only, so it was not imported.`,
      ...(players ? { game: players } : {}),
    };
  }
  const declared = headers.FEN;
  if (declared) {
    const parsed = Position.fromFen(declared);
    if (!parsed.ok) {
      return {
        reason: 'start-position',
        message: `The game's [FEN] tag is not a position Kingfisher can play (${parsed.error.message}), so it was not imported. Replaying its moves from the standard start would invent a different game.`,
        ...(players ? { game: players } : {}),
      };
    }
  }
  return null;
}

interface GameParse {
  readonly game: ParsedGame | null;
  readonly nextIndex: number;
  readonly refused?: PgnRefusal;
}

/**
 * Step over a refused game's movetext without playing it: to its result
 * outside any variation, or to the next game's tags.
 */
function skipMovetext(tokens: readonly Token[], start: number): number {
  let index = start;
  let depth = 0;
  let sawMovetext = false;
  while (index < tokens.length) {
    const token = tokens[index] as Token;
    if (token.type === 'tag' && sawMovetext) return index;
    index += 1;
    if (token.type === 'variation-start') depth += 1;
    else if (token.type === 'variation-end') depth = Math.max(0, depth - 1);
    else if (token.type === 'result' && depth === 0) return index;
    else if (token.type !== 'tag') sawMovetext = true;
  }
  return index;
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

  const refused = refusalOf(headers);
  if (refused) return { game: null, nextIndex: skipMovetext(tokens, index), refused };

  const startFen = resolveStartPosition(headers);
  let tree = createTree(startFen.fen, headers);

  let cursor: NodeId = tree.rootId;
  /*
    The rules engine is carried along the line rather than rebuilt per move.
    `seek` is the only way `cursor` moves without a move being played, so it is
    also the only place that has to pay for a fresh engine — which is what
    entering or leaving a variation costs, and nothing else.
  */
  let position = Position.fromTrustedFen(mustGetNode(tree, cursor).fen);
  const seek = (nodeId: NodeId) => {
    cursor = nodeId;
    position = Position.fromTrustedFen(mustGetNode(tree, nodeId).fen);
  };
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
        const played = position.advanceSan(token.value);
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
        const result = addMove(tree, cursor, played.value.move);
        tree = result.tree;
        cursor = result.nodeId;
        position = played.value.next;
        lastMove = result.nodeId;
        flushPendingTo(result.nodeId);
        break;
      }

      case 'comment': {
        const data = parseComment(token.value);
        if (lastMove) {
          tree = applyCommentData(tree, lastMove, data, token.value);
        } else if (cursor === tree.rootId && stack.length === 0) {
          if (data.videoSeconds !== undefined) {
            const root = mustGetNode(tree, tree.rootId);
            tree = {
              ...tree,
              nodes: {
                ...tree.nodes,
                [tree.rootId]: {
                  ...root,
                  meta: { ...root.meta, videoSeconds: data.videoSeconds },
                },
              },
            };
          }
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
        seek(mustGetNode(tree, lastMove).parentId ?? tree.rootId);
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
        seek(frame.cursor);
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
  /*
    A comment with no visible text keeps its raw form only when nothing in it
    was understood — an unknown command survives as text rather than being
    lost. A clock or elapsed-time command *is* understood and lives in
    `meta`; falling back to the raw text for those re-emitted "[%clk …]" as a
    comment beside the clock the serializer writes from meta, and every
    round trip through export and import doubled it.
  */
  const understood =
    data.shapes.length > 0 ||
    data.score !== undefined ||
    data.clockSeconds !== undefined ||
    data.elapsedSeconds !== undefined ||
    data.question !== undefined ||
    data.questionPoints !== undefined ||
    data.questionSeconds !== undefined ||
    data.videoSeconds !== undefined;
  const text = data.text || (understood ? '' : raw.trim());
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
          ...(data.question !== undefined ? { question: data.question } : {}),
          ...(data.questionPoints !== undefined ? { questionPoints: data.questionPoints } : {}),
          ...(data.questionSeconds !== undefined ? { questionSeconds: data.questionSeconds } : {}),
          ...(data.videoSeconds !== undefined ? { videoSeconds: data.videoSeconds } : {}),
        },
      },
    },
  };
}

/** The game's start position. `refusalOf` has already refused a `[FEN]` that does not parse. */
function resolveStartPosition(headers: Record<string, string>): { fen: typeof START_FEN } {
  const declared = headers.FEN;
  if (!declared) return { fen: START_FEN };
  const parsed = Position.fromFen(declared);
  return { fen: parsed.ok ? parsed.value.fen : START_FEN };
}

const truncate = (text: string, max = 24): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;
