/**
 * The repertoire maintenance inbox (Phase 86, P0.5 of the parity program).
 *
 * A repertoire goes stale in five ways, and each already has evidence in
 * Kingfisher; the inbox gathers them into one list, deterministically, so
 * the same evidence always gives the same items in the same order:
 *
 * - **Your games left your line** (`own-departure`): in a game you played
 *   with the repertoire's colour, you chose another move where the
 *   repertoire has yours (`scanAgainstRepertoire`, "own-alternative").
 * - **A surprise** (`surprise`): in your game the opponent played a move the
 *   repertoire has not prepared for, at a prepared position ("new-move").
 * - **Two main moves** (`conflict`): a position where the repertoire marks
 *   more than one of your moves as main.
 * - **A frequent branch unanswered** (`branch`): an opponent move played in
 *   at least `branchGames` games of My games at a prepared position, leading
 *   where the repertoire has no answer (`findGaps`). The population is named
 *   on the item; it is My games, not theory.
 * - **Old engine evidence** (`stale-evidence`): a position where you move
 *   whose newest stored engine evaluation is older than `staleAfterDays`.
 *   A position with no evaluation is not "stale"; it is unevaluated.
 *
 * Nothing here decides for the player. An item carries its backing games and
 * counts; a decision on it (accepted, dismissed with a reason, snoozed) is
 * the player's, stored separately (`inboxDecisions`). Each item has an
 * evidence digest: when new games or a newer evaluation change it, a decision
 * made on the old evidence no longer covers it and the item is open again —
 * with the earlier decision shown, not erased.
 */

import type { GameTree } from '@/chess/tree/types';
import type { InboxDecisionRecord, StoredEngineEvidenceRecord } from '@/persistence/domain';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import { indexPositions, type RepertoireGap } from './index';
import { DEFAULT_MINIMUM_PLIES, scanAgainstRepertoire } from './scan';

export type InboxKind = 'own-departure' | 'surprise' | 'conflict' | 'branch' | 'stale-evidence';

/** The order the kinds are listed in: your own play first, maintenance last. */
export const INBOX_KIND_ORDER: readonly InboxKind[] = [
  'own-departure',
  'surprise',
  'conflict',
  'branch',
  'stale-evidence',
];

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  'own-departure': 'You left your line',
  surprise: 'A move you had not prepared for',
  conflict: 'Two main moves',
  branch: 'A frequent branch without an answer',
  'stale-evidence': 'Old engine evidence',
};

export interface InboxGame {
  readonly id: string;
  readonly fingerprint: string;
  readonly title: string;
  readonly tree: GameTree;
  /** The colour you played in it; the caller decides this from your names. */
  readonly myColor: 'w' | 'b';
}

export interface InboxItem {
  /** Stable across runs: kind, position and move. The decision is keyed on it. */
  readonly id: string;
  readonly kind: InboxKind;
  readonly positionKey: string;
  readonly fen: string;
  readonly title: string;
  /** Why it is here, in words that name the rule and the counts. */
  readonly detail: string;
  readonly games: readonly { readonly id: string; readonly title: string; readonly ply: number }[];
  readonly count: number;
  readonly depth: number;
  /** Changes when the evidence behind the item changes. */
  readonly evidence: string;
  readonly status: 'open' | 'snoozed' | 'accepted' | 'dismissed';
  /** The decision in force, or the one made on older evidence (`reopened`). */
  readonly decision?: InboxDecisionRecord;
  readonly reopened: boolean;
}

export interface InboxInput {
  readonly repertoireId: string;
  readonly color: 'w' | 'b';
  readonly positions: readonly RepertoirePositionRecord[];
  readonly myGames: readonly InboxGame[];
  readonly gaps: readonly RepertoireGap[];
  readonly evidenceAt: (positionKey: string) => readonly StoredEngineEvidenceRecord[];
  readonly decisions: readonly InboxDecisionRecord[];
  readonly now: number;
  readonly staleAfterDays?: number;
  readonly branchGames?: number;
  readonly minimumPlies?: number;
}

export const DEFAULT_STALE_AFTER_DAYS = 365;
export const DEFAULT_BRANCH_GAMES = 3;
const DAY_MS = 86_400_000;

