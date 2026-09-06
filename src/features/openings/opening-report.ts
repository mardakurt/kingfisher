/**
 * The Opening Report.
 *
 * Kingfisher already knew everything in here. It knew the opening's name and
 * lineage, what several named populations played, what changed recently, what
 * a curated brief says about the plans, and which branches the repertoire
 * answers. What it did not have was one page that asks all of those questions
 * at once and says, for each answer, where the answer came from.
 *
 * That is the whole feature. It is deliberately not new evidence — a report
 * that discovered facts no panel could show would be a report nobody could
 * check.
 *
 * ## The rules it inherits
 *
 * Sections are `ReportSection`, the same contract the position report uses, so
 * every one of them carries a `provenance` line or a stated `emptyReason` and
 * neither can be omitted by accident. §38 and §39 of that module apply here
 * unchanged: a citation names the population and its size, and no move is ever
 * called best.
 *
 * Two more rules matter here specifically.
 *
 * **Populations are never merged.** Each source gets its own row with its own
 * game count. There is no combined percentage anywhere in this file, and
 * `criticalBranches` — which is what orders the branch section — reports a
 * disagreement as two numbers rather than as an average of them.
 *
 * **Curated prose stays labelled as curated.** The plans section carries a
 * variation brief, which a person wrote; the piece and pawn sections carry
 * counts, which arithmetic produced. They are different sections with
 * different provenance lines, and merging them into one "plans" paragraph
 * would be exactly the conflation AGENTS.md forbids.
 *
 * ## Empty sections
 *
 * A section with nothing to say says why. A section that is not applicable at
 * all is dropped: a report for a player with no repertoire should not carry an
 * empty repertoire heading, and `buildOpeningReport` omits the sections whose
 * inputs were never supplied rather than inventing a reason they are blank.
 */

import type { ReportSection } from '@/features/position-report/report';
import {
  type BranchPopulation,
  type CriticalBranch,
  criticalBranches,
  describeReason,
} from '@/theory/critical-branches';
import {
  type PlanEvidence,
  planEvidence,
  principalDestinations,
  significantAdvances,
} from '@/theory/opening-plans';
import type { TheoryBookMatch, TheoryBookNode } from '@/theory/theory-book';
import { THEORY_BOOK_PROVENANCE } from '@/theory/theory-book';
import type { ResolvedBrief } from '@/theory/variation-briefs';

export interface OpeningReport {
  readonly fen: string;
  readonly generatedAt: number;
  readonly sections: readonly ReportSection[];
  /** The branch ranking, kept whole so a panel can make each row actionable. */
  readonly branches: readonly CriticalBranch[];
  /** The plan arithmetic, kept whole for the same reason. */
  readonly plans: PlanEvidence | null;
}

export interface OpeningReportInput {
  readonly fen: string;
  /** Where the theory book places this position, and how far past it we are. */
  readonly placement?: TheoryBookMatch | null;
  /** The named path from the top of the book, deepest last. */
  readonly crumbs?: readonly TheoryBookNode[];
  /** Named variations directly below this position. */
  readonly children?: readonly TheoryBookNode[];
  readonly brief?: ResolvedBrief | null;
  readonly populations?: readonly BranchPopulation[];
  /** Continuations of the games that reached here, as UCI, for the plans. */
  readonly continuations?: readonly (readonly string[])[];
  readonly repertoireMoves?: readonly string[];
  readonly repertoireName?: string;
  readonly opponent?: {
    readonly name: string;
    readonly moves: readonly { readonly uci: string; readonly games: number }[];
  };
  readonly modelGames?: readonly {
    readonly label: string;
    readonly detail?: string;
    readonly source: string;
  }[];
  readonly now?: number;
}

const count = (value: number): string => value.toLocaleString('en-GB');
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** "Elite OTB · 407,538 games" — a population is never quoted without its size. */
const populationLabel = (population: BranchPopulation): string =>
  population.result
    ? `${population.name} · ${count(population.result.totalGames)} games`
    : population.name;

