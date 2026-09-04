'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { positionKey } from '@/chess/fen';
import { SIGNATURE_VERSION, structureClaims, structureFacts } from '@/chess/structure';
import { strategicThemes, THEME_VERSION, themeById } from '@/chess/themes';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { databaseProviderById } from '@/database/registry';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { openingLabel } from '@/theory/openings';
import { useOpeningClassification } from '@/theory/useOpeningClassification';
import { cn } from '@/lib/cn';

import { printReport } from './print';
import { buildPositionReport, reportToMarkdown, type PositionReport } from './report';
import { SaveReportDialog } from './SaveReportDialog';

/**
 * The one-click report for the position on the board.
 *
 * Every section here is evidence that already existed somewhere else in
 * Kingfisher. What this adds is the arrangement, the provenance line under
 * each heading, and the fact that a question about a position can be
 * answered without visiting six panels and holding the seventh in your head.
 *
 * Nothing is computed here beyond the structural claims, which are
 * deterministic. The engine is not started, no move is recommended, and a
 * source that fails to answer says so where its evidence would have been.
 */
export function PositionReportPanel() {
  const { node } = useAnalysisPosition();
  const documentTitle = useAnalysis((state) => state.document.title);
  const orientation = useAnalysis((state) => state.orientation);
  const [saving, setSaving] = useState(false);
  const opening = useOpeningClassification(
    useAnalysis((state) => state.tree),
    useAnalysis((state) => state.currentId),
  );
  const fen = node.fen;
  const key = useMemo(() => positionKey(fen), [fen]);
  const sourceId = usePreferences((state) => state.explorerSourceId);
  const notify = useUi((state) => state.notify);
  const [copied, setCopied] = useState(false);

  const report = useQuery({
    queryKey: ['position-report', key, sourceId],
    queryFn: async (): Promise<PositionReport> => {
      const repositories = await getRepositories();
      const provider = databaseProviderById(sourceId);

      /*
        Every source is asked independently, and a failure in one is recorded
        as that source's own empty reason rather than failing the report. A
        report that vanishes because the explorer was rate limited would hide
        the repertoire and journal evidence that was available all along.
      */
      const [explorer, repertoire, modelGames, decisions, reviewItems, pinnedLines, personal] =
        await Promise.all([
          provider
            ? provider.explore({ fen }).catch((error: unknown) => ({
                failed: error instanceof Error ? error.message : 'The source did not answer.',
              }))
            : Promise.resolve({ failed: 'No reference source is selected.' }),
          repositories.repertoires.findByPosition(key).catch(() => []),
          repositories.modelGames.forPosition(key).catch(() => []),
          repositories.review.decisionsForPosition(key).catch(() => []),
          repositories.review.reviewItemsForPosition(key).catch(() => []),
          repositories.pinnedLines.forPosition(key).catch(() => []),
          repositories.games.explore(fen).catch(() => null),
        ]);

      const facts = structureFacts(fen);
      const claims = facts ? structureClaims(facts).map((claim) => claim.label) : [];
      const themes = strategicThemes(fen)
        .map((id) => themeById(id))
        .filter((theme) => theme !== undefined)
        .map((theme) => ({ name: theme.name, definition: theme.definition }));
      const reference = 'failed' in explorer ? null : explorer;
      const failedExplorer = 'failed' in explorer ? explorer.failed : undefined;

      const repertoireNames: Record<string, string> = {};
      for (const position of repertoire) {
        const owner = await repositories.repertoires.get(position.repertoireId).catch(() => null);
        if (owner) repertoireNames[position.repertoireId] = owner.repertoire.title;
      }

      return buildPositionReport({
        fen,
        ...(reference ? { explorer: reference } : { explorerUnavailable: failedExplorer }),
        repertoire,
        repertoireNames,
        modelGames,
        decisions,
        reviewItems,
        pinnedLines,
        ...(personal && personal.totalGames > 0
          ? {
              personalGameCount: personal.totalGames,
              personalGamesSource: 'Your local collection',
            }
          : {}),
        ...(claims.length > 0
          ? { structure: { claims, definitionVersion: `structure ${SIGNATURE_VERSION}` } }
          : {}),
        ...(themes.length > 0 ? { themes, themeVersion: `themes ${THEME_VERSION}` } : {}),
      });
    },
  });

  const copy = async () => {
    if (!report.data) return;
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report.data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify({ tone: 'error', message: 'The clipboard refused the report.' });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        actions={
          <div className="flex gap-1">
            <Button size="sm" onClick={() => void copy()} disabled={!report.data}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="sm"
              disabled={!report.data}
              onClick={() =>
                report.data &&
                printReport(report.data, {
                  context: documentTitle,
                  orientation,
                  opening: opening ? { eco: opening.eco, label: openingLabel(opening) } : null,
                })
              }
            >
              Print
            </Button>
            <Button size="sm" disabled={!report.data} onClick={() => setSaving(true)}>
              Save to study
            </Button>
          </div>
        }
      >
        Position report
      </PanelHeader>
      <PanelBody>
        {report.isPending ? (
          <p className="px-2.5 py-2 text-2xs text-tertiary">Gathering evidence…</p>
        ) : report.isError ? (
          <EmptyState
            title="The report could not be built"
            description={report.error instanceof Error ? report.error.message : 'Unknown failure.'}
          />
        ) : (
          <div className="flex flex-col gap-3 px-2.5 py-2" data-position-report>
            {report.data?.sections.map((section) => (
              <section key={section.id} data-report-section={section.id}>
                <h3 className="text-2xs font-medium text-primary">{section.title}</h3>
                {section.provenance ? (
                  <p className="mt-0.5 text-[10px] text-tertiary" data-report-provenance>
                    {section.provenance}
                  </p>
                ) : null}
                {section.entries.length === 0 ? (
                  <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
                    {section.emptyReason}
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {section.entries.map((entry, index) => (
                      <li
                        key={`${section.id}-${index}`}
                        className="rounded-[3px] border border-line-subtle px-2 py-1"
                      >
                        <span className="text-[11px] text-primary">{entry.primary}</span>
                        {entry.secondary ? (
                          <span className="ml-1.5 text-[10px] text-secondary">
                            {entry.secondary}
                          </span>
                        ) : null}
                        {entry.criterion ? (
                          <span
                            className={cn('mt-0.5 block text-[10px] text-tertiary')}
                            data-report-criterion
                          >
                            {entry.criterion}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </PanelBody>
      {saving && report.data ? (
        <SaveReportDialog
          report={report.data}
          context={documentTitle}
          onClose={() => setSaving(false)}
        />
      ) : null}
    </div>
  );
}
