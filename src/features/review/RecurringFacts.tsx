'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { openStoredGame } from '@/features/games/open-game';
import { ENDGAME_CATEGORY_LABEL } from '@/persistence/domain';
import { positionPageUrl } from '@/position/knowledge';
import {
  buildRecurringReport,
  type EndgameLossRow,
  type EngineFlagRow,
  type RecurringGameFact,
  type RepertoireLossRow,
  type StructureLossRow,
} from '@/recurring/recurring';
import { useUi } from '@/stores/ui-store';

import { useRecurringFacts } from './queries';

const THRESHOLDS = [50, 100, 150, 200] as const;

export function RecurringFacts({
  aliases,
  from,
  to,
}: {
  readonly aliases: readonly string[];
  readonly from: number;
  readonly to: number;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const [thresholdCp, setThresholdCp] = useState(100);
  const facts = useRecurringFacts({ aliases, from, to });
  const report = useMemo(
    () => (facts.data ? buildRecurringReport({ ...facts.data, engineLossCp: thresholdCp }) : null),
    [facts.data, thresholdCp],
  );

  const openGame = async (game: RecurringGameFact) => {
    try {
      await openStoredGame(game.gameId, { ply: game.ply });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That game could not be opened.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (aliases.length === 0) {
    return (
      <RecurringShell headline="No player aliases are set.">
        <p className="text-[11px] leading-relaxed text-tertiary">
          Add your exact playing names in Settings → Profile to connect these records to your games.
        </p>
      </RecurringShell>
    );
  }

  if (facts.isPending) {
    return (
      <RecurringShell headline="Reading the games and evidence in this period…">
        <p className="text-[11px] text-tertiary">The existing review record remains below.</p>
      </RecurringShell>
    );
  }

  if (facts.isError || !report) {
    return (
      <RecurringShell headline="Recurring facts could not be read.">
        <p className="text-[11px] leading-relaxed text-tertiary">
          {facts.error instanceof Error
            ? facts.error.message
            : 'The local database did not answer.'}
        </p>
      </RecurringShell>
    );
  }

  return (
    <RecurringShell
      headline={`${report.factCount} ${report.factCount === 1 ? 'fact' : 'facts'} in your games this period, none of them labeled “style”.`}
    >
      <label className="flex items-center gap-2 text-[10px] text-tertiary">
        <span>Engine loss threshold</span>
        <select
          aria-label="Engine loss threshold"
          value={thresholdCp}
          onChange={(event) => setThresholdCp(Number(event.target.value))}
          className="ml-auto h-6 rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary"
        >
          {THRESHOLDS.map((value) => (
            <option key={value} value={value}>
              {(value / 100).toFixed(1)} pawn{value === 100 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>

      <FactsSection
        title="What the engine flagged"
        rule={`Stored before-and-after scores dropping at least ${(thresholdCp / 100).toFixed(1)} pawn${thresholdCp === 100 ? '' : 's'} from your side.`}
        empty="No stored engine pair crosses this threshold in the selected period."
        rows={report.engine}
        render={(row) => <EngineRow row={row} onOpenGame={openGame} />}
      />
      <FactsSection
        title="What the same structure lost"
        rule="The same pawn skeleton in at least five unique games, with a score below 50%."
        empty="No pawn structure has both five games and a below-50% record here."
        rows={report.structures}
        render={(row) => <StructureRow row={row} onOpenGame={openGame} />}
      />
      <FactsSection
        title="What this endgame type lost"
        rule="Your saved endgame categories reached in games with a score below 50%."
        empty="No saved endgame category has a below-50% record here."
        rows={report.endgames}
        render={(row) => <EndgameRow row={row} onOpenGame={openGame} />}
      />
      <FactsSection
        title="What this opening left"
        rule="Your repertoire position, reached while you played that repertoire’s colour, below 50%."
        empty="No prepared repertoire position has a below-50% record here."
        rows={report.repertoire}
        render={(row) => <RepertoireRow row={row} onOpenGame={openGame} />}
      />
    </RecurringShell>
  );
}

function RecurringShell({
  headline,
  children,
}: {
  readonly headline: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby="recurring-facts-title">
      <h3 id="recurring-facts-title" className="text-[10px] font-semibold text-tertiary">
        Recurring facts
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-secondary">{headline}</p>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function FactsSection<Row>({
  title,
  rule,
  empty,
  rows,
  render,
}: {
  readonly title: string;
  readonly rule: string;
  readonly empty: string;
  readonly rows: readonly Row[];
  readonly render: (row: Row) => React.ReactNode;
}) {
  return (
    <section className="border-t border-line-subtle pt-2.5">
      <h4 className="text-[11px] font-medium text-primary">{title}</h4>
      <p className="mt-0.5 text-[9.5px] leading-snug text-tertiary">{rule}</p>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-tertiary">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {rows.map((row, index) => (
            <li key={index}>{render(row)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EngineRow({
  row,
  onOpenGame,
}: {
  readonly row: EngineFlagRow;
  readonly onOpenGame: (game: RecurringGameFact) => void;
}) {
  return (
    <FactCard>
      <FactLink href={positionPageUrl(row.fen)}>Position · {recordLabel(row)}</FactLink>
      <ul className="mt-1 space-y-1">
        {row.occurrences.map((occurrence) => (
          <li key={occurrence.gameId} className="text-[9.5px] leading-snug text-tertiary">
            <button
              type="button"
              onClick={() => onOpenGame(occurrence)}
              className="text-left text-secondary underline decoration-line hover:text-primary"
            >
              {occurrence.label}
            </button>{' '}
            · {occurrence.moveSan} · {occurrence.before} to {occurrence.after} ·{' '}
            {(occurrence.lossCp / 100).toFixed(2)} pawns · {occurrence.engineName} depth{' '}
            {occurrence.beforeDepth === occurrence.afterDepth
              ? occurrence.beforeDepth
              : `${occurrence.beforeDepth} → ${occurrence.afterDepth}`}
          </li>
        ))}
      </ul>
    </FactCard>
  );
}

function StructureRow({
  row,
  onOpenGame,
}: {
  readonly row: StructureLossRow;
  readonly onOpenGame: (game: RecurringGameFact) => void;
}) {
  return (
    <FactCard>
      <FactLink href={positionPageUrl(row.fen)}>{row.description}</FactLink>
      <RecordAndGames row={row} onOpenGame={onOpenGame} />
    </FactCard>
  );
}

function EndgameRow({
  row,
  onOpenGame,
}: {
  readonly row: EndgameLossRow;
  readonly onOpenGame: (game: RecurringGameFact) => void;
}) {
  return (
    <FactCard>
      <FactLink href={`/endgame?category=${encodeURIComponent(row.category)}`}>
        {ENDGAME_CATEGORY_LABEL[row.category]} · {row.distinctPositions}{' '}
        {row.distinctPositions === 1 ? 'saved position' : 'saved positions'}
      </FactLink>
      <RecordAndGames row={row} onOpenGame={onOpenGame} />
    </FactCard>
  );
}

function RepertoireRow({
  row,
  onOpenGame,
}: {
  readonly row: RepertoireLossRow;
  readonly onOpenGame: (game: RecurringGameFact) => void;
}) {
  return (
    <FactCard>
      <FactLink href={positionPageUrl(row.fen)}>{row.repertoireTitles.join(', ')}</FactLink>
      <RecordAndGames row={row} onOpenGame={onOpenGame} />
    </FactCard>
  );
}

function FactCard({ children }: { readonly children: React.ReactNode }) {
  return <div className="rounded-[6px] border border-line-subtle bg-surface-1 p-2">{children}</div>;
}

function FactLink({
  href,
  children,
}: {
  readonly href: string | null;
  readonly children: React.ReactNode;
}) {
  if (!href) return <span className="text-[11px] font-medium text-primary">{children}</span>;
  return (
    <Link href={href} className="text-[11px] font-medium text-primary underline decoration-line">
      {children}
    </Link>
  );
}

function RecordAndGames({
  row,
  onOpenGame,
}: {
  readonly row: {
    readonly games: readonly RecurringGameFact[];
    readonly wins: number;
    readonly losses: number;
    readonly draws: number;
    readonly scorePercent: number;
  };
  readonly onOpenGame: (game: RecurringGameFact) => void;
}) {
  return (
    <>
      <p className="mt-0.5 text-[9.5px] text-tertiary">{recordLabel(row)}</p>
      <div className="mt-1 space-y-0.5">
        {row.games.map((game) => (
          <button
            key={game.gameId}
            type="button"
            className="block h-5 w-full truncate rounded-[5px] px-1.5 text-left text-[9.5px] text-secondary hover:bg-surface-3 hover:text-primary"
            title={`${game.label} · ${game.result}`}
            onClick={() => onOpenGame(game)}
          >
            {game.label}
          </button>
        ))}
      </div>
    </>
  );
}

function recordLabel(row: {
  readonly games: readonly RecurringGameFact[];
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly scorePercent: number;
}): string {
  return `${row.wins}W · ${row.losses}L · ${row.draws}D · ${row.games.length} ${row.games.length === 1 ? 'game' : 'games'} · ${row.scorePercent}% score`;
}