const COLOUR = { w: 'White', b: 'Black' } as const;

const PIECE = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
} as const;

function identitySection(input: OpeningReportInput): ReportSection {
  const crumbs = input.crumbs ?? [];
  const node = input.placement?.node;
  if (!node) {
    return {
      id: 'identity',
      title: 'Opening',
      provenance: null,
      entries: [],
      emptyReason:
        'No named opening covers this position, and none is invented for it. The classification dataset names positions, not every position.',
    };
  }
  const beyond = input.placement?.beyond ?? 0;
  return {
    id: 'identity',
    title: 'Opening',
    provenance: `${THEORY_BOOK_PROVENANCE.dataset} · ${THEORY_BOOK_PROVENANCE.licence}`,
    entries: [
      {
        primary: node.eco ? `${node.eco} · ${node.label}` : node.label,
        ...(crumbs.length > 1 ? { secondary: crumbs.map((crumb) => crumb.name).join(' → ') } : {}),
        /*
          How far past the named position we are, always. A name twenty plies
          back describes the opening and not the position on the board, and a
          report that printed the name without the distance would be inviting
          exactly that mistake.
        */
        criterion:
          beyond === 0
            ? 'this exact position is named'
            : `${beyond} ${beyond === 1 ? 'ply' : 'plies'} past the last named position`,
      },
    ],
    emptyReason: null,
  };
}

function briefSection(input: OpeningReportInput): ReportSection {
  const resolved = input.brief;
  if (!resolved) {
    return {
      id: 'brief',
      title: 'Variation brief',
      provenance: null,
      entries: [],
      emptyReason: 'No brief has been written for this variation or any above it.',
    };
  }
  const { brief, inherited, matched } = resolved;
  return {
    id: 'brief',
    title: 'Variation brief',
    // Authored prose, and labelled as authored. This is the one section in the
    // report that is not derived from a count.
    provenance: inherited
      ? `Kingfisher, written for ${matched.join(' → ')} and inherited here`
      : 'Kingfisher, written for this variation',
    entries: [
      { primary: brief.defining },
      { primary: brief.white, criterion: 'White' },
      { primary: brief.black, criterion: 'Black' },
    ],
    emptyReason: null,
  };
}

function branchesSection(
  input: OpeningReportInput,
  branches: readonly CriticalBranch[],
): ReportSection {
  const reference = (input.populations ?? []).find((population) => population.role === 'reference');
  if (!reference?.result) {
    return {
      id: 'branches',
      title: 'Branches worth the time',
      provenance: null,
      entries: [],
      emptyReason:
        'No reference population answered for this position, so there is nothing to rank branches against.',
    };
  }
  if (branches.length === 0) {
    return {
      id: 'branches',
      title: 'Branches worth the time',
      provenance: populationLabel(reference),
      entries: [],
      emptyReason: `${reference.name} has too few games here to separate one branch from another.`,
    };
  }
  return {
    id: 'branches',
    title: 'Branches worth the time',
    provenance: (input.populations ?? [])
      .filter((population) => population.result)
      .map(populationLabel)
      .join(' · '),
    /*
      Every reason, and only once. `secondary` is the complete list — which is
      what makes the order arguable — so there is deliberately no `criterion`
      repeating the first of them beside it. There is no rank and no score.
    */
    entries: branches.map((branch) => ({
      primary: branch.san,
      secondary: branch.reasons.map(describeReason).join(' · '),
    })),
    emptyReason: null,
  };
}

