/**
 * Which branches of this position deserve the next hour, and why.
 *
 * Every opening report eventually has to order the moves, and the ordering is
 * where reports stop being checkable. ChessBase gives a move a rank; other
 * tools give it a "criticality" out of a hundred. Neither can be argued with,
 * because neither says what went into it.
 *
 * This produces the same ordering and shows its working. A branch carries a
 * list of **reasons**, each of which is a statement with a number and a
 * denominator behind it:
 *
 *     9...Be7
 *       18.4% of Elite OTB (2,914 of 15,832)
 *       24.1% of Recent Theory — up from 18.4%
 *       no repertoire response
 *
 * and the sort is over those reasons, not over a hidden number. A reader who
 * disagrees with the order can see exactly which fact they disagree with.
 *
 * ## The one number, and why it is not shown
 *
 * Ordering a list requires collapsing the reasons to something comparable, and
 * this module does that with a weight per reason kind. That weight is an
 * ordering device and nothing else: it never reaches the interface, it is
 * never presented as a property of the move, and `reasons` — which is what a
 * reader sees — is complete without it. AGENTS.md's rule that no fictional
 * number may reach a chess judgement is the reason it stays internal.
 *
 * ## Populations are still never merged
 *
 * A branch's reasons name the population each came from. There is no combined
 * frequency across sources and there deliberately is not one: "played 18% over
 * the board and 31% online" is two facts, and averaging them into 24% would
 * destroy the disagreement that made the branch interesting.
 */

import type { DatabaseMove, ExplorerResult } from '../database/types';

/** Why a branch is on the list. Each is a fact with its denominator. */
export type BranchReason =
  | {
      readonly kind: 'frequency';
      /** The population this frequency is in. Never omitted. */
      readonly source: string;
      readonly games: number;
      readonly total: number;
      readonly share: number;
    }
  | {
      readonly kind: 'growth';
      readonly source: string;
      readonly baseline: string;
      /** Share in the recent population. */
      readonly share: number;
      /** Share in the population it is being compared against. */
      readonly baselineShare: number;
    }
  | {
      readonly kind: 'divergence';
      readonly source: string;
      readonly otherSource: string;
      readonly share: number;
      readonly otherShare: number;
    }
  | {
      readonly kind: 'repertoire-gap';
      readonly repertoire: string;
    }
  | {
      readonly kind: 'opponent';
      readonly player: string;
      readonly games: number;
      readonly total: number;
      readonly share: number;
    };

export interface CriticalBranch {
  readonly san: string;
  readonly uci: string;
  readonly reasons: readonly BranchReason[];
}

/** One population, named, with whatever it says about this position. */
export interface BranchPopulation {
  readonly id: string;
  /** How the reader should see this population named. */
  readonly name: string;
  readonly result: ExplorerResult | null | undefined;
  /**
   * How this population is used.
   *
   * `reference` is a population whose frequencies are reported as frequencies.
   * `recent` is compared against the reference to find what is growing.
   * `contrast` is compared against it to find where practice disagrees.
   */
  readonly role: 'reference' | 'recent' | 'contrast';
}

export interface BranchInput {
  readonly populations: readonly BranchPopulation[];
  /**
   * Moves the repertoire already answers, as UCI. A move outside this set is
   * a gap only when the repertoire is given at all — `undefined` means "no
   * repertoire was consulted", which is not the same as "nothing is covered".
   */
  readonly repertoireMoves?: readonly string[];
  readonly repertoireName?: string;
  /** What one opponent played here, when the report is aimed at somebody. */
  readonly opponent?: {
    readonly name: string;
    readonly moves: readonly { readonly uci: string; readonly games: number }[];
  };
}

export interface BranchOptions {
  /** Minimum share in the reference population for a branch to be listed. */
  readonly minimumShare?: number;
  /** Minimum games behind any frequency reason. */
  readonly minimumGames?: number;
  /** How much a share must rise to be called growth, in percentage points. */
  readonly growthThreshold?: number;
  /** How far two populations must disagree to be worth saying so. */
  readonly divergenceThreshold?: number;
  readonly limit?: number;
}

const DEFAULTS = {
  minimumShare: 0.03,
  minimumGames: 5,
  growthThreshold: 0.04,
  divergenceThreshold: 0.08,
  limit: 8,
} as const;

/**
 * How much each kind of reason counts towards the order.
 *
 * Internal, and deliberately coarse. The point of these numbers is that a
 * repertoire gap in a line that is growing sorts above a common move that is
 * already answered — not that a branch has a score. Nothing outside this
 * module reads them.
 */
const WEIGHT: Record<BranchReason['kind'], number> = {
  'repertoire-gap': 3,
  opponent: 3,
  growth: 2,
  divergence: 1,
  frequency: 1,
};

const shareOf = (move: DatabaseMove, total: number): number => (total > 0 ? move.games / total : 0);

const movesOf = (result: ExplorerResult | null | undefined): Map<string, DatabaseMove> =>
  new Map((result?.moves ?? []).map((move) => [move.uci, move]));

/**
 * Rank the branches of a position, with the reasons attached.
 *
 * The candidate set is the reference population's moves, because a branch
 * nobody has played over the board is not a branch of the opening — it is a
 * novelty, and a report that mixed the two would bury the theory under
 * one-offs. A move the *opponent* has played is admitted regardless, since
 * "he played this twice and nobody else does" is precisely what preparation is
 * looking for.
 */
