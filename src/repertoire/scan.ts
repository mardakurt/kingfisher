/**
 * The repertoire scan: which games in a collection matter to my repertoire,
 * and where each one leaves it.
 *
 * ChessBase's "Repertoire scan" answers the question a player asks after a
 * new batch of games arrives — a tournament download, a magazine, their own
 * week of blitz: what is new in my openings? Kingfisher asks it of any
 * collection and answers per game, by position, so a transposition into a
 * prepared position counts as reaching it.
 *
 * A game that reaches the repertoire leaves it in one of three ways, and the
 * three are different news, never one list:
 *
 * - **A new move against your line**: the other side played something the
 *   repertoire has not prepared for, at a position where it has prepared
 *   replies. The finding a scan exists for.
 * - **Another choice for your side**: a player on the repertoire's side chose
 *   differently from the repertoire. Somebody else's idea in your line.
 * - **Past your preparation**: the game followed every prepared move and went
 *   on after the repertoire stops — the continuation, in a real game, of the
 *   line you know.
 *
 * Only games that left the repertoire at least `minimumPlies` half-moves into
 * the game are reported: at the root every game "reaches" a repertoire, and
 * a scan that listed every 1.b3 against a 1.e4 e5 repertoire would bury the
 * games that matter. Deepest first, because the deep departure is the one in
 * the line you have worked on.
 */

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { mainlinePath, mustGetNode } from '@/chess/tree/tree';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import type { Fen, Uci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import type { RepertoireIndex } from './index';

export type ScanKind = 'new-move' | 'own-alternative' | 'past-preparation';

export const SCAN_KIND_ORDER: readonly ScanKind[] = [
  'new-move',
  'own-alternative',
  'past-preparation',
];

export interface ScanFinding {
  readonly kind: ScanKind;
  /** Ply of the move that left the repertoire; the game opens after it. */
  readonly ply: number;
  readonly nodeId: NodeId;
  readonly san: string;
  readonly uci: Uci;
  /** What the repertoire has at that position, by SAN; empty past the preparation. */
  readonly expected: readonly string[];
  /** The position the move was played from, which groups findings. */
  readonly positionKey: string;
  readonly fen: Fen;
  /** Half-moves from the start of the game to that position. */
  readonly depth: number;
}

/** Eight half-moves: four moves each way inside the repertoire. */
export const DEFAULT_MINIMUM_PLIES = 8;

const ownMoves = (record: RepertoirePositionRecord | undefined) =>
  record?.moves.filter((move) => !move.expected && move.role !== 'avoid') ?? [];
const recordedReplies = (record: RepertoirePositionRecord | undefined) =>
  record?.moves.filter((move) => move.expected) ?? [];

/**
 * The replies the repertoire is ready for at a position where the other side
 * moves: the ones recorded as expected, and every legal move that leads to a
 * position the repertoire answers. A repertoire written from lines records
 * only its own moves, so the second half is what knows that after 3...a6 the
 * repertoire has 4.Ba4 — and therefore that 3...Nf6 is new.
 */
function preparedReplies(fen: Fen, index: RepertoireIndex): string[] {
  const known = new Set(recordedReplies(index.get(positionKey(fen))).map((move) => move.san));
  const position = Position.fromFen(fen);
  if (position.ok) {
    for (const move of position.value.legalMoves()) {
      if (ownMoves(index.get(positionKey(move.after))).length > 0) known.add(move.san);
    }
  }
  return [...known];
}

/**
 * Where a game left the repertoire, if it went deep enough to matter.
 *
 * The walk is by position. A position is prepared when it is the
 * repertoire's move and the repertoire has one there, or the other side's
 * move right after a prepared move was played (or with recorded replies).
 * The departure is the move played from the *last* prepared position the
 * game reached — so a game that transposes back into the line is followed
 * back into it, and only the final way out is reported.
 */
export function scanAgainstRepertoire(
  tree: GameTree,
  color: 'w' | 'b',
  index: RepertoireIndex,
  minimumPlies = DEFAULT_MINIMUM_PLIES,
): ScanFinding | null {
  const nodes: MoveNode[] = mainlinePath(tree).map((id) => mustGetNode(tree, id));
  if (nodes.length < 2) return null;
  const startPly = nodes[0]!.ply;

  let last = -1;
  let playedPrepared = false;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const record = index.get(positionKey(node.fen));
    const next = nodes[i + 1];
    const ours = Position.fromTrustedFen(node.fen).turn === color;
    const prepared: boolean = ours
      ? ownMoves(record).length > 0
      : playedPrepared || recordedReplies(record).length > 0;
    if (prepared) last = i;
    playedPrepared =
      ours &&
      prepared &&
      Boolean(next?.move) &&
      ownMoves(record).some((m) => m.uci === next!.move!.uci);
  }
  if (last < 0) return null;
  const from = nodes[last]!;
  const depth = from.ply - startPly;
  if (depth < minimumPlies) return null;

  const played = nodes[last + 1];
  if (!played?.move) return null;
  const finding = (kind: ScanKind, node: MoveNode, parent: MoveNode, expected: string[]) => ({
    kind,
    ply: node.ply,
    nodeId: node.id,
    san: node.move!.san,
    uci: node.move!.uci,
    expected,
    positionKey: positionKey(parent.fen),
    fen: parent.fen,
    depth: parent.ply - startPly,
  });

  if (Position.fromTrustedFen(from.fen).turn === color) {
    const own = ownMoves(index.get(positionKey(from.fen)));
    if (!own.some((move) => move.uci === played.move!.uci)) {
      return finding(
        'own-alternative',
        played,
        from,
        own.map((move) => move.san),
      );
    }
    // The prepared move was played and the line ends there: what the other
    // side did next is the game going on past the preparation.
    const after = nodes[last + 2];
    return after?.move ? finding('past-preparation', after, played, []) : null;
  }

  const replies = preparedReplies(from.fen, index);
  if (replies.length === 0 || replies.includes(played.move.san)) {
    // No reply prepared here at all, or a recorded reply whose position the
    // repertoire does not continue: the game goes on past the preparation.
    return finding('past-preparation', played, from, []);
  }
  return finding('new-move', played, from, replies);
}