function populationSection(input: OpeningReportInput): ReportSection {
  const populations = (input.populations ?? []).filter(
    (population) => population.result !== undefined,
  );
  if (populations.length === 0) {
    return {
      id: 'populations',
      title: 'What was played, by population',
      provenance: null,
      entries: [],
      emptyReason: 'No source was consulted for this position.',
    };
  }
  return {
    id: 'populations',
    title: 'What was played, by population',
    provenance: 'Each row is one source. Nothing here is combined across them.',
    entries: populations.map((population) => {
      if (!population.result) {
        return {
          primary: population.name,
          secondary: 'This source could not answer.',
          criterion: 'unavailable',
        };
      }
      const total = population.result.totalGames;
      const top = [...population.result.moves].sort((a, b) => b.games - a.games)[0];
      return {
        primary: `${population.name} — ${count(total)} games`,
        secondary: top
          ? `most played: ${top.san}, ${count(top.games)} games (${percent(
              total > 0 ? top.games / total : 0,
            )})`
          : 'no moves recorded from this position',
        criterion: population.role === 'reference' ? 'reference population' : population.role,
      };
    }),
    emptyReason: null,
  };
}

function destinationsSection(plans: PlanEvidence | null): ReportSection {
  if (!plans) {
    return {
      id: 'destinations',
      title: 'Where the pieces go',
      provenance: null,
      entries: [],
      emptyReason:
        'No game continuations were available from this position, so there is nothing to count.',
    };
  }
  const rows = principalDestinations(plans);
  const provenance = `${count(plans.games)} games replayed ${plans.window} plies past this position`;
  if (rows.length === 0) {
    return {
      id: 'destinations',
      title: 'Where the pieces go',
      provenance,
      entries: [],
      emptyReason: 'No piece went to the same square often enough to be worth reporting.',
    };
  }
  return {
    id: 'destinations',
    title: 'Where the pieces go',
    provenance,
    entries: rows.map((row) => ({
      primary: `${COLOUR[row.color]}'s ${PIECE[row.piece]} on ${row.from} reached ${row.to}`,
      secondary: `${count(row.games)} of ${count(row.denominator)} games (${percent(
        row.games / row.denominator,
      )}), typically by ply ${row.medianPly + 1}`,
    })),
    emptyReason: null,
  };
}

function advancesSection(plans: PlanEvidence | null): ReportSection {
  if (!plans) {
    return {
      id: 'advances',
      title: 'Pawn advances',
      provenance: null,
      entries: [],
      emptyReason:
        'No game continuations were available from this position, so there is nothing to count.',
    };
  }
  const rows = significantAdvances(plans);
  const provenance = `${count(plans.games)} games replayed ${plans.window} plies past this position`;
  if (rows.length === 0) {
    return {
      id: 'advances',
      title: 'Pawn advances',
      provenance,
      entries: [],
      emptyReason: 'No pawn advance was played often enough here to be worth reporting.',
    };
  }
  return {
    id: 'advances',
    title: 'Pawn advances',
    provenance,
    entries: rows.map((row) => ({
      primary: `${COLOUR[row.color]} plays ${row.from}-${row.to}`,
      secondary: `${count(row.games)} of ${count(row.denominator)} games (${percent(
        row.games / row.denominator,
      )}), typically by ply ${row.medianPly + 1}`,
      // Deliberately not "break". Whether this advance breaks the position is
      // a chess judgement, and this section is a count.
      ...(row.promotedTo ? { criterion: 'promotion' } : {}),
    })),
    emptyReason: null,
  };
}

function repertoireSection(
  input: OpeningReportInput,
  branches: readonly CriticalBranch[],
): ReportSection {
  const covered = input.repertoireMoves;
  if (!covered) {
    return {
      id: 'repertoire',
      title: 'Repertoire coverage',
      provenance: null,
      entries: [],
      emptyReason: 'No repertoire was consulted for this position.',
    };
  }
  const name = input.repertoireName ?? 'your repertoire';
  const gaps = branches.filter((branch) =>
    branch.reasons.some((reason) => reason.kind === 'repertoire-gap'),
  );
  const answered = branches.filter((branch) => !gaps.includes(branch));
  const entries = [
    ...answered.map((branch) => ({
      primary: branch.san,
      criterion: 'answered',
    })),
    ...gaps.map((branch) => ({
      primary: branch.san,
      secondary: branch.reasons
        .filter((reason) => reason.kind !== 'repertoire-gap')
        .map(describeReason)
        .join(' · '),
      criterion: 'no response',
    })),
  ];
  if (entries.length === 0) {
    return {
      id: 'repertoire',
      title: 'Repertoire coverage',
      provenance: name,
      entries: [],
      emptyReason: 'No branch was listed here, so there is nothing to check against.',
    };
  }
  return {
    id: 'repertoire',
    title: 'Repertoire coverage',
    provenance: `${name} · ${count(gaps.length)} of ${count(entries.length)} listed branches unanswered`,
    entries,
    emptyReason: null,
  };
}