/** A short, stable digest (FNV-1a) — equality only, never shown as a number. */
export function digest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const moveNumber = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}`;

export function buildInbox(input: InboxInput): readonly InboxItem[] {
  const index = indexPositions(input.positions);
  const staleAfter = (input.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS) * DAY_MS;
  const branchGames = input.branchGames ?? DEFAULT_BRANCH_GAMES;
  const raw: Omit<InboxItem, 'status' | 'decision' | 'reopened'>[] = [];

  // Your games against the repertoire, grouped by where and how they left it.
  const groups = new Map<
    string,
    {
      kind: InboxKind;
      positionKey: string;
      fen: string;
      san: string;
      expected: readonly string[];
      depth: number;
      games: { id: string; title: string; ply: number; fingerprint: string }[];
    }
  >();
  for (const game of input.myGames) {
    if (game.myColor !== input.color) continue;
    const finding = scanAgainstRepertoire(
      game.tree,
      input.color,
      index,
      input.minimumPlies ?? DEFAULT_MINIMUM_PLIES,
    );
    if (!finding) continue;
    const kind: InboxKind | null =
      finding.kind === 'own-alternative'
        ? 'own-departure'
        : finding.kind === 'new-move'
          ? 'surprise'
          : null;
    if (!kind) continue;
    const key = `${kind}|${finding.positionKey}|${finding.uci}`;
    const group = groups.get(key) ?? {
      kind,
      positionKey: finding.positionKey,
      fen: finding.fen,
      san: finding.san,
      expected: finding.expected,
      depth: finding.depth,
      games: [],
    };
    group.games.push({
      id: game.id,
      title: game.title,
      ply: finding.ply,
      fingerprint: game.fingerprint,
    });
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const count = group.games.length;
    const games = [...group.games].sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1));
    const at = moveNumber(group.depth);
    raw.push({
      id: key,
      kind: group.kind,
      positionKey: group.positionKey,
      fen: group.fen,
      title:
        group.kind === 'own-departure'
          ? `${at} ${group.san} instead of ${group.expected.join(' or ')}`
          : `${at} ${group.san} — not prepared`,
      detail:
        group.kind === 'own-departure'
          ? `In ${count} of your games you played ${group.san} where your repertoire has ${group.expected.join(' or ')}.`
          : `In ${count} of your games the opponent played ${group.san} here; your repertoire has ${
              group.expected.length ? group.expected.join(', ') : 'no reply recorded'
            } prepared.`,
      games: games.map(({ id, title, ply }) => ({ id, title, ply })),
      count,
      depth: group.depth,
      evidence: digest(games.map((game) => game.fingerprint).join(',')),
    });
  }

  for (const position of input.positions) {
    if (position.sideToMove !== input.color) continue;
    const mains = position.moves.filter((move) => !move.expected && move.role === 'main');
    if (mains.length > 1) {
      const sans = mains.map((move) => move.san).sort();
      raw.push({
        id: `conflict|${position.positionKey}`,
        kind: 'conflict',
        positionKey: position.positionKey,
        fen: position.fen,
        title: `${moveNumber(position.depth)} ${sans.join(' and ')} are both main`,
        detail: `This position has ${mains.length} moves marked main. Drilling asks for one; mark the others alternatives, or keep both on purpose.`,
        games: [],
        count: mains.length,
        depth: position.depth,
        evidence: digest(sans.join(',')),
      });
    }
    const held = input.evidenceAt(position.positionKey);
    if (held.length > 0) {
      const newest = Math.max(...held.map((record) => record.analysedAt));
      if (input.now - newest > staleAfter) {
        const days = Math.floor((input.now - newest) / DAY_MS);
        raw.push({
          id: `stale-evidence|${position.positionKey}`,
          kind: 'stale-evidence',
          positionKey: position.positionKey,
          fen: position.fen,
          title: `${moveNumber(position.depth)} evaluated ${days} days ago`,
          detail: `The newest stored engine evaluation of this position is ${days} days old (${held.length} held). Engines have changed since; queue the line to evaluate it again.`,
          games: [],
          count: held.length,
          depth: position.depth,
          evidence: digest(String(newest)),
        });
      }
    }
  }

  for (const gap of input.gaps) {
    if (gap.games < branchGames) continue;
    raw.push({
      id: `branch|${gap.positionKey}|${gap.opponentMove.uci}`,
      kind: 'branch',
      positionKey: gap.positionKey,
      fen: gap.fen,
      title: `${moveNumber(gap.depth)} ${gap.opponentMove.san} — no answer`,
      detail: `${gap.games} games in My games played ${gap.opponentMove.san} here, and the repertoire has no move after it. The count is from My games, not from theory.`,
      games: [],
      count: gap.games,
      depth: gap.depth,
      evidence: digest(String(gap.games)),
    });
  }

  const decisions = new Map(input.decisions.map((decision) => [decision.id, decision]));
  const items: InboxItem[] = raw.map((item) => {
    const decision = decisions.get(item.id);
    if (!decision) return { ...item, status: 'open', reopened: false };
    if (decision.evidence !== item.evidence) {
      return { ...item, status: 'open', decision, reopened: true };
    }
    if (decision.status === 'snoozed') {
      return decision.snoozedUntil && decision.snoozedUntil > input.now
        ? { ...item, status: 'snoozed', decision, reopened: false }
        : { ...item, status: 'open', decision, reopened: true };
    }
    return { ...item, status: decision.status, decision, reopened: false };
  });

  const statusOrder = { open: 0, snoozed: 1, accepted: 2, dismissed: 2 } as const;
  return items.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      INBOX_KIND_ORDER.indexOf(a.kind) - INBOX_KIND_ORDER.indexOf(b.kind) ||
      b.count - a.count ||
      a.depth - b.depth ||
      (a.id < b.id ? -1 : 1),
  );
}