/** One departure — a move at a position — and the games that made it. */
export interface ScanGroup<G> {
  readonly kind: ScanKind;
  readonly positionKey: string;
  readonly fen: Fen;
  readonly san: string;
  readonly expected: readonly string[];
  /** The deepest position, in half-moves, at which a game made this departure. */
  readonly depth: number;
  readonly games: readonly { readonly game: G; readonly finding: ScanFinding }[];
}

/**
 * Findings grouped by what happened where: the same move from the same
 * position is one row with its games under it, however many move orders led
 * there. Within a kind, the deepest departure first, then the most games.
 */
export function groupFindings<G>(
  findings: readonly { readonly game: G; readonly finding: ScanFinding }[],
): Readonly<Record<ScanKind, readonly ScanGroup<G>[]>> {
  const groups = new Map<string, ScanGroup<G> & { games: { game: G; finding: ScanFinding }[] }>();
  for (const entry of findings) {
    const { finding } = entry;
    const key = `${finding.kind}|${finding.positionKey}|${finding.uci}`;
    const group = groups.get(key);
    if (group) {
      group.games.push(entry);
      if (finding.depth > group.depth) groups.set(key, { ...group, depth: finding.depth });
    } else {
      groups.set(key, {
        kind: finding.kind,
        positionKey: finding.positionKey,
        fen: finding.fen,
        san: finding.san,
        expected: finding.expected,
        depth: finding.depth,
        games: [entry],
      });
    }
  }
  const byKind: Record<ScanKind, ScanGroup<G>[]> = {
    'new-move': [],
    'own-alternative': [],
    'past-preparation': [],
  };
  for (const group of groups.values()) byKind[group.kind].push(group);
  for (const kind of SCAN_KIND_ORDER) {
    byKind[kind].sort(
      (a, b) => b.depth - a.depth || b.games.length - a.games.length || a.san.localeCompare(b.san),
    );
  }
  return byKind;
}