function childrenSection(input: OpeningReportInput): ReportSection {
  const children = input.children ?? [];
  if (children.length === 0) {
    return {
      id: 'named-branches',
      title: 'Named variations below this one',
      provenance: null,
      entries: [],
      emptyReason: 'The classification dataset names nothing below this position.',
    };
  }
  return {
    id: 'named-branches',
    title: 'Named variations below this one',
    // No counts here on purpose. This is the theory book, and the theory book
    // shows no counts, no percentages and no evaluations — see AGENTS.md.
    provenance: `${THEORY_BOOK_PROVENANCE.dataset} · ${THEORY_BOOK_PROVENANCE.licence}`,
    entries: children.map((child) => ({
      primary: child.label,
      ...(child.eco ? { secondary: child.eco } : {}),
    })),
    emptyReason: null,
  };
}

function modelGamesSection(input: OpeningReportInput): ReportSection {
  const games = input.modelGames;
  if (!games) {
    return {
      id: 'model-games',
      title: 'Model games',
      provenance: null,
      entries: [],
      emptyReason: 'No model games were looked for.',
    };
  }
  if (games.length === 0) {
    return {
      id: 'model-games',
      title: 'Model games',
      provenance: null,
      entries: [],
      emptyReason: 'No model game has been linked to this position.',
    };
  }
  return {
    id: 'model-games',
    title: 'Model games',
    provenance: [...new Set(games.map((game) => game.source))].join(' · '),
    entries: games.map((game) => ({
      primary: game.label,
      ...(game.detail ? { secondary: game.detail } : {}),
    })),
    emptyReason: null,
  };
}

/**
 * Which sections a report with these inputs is entitled to have.
 *
 * A section is dropped, not emptied, when the caller never supplied its input
 * at all — a player with no repertoire should not be shown a repertoire
 * heading explaining that they have no repertoire. A section whose input was
 * supplied and came back with nothing stays, carrying the reason, because
 * "we looked and found none" is a finding.
 */
const applicable = (input: OpeningReportInput, section: ReportSection): boolean => {
  switch (section.id) {
    case 'repertoire':
      return input.repertoireMoves !== undefined;
    case 'model-games':
      return input.modelGames !== undefined;
    case 'destinations':
    case 'advances':
      return input.continuations !== undefined;
    default:
      return true;
  }
};

export function buildOpeningReport(input: OpeningReportInput): OpeningReport {
  const plans = input.continuations ? planEvidence(input.fen, input.continuations, {}) : null;
  const branches = criticalBranches({
    populations: input.populations ?? [],
    ...(input.repertoireMoves !== undefined ? { repertoireMoves: input.repertoireMoves } : {}),
    ...(input.repertoireName !== undefined ? { repertoireName: input.repertoireName } : {}),
    ...(input.opponent !== undefined ? { opponent: input.opponent } : {}),
  });

  const sections = [
    identitySection(input),
    briefSection(input),
    branchesSection(input, branches),
    populationSection(input),
    childrenSection(input),
    destinationsSection(plans),
    advancesSection(plans),
    repertoireSection(input, branches),
    modelGamesSection(input),
  ].filter((section) => applicable(input, section));

  return {
    fen: input.fen,
    generatedAt: input.now ?? Date.now(),
    sections,
    branches,
    plans,
  };
}
