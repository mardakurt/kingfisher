'use client';

/**
 * What every source you have can and cannot answer, here.
 *
 * The research's question is "is the reference deep enough to trust?"
 * (`market-research.md` §4 row 13, §5). The answer is not a number: it is
 * each source's own population, stated, with the position on the board
 * measured against the depth that source actually aggregated. Sources are
 * never merged — one row each, one population each.
 */

import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { describeCoverage, moveNumberOfPly, plyOfFen } from '@/reference/coverage';
import { useSourcesFor } from '@/reference/sources';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

export function CoveragePanel() {
  const node = useAnalysis((state) => state.tree.nodes[state.currentId]);
  const sources = useSourcesFor('explorer');
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const ply = plyOfFen(node?.fen ?? '');
  const usable = sources.filter((source) => source.installed || source.kind === 'online');

  return (
    <Panel>
      <PanelHeader>
        <span>Coverage · move {moveNumberOfPly(ply)}</span>
      </PanelHeader>
      <PanelBody className="space-y-2 text-2xs">
        <p className="text-tertiary">
          What each source you have holds, from its own manifest, and what it does not. Populations
          are never combined: two sources disagreeing is the reason to look at both.
        </p>
        {usable.length === 0 ? (
          <p className="text-secondary">
            No source is installed.{' '}
            <button type="button" className="underline" onClick={() => openSettingsAt('data')}>
              Install a reference pack
            </button>{' '}
            to give the explorer something to answer with.
          </p>
        ) : null}
        {usable.map((source) => {
          const coverage = describeCoverage(source, ply);
          return (
            <section
              key={source.id}
              data-testid={`coverage-${source.id}`}
              className={cn(
                'rounded-[4px] border p-2',
                coverage.depth === 'beyond-depth' ? 'border-caution/50' : 'border-line',
              )}
            >
              <h3 className="font-medium text-primary">{source.name}</h3>
              {coverage.emptyMeaning ? (
                <p className="mt-0.5 text-caution" data-testid={`coverage-depth-${source.id}`}>
                  {coverage.emptyMeaning}
                </p>
              ) : coverage.depth === 'inside' ? (
                <p className="mt-0.5 text-secondary">
                  This position is inside its depth: an empty answer here means the games it holds
                  did not reach it.
                </p>
              ) : null}
              {coverage.holds.length ? (
                <p className="mt-1 text-secondary">Holds: {coverage.holds.join(' · ')}.</p>
              ) : null}
              {coverage.lacks.length ? (
                <p className="mt-0.5 text-tertiary">Does not hold: {coverage.lacks.join('; ')}.</p>
              ) : null}
              {source.license ? (
                <p className="mt-0.5 text-tertiary">{source.license.attribution}</p>
              ) : null}
            </section>
          );
        })}
        <p className="text-tertiary">
          Kingfisher ships no games played before 2020 and no annotated master corpus: no source
          audited grants redistribution on terms compatible with the rest of its data
          (`docs/data/historical-games-audit.md`). Master games back to about 1952 can be researched
          through the Lichess Masters explorer with your own account.
        </p>
      </PanelBody>
    </Panel>
  );
}