export function criticalBranches(
  input: BranchInput,
  options: BranchOptions = {},
): readonly CriticalBranch[] {
  const settings = { ...DEFAULTS, ...options };
  const reference = input.populations.find((population) => population.role === 'reference');
  if (!reference?.result) return [];

  const referenceTotal = reference.result.totalGames;
  const referenceMoves = movesOf(reference.result);
  const repertoire = input.repertoireMoves ? new Set(input.repertoireMoves) : null;
  const opponentMoves = new Map(
    (input.opponent?.moves ?? []).map((move) => [move.uci, move.games]),
  );
  const opponentTotal = [...opponentMoves.values()].reduce((sum, games) => sum + games, 0);

  const candidates = new Map<string, { san: string; uci: string }>();
  for (const move of reference.result.moves) {
    if (shareOf(move, referenceTotal) < settings.minimumShare) continue;
    if (move.games < settings.minimumGames) continue;
    candidates.set(move.uci, { san: move.san, uci: move.uci });
  }
  for (const [uci] of opponentMoves) {
    if (candidates.has(uci)) continue;
    const known = referenceMoves.get(uci);
    // An opponent's move still needs a name. A move no population reports at
    // all cannot be shown as a branch, because there would be nothing to call
    // it and nothing to say about it.
    if (known) candidates.set(uci, { san: known.san, uci });
  }

  const branches: { branch: CriticalBranch; order: number }[] = [];

  for (const candidate of candidates.values()) {
    const reasons: BranchReason[] = [];
    const referenceMove = referenceMoves.get(candidate.uci);
    const referenceShare = referenceMove ? shareOf(referenceMove, referenceTotal) : 0;

    if (referenceMove && referenceMove.games >= settings.minimumGames) {
      reasons.push({
        kind: 'frequency',
        source: reference.name,
        games: referenceMove.games,
        total: referenceTotal,
        share: referenceShare,
      });
    }

    for (const population of input.populations) {
      if (population.role === 'reference' || !population.result) continue;
      const move = movesOf(population.result).get(candidate.uci);
      const total = population.result.totalGames;
      const share = move ? shareOf(move, total) : 0;
      if (move && move.games >= settings.minimumGames) {
        reasons.push({
          kind: 'frequency',
          source: population.name,
          games: move.games,
          total,
          share,
        });
      }
      if (referenceMove === undefined) continue;
      const gap = share - referenceShare;
      if (population.role === 'recent' && gap >= settings.growthThreshold) {
        reasons.push({
          kind: 'growth',
          source: population.name,
          baseline: reference.name,
          share,
          baselineShare: referenceShare,
        });
      }
      if (population.role === 'contrast' && Math.abs(gap) >= settings.divergenceThreshold) {
        reasons.push({
          kind: 'divergence',
          source: population.name,
          otherSource: reference.name,
          share,
          otherShare: referenceShare,
        });
      }
    }

    if (repertoire && !repertoire.has(candidate.uci)) {
      reasons.push({
        kind: 'repertoire-gap',
        repertoire: input.repertoireName ?? 'your repertoire',
      });
    }

    const played = opponentMoves.get(candidate.uci);
    if (played !== undefined && input.opponent) {
      reasons.push({
        kind: 'opponent',
        player: input.opponent.name,
        games: played,
        total: opponentTotal,
        share: opponentTotal > 0 ? played / opponentTotal : 0,
      });
    }

    if (reasons.length === 0) continue;

    /*
      The ordering value. A reason contributes its weight times the share it
      concerns, so a repertoire gap on a move played a fifth of the time
      outranks one on a move played twice — which is the behaviour a player
      wants and the reason a plain count of reasons is not enough.
    */
    const order = reasons.reduce((sum, reason) => {
      const magnitude =
        reason.kind === 'repertoire-gap'
          ? Math.max(referenceShare, 0.01)
          : reason.kind === 'growth'
            ? reason.share - reason.baselineShare
            : reason.kind === 'divergence'
              ? Math.abs(reason.share - reason.otherShare)
              : reason.share;
      return sum + WEIGHT[reason.kind] * magnitude;
    }, 0);

    branches.push({ branch: { san: candidate.san, uci: candidate.uci, reasons }, order });
  }

  return branches
    .sort((a, b) => b.order - a.order || a.branch.san.localeCompare(b.branch.san))
    .slice(0, settings.limit)
    .map((entry) => entry.branch);
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const count = (value: number): string => value.toLocaleString('en-GB');

/**
 * One reason, as a reader should see it.
 *
 * Kept beside the ranking rather than in a component because the wording is
 * part of the claim: "18.4% of Elite OTB (2,914 of 15,832)" is checkable and
 * "played often" is not, and a second renderer that dropped the denominator
 * would quietly undo the thing this module is for.
 */
export function describeReason(reason: BranchReason): string {
  switch (reason.kind) {
    case 'frequency':
      return `${percent(reason.share)} of ${reason.source} (${count(reason.games)} of ${count(
        reason.total,
      )})`;
    case 'growth':
      return `${percent(reason.share)} in ${reason.source} — up from ${percent(
        reason.baselineShare,
      )} in ${reason.baseline}`;
    case 'divergence':
      return `${percent(reason.share)} in ${reason.source} against ${percent(
        reason.otherShare,
      )} in ${reason.otherSource}`;
    case 'repertoire-gap':
      return `no response in ${reason.repertoire}`;
    case 'opponent':
      return `${reason.player} played it ${count(reason.games)} of ${count(reason.total)} times here`;
  }
}
