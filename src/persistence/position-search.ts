/**
 * "Where does this position appear in my work?"
 *
 * Paste a FEN, get every place it is stored: games, study chapters, repertoire
 * decisions, training items, model games, endgame positions, opening files,
 * preparation sheets and decision records.
 *
 * The whole thing works because of one decision made in Phase 2 and never
 * bent since: everything that refers to a position stores its *canonical key*
 * (ADR 0009). So this is a set of index lookups rather than a scan, a
 * transposition is found automatically, and a FEN that differs only in its
 * move counters matches — which is what a player pasting a position from
 * somewhere else needs, and what a naive string comparison would fail at.
 */

import { parseFen, positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn/parse';
import { pawnSkeletonKey } from '@/chess/structure';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { AppRepositories } from './types';

export type PositionHitKind =
  | 'game'
  | 'chapter'
  | 'repertoire'
  | 'training'
  | 'model-game'
  | 'endgame'
  | 'opening-file'
  | 'preparation'
  | 'decision'
  | 'critical-position'
  | 'team';

export interface PositionHit {
  readonly id: string;
  readonly kind: PositionHitKind;
  readonly title: string;
  readonly subtitle?: string;
  /** What to open: a game id, chapter id, file id, and so on. */
  readonly targetId: string;
  /** Where in a game, when the hit is a move rather than a whole document. */
  readonly ply?: number;
  /** The node inside a chapter or hand-in, so opening the hit lands on the move. */
  readonly nodeId?: string;
  /** The container of the target: a chapter's study, an assignment's team. */
  readonly parentId?: string;
  /** For a structure hit: the move at which the skeleton first appears. */
  readonly san?: string;
}

export interface PositionSearchResult {
  readonly positionKey: string;
  readonly hits: readonly PositionHit[];
  /**
   * Work that holds the same pawn skeleton without holding the position:
   * the study where you had this structure with the pieces elsewhere. One
   * hit per document, at the first move the skeleton appears; games are
   * left to the structure search, which has an index for them.
   */
  readonly structure: readonly PositionHit[];
  /** The skeleton the structure hits share, as `pawnSkeletonKey` writes it. */
  readonly pawnSkeleton: string | null;
  /** True when the input could not be read as a position at all. */
  readonly unreadable: boolean;
}

/**
 * Everything stored about one position.
 *
 * Takes a FEN or a canonical key: a player pastes whichever they have, and
 * refusing the one they happened to copy would be pedantry.
 */
export async function searchByPosition(
  repositories: AppRepositories,
  input: string,
  limit = 40,
): Promise<PositionSearchResult> {
  const trimmed = input.trim();
  const key = canonicalise(trimmed);
  if (!key)
    return { positionKey: '', hits: [], structure: [], pawnSkeleton: null, unreadable: true };
  const skeleton = parseFen(trimmed).ok ? pawnSkeletonKey(trimmed) : null;

  const [
    games,
    endgames,
    files,
    decisions,
    reviewItems,
    links,
    training,
    repertoires,
    sessions,
    studies,
    teams,
  ] = await Promise.all([
    // The exact-position search the structure index already supports, which
    // is one indexed lookup rather than a walk through every stored game.
    repositories.games.searchStructures({
      mode: 'exact-position',
      positionKey: key,
      // The other identities are not consulted in exact-position mode, but
      // the query type asks for them, so they are given honestly empty.
      pawnSkeleton: '',
      structureSignature: '',
      claims: [],
      limit: 12,
    }),
    repositories.endgames.forPosition(key),
    repositories.openingFiles.forPosition(key),
    repositories.review.listDecisions(500),
    repositories.review.reviewItemsForPosition(key),
    repositories.modelGames.list(),
    repositories.training.list(),
    repositories.repertoires.list(),
    repositories.preparation.list(),
    repositories.studies.list(),
    repositories.team.listTeams(),
  ]);

  const hits: PositionHit[] = [];
  const add = (hit: PositionHit) => {
    if (hits.length < limit && !hits.some((candidate) => candidate.id === hit.id)) hits.push(hit);
  };
  const structure: PositionHit[] = [];
  const addStructure = (hit: PositionHit) => {
    if (structure.length < limit && !structure.some((candidate) => candidate.id === hit.id)) {
      structure.push(hit);
    }
  };

  /*
    Studies are where a player's own analysis lives, and were the one store
    this search did not read — "impossible to search" is the complaint every
    study tool gets. Every node of every chapter is walked, variations
    included: a position noted as a sideline is exactly the one a player
    cannot find again.
  */
  for (const summary of studies) {
    const study = await repositories.studies.get(summary.id);
    if (!study) continue;
    for (const chapter of study.chapters) {
      const found = findInTree(chapter.tree, key, skeleton);
      if (found.exact) {
        add({
          id: `chapter:${chapter.id}`,
          kind: 'chapter',
          title: `${study.study.title} · ${chapter.title}`,
          subtitle: found.exact.san
            ? `at ${moveLabel(found.exact.ply, found.exact.san)}`
            : undefined,
          targetId: chapter.id,
          parentId: study.study.id,
          ply: found.exact.ply,
          nodeId: found.exact.nodeId,
        });
      } else if (found.structure) {
        addStructure({
          id: `chapter:${chapter.id}`,
          kind: 'chapter',
          title: `${study.study.title} · ${chapter.title}`,
          subtitle: found.structure.san
            ? `same pawns from ${moveLabel(found.structure.ply, found.structure.san)}`
            : 'same pawns',
          targetId: chapter.id,
          parentId: study.study.id,
          ply: found.structure.ply,
          nodeId: found.structure.nodeId,
          ...(found.structure.san ? { san: found.structure.san } : {}),
        });
      }
    }
  }

  /*
    Team hand-ins carry their board as PGN. A position a second sent last
    week is as much the player's work as a chapter, and a search that could
    not see it would send them back to the thread to scroll.
  */
  for (const team of teams) {
    const assignments = await repositories.team.listAssignments(team.id);
    for (const assignment of assignments) {
      for (const handover of assignment.handovers) {
        if (!handover.pgn) continue;
        const tree = parsePgn(handover.pgn).games[0]?.tree;
        if (!tree) continue;
        const found = findInTree(tree, key, skeleton);
        const who = `${handover.kind === 'hand-in' ? 'hand-in' : handover.kind} by ${handover.authorName}`;
        if (found.exact) {
          add({
            id: `team:${assignment.id}:${handover.id}`,
            kind: 'team',
            title: `${team.name} · ${assignment.title}`,
            subtitle: who,
            targetId: assignment.id,
            parentId: team.id,
            ply: found.exact.ply,
            nodeId: found.exact.nodeId,
          });
          break;
        } else if (found.structure) {
          addStructure({
            id: `team:${assignment.id}:${handover.id}`,
            kind: 'team',
            title: `${team.name} · ${assignment.title}`,
            subtitle: `${who} · same pawns`,
            targetId: assignment.id,
            parentId: team.id,
            ply: found.structure.ply,
            nodeId: found.structure.nodeId,
          });
        }
      }
    }
  }

  for (const row of games) {
    add({
      id: `game:${row.game.id}`,
      kind: 'game',
      title: `${row.game.white} – ${row.game.black}`,
      subtitle: [row.game.event, row.game.date].filter(Boolean).join(' · ') || undefined,
      targetId: row.game.id,
      ply: row.position.ply,
    });
  }

  for (const record of endgames) {
    add({
      id: `endgame:${record.id}`,
      kind: 'endgame',
      title: record.title,
      subtitle: `${record.pieceCount} pieces`,
      targetId: record.id,
    });
  }

  for (const file of files) {
    add({
      id: `file:${file.id}`,
      kind: 'opening-file',
      title: file.name,
      subtitle: file.color === 'w' ? 'White' : 'Black',
      targetId: file.id,
    });
  }

  for (const decision of decisions) {
    if (decision.positionKey !== key) continue;
    add({
      id: `decision:${decision.id}`,
      kind: 'decision',
      title: 'Recorded decision',
      subtitle: decision.plan ?? `${decision.candidates.length} candidates`,
      targetId: decision.id,
    });
  }

  for (const item of reviewItems) {
    add({
      id: `review:${item.id}`,
      kind: 'critical-position',
      title: item.gameLabel ?? 'Critical position',
      subtitle: item.reason ?? item.status,
      targetId: item.id,
    });
  }

  for (const link of links) {
    if (link.positionKey !== key) continue;
    add({
      id: `model:${link.id}`,
      kind: 'model-game',
      title: link.note ?? 'Model game',
      subtitle: link.purpose,
      targetId: link.gameId,
    });
  }

  for (const item of training) {
    if (item.positionKey !== key) continue;
    add({
      id: `training:${item.id}`,
      kind: 'training',
      title: item.prompt,
      subtitle: item.mode,
      targetId: item.id,
    });
  }

  for (const repertoire of repertoires) {
    const loaded = await repositories.repertoires.get(repertoire.id);
    const position = loaded?.positions.find((entry) => entry.positionKey === key);
    if (position) {
      add({
        id: `repertoire:${repertoire.id}`,
        kind: 'repertoire',
        title: repertoire.title,
        subtitle: position.moves.map((move) => move.san).join(', ') || 'No move recorded',
        targetId: repertoire.id,
      });
      continue;
    }
    if (!skeleton || !loaded) continue;
    const alike = loaded.positions
      .filter((entry) => pawnSkeletonKey(entry.fen) === skeleton)
      .sort((a, b) => a.depth - b.depth)[0];
    if (alike) {
      addStructure({
        id: `repertoire:${repertoire.id}`,
        kind: 'repertoire',
        title: repertoire.title,
        subtitle: `same pawns at depth ${alike.depth}`,
        targetId: repertoire.id,
        ply: alike.depth,
      });
    }
  }

  for (const session of sessions) {
    if (!session.sheet.some((card: { positionKey: string }) => card.positionKey === key)) {
      continue;
    }
    add({
      id: `preparation:${session.id}`,
      kind: 'preparation',
      title: session.title,
      subtitle: session.opponent ? `vs ${session.opponent}` : 'Game-day sheet',
      targetId: session.id,
    });
  }

  return { positionKey: key, hits, structure, pawnSkeleton: skeleton, unreadable: false };
}

interface TreeFind {
  readonly exact: { readonly nodeId: NodeId; readonly ply: number; readonly san?: string } | null;
  readonly structure: {
    readonly nodeId: NodeId;
    readonly ply: number;
    readonly san?: string;
  } | null;
}

/**
 * The first node of a tree holding the position, and — failing that — the
 * shallowest holding the pawn skeleton. Every node is visited, variations
 * included; "first" is by ply, so the hit is the earliest the position (or
 * the structure) appears, whichever branch it appears in.
 */
function findInTree(tree: GameTree, key: string, skeleton: string | null): TreeFind {
  let exact: TreeFind['exact'] = null;
  let structure: TreeFind['structure'] = null;
  for (const node of Object.values(tree.nodes)) {
    const san = node.move?.san;
    if (positionKey(node.fen) === key) {
      if (!exact || node.ply < exact.ply)
        exact = { nodeId: node.id, ply: node.ply, ...(san ? { san } : {}) };
      continue;
    }
    if (
      skeleton &&
      (!structure || node.ply < structure.ply) &&
      pawnSkeletonKey(node.fen) === skeleton
    ) {
      structure = { nodeId: node.id, ply: node.ply, ...(san ? { san } : {}) };
    }
  }
  return { exact, structure };
}

const moveLabel = (ply: number, san: string) =>
  `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '…'}${san}`;

/**
 * A canonical key from whatever the user pasted.
 *
 * A full FEN is parsed, so an illegal one is rejected rather than turned into
 * a key that matches nothing and looks like an empty result. Something that is
 * already a key is passed through, because it cannot be parsed as a FEN and
 * refusing it would be refusing Kingfisher's own identifier.
 */
export function canonicalise(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parseFen(trimmed);
  if (parsed.ok) return positionKey(trimmed);
  // Four space-separated fields is the shape of a canonical key.
  return /^\S+ [wb] \S+ \S+$/.test(trimmed) ? trimmed : null;
}

/** The kind of a hit, as a word a person reads. */
export function positionHitLabel(kind: PositionHitKind): string {
  switch (kind) {
    case 'game':
      return 'Game';
    case 'chapter':
      return 'Chapter';
    case 'repertoire':
      return 'Repertoire';
    case 'training':
      return 'Training';
    case 'model-game':
      return 'Model game';
    case 'endgame':
      return 'Endgame';
    case 'opening-file':
      return 'Opening file';
    case 'preparation':
      return 'Preparation';
    case 'decision':
      return 'Decision';
    case 'critical-position':
      return 'Critical';
    case 'team':
      return 'Team';
  }
}
