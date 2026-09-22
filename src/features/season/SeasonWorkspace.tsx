'use client';

/**
 * `/season` — the season reader's workspace.
 *
 * Reads the URL parameter via `useSearchParams`, fetches the player's
 * games (one big query), builds the season report, and renders the
 * picker at the top and the five sections below.
 *
 * No invented score, no rating chart, no "you've improved" headline.
 * The reader counts; the player reads. See `docs/design/season.md`.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { NavButton } from '@/features/shell/NavButton';
import { Panel, PanelBody } from '@/components/ui/Panel';
import { useProfile } from '@/features/persistence/queries';
import { buildSeason } from '@/season/season';
import { parseNamedSet, namedSetUrl } from '@/season/named-set';
import { useSeasonLog } from '@/stores/season-log-store';
import { hashReport } from '@/features/season/hash-report';
import { SeasonPicker } from './SeasonPicker';
import { SeasonSections } from './SeasonSections';
import { useSeasonGames } from './use-season-games';

export function SeasonWorkspace() {
  const params = useSearchParams();
  const predicate = useMemo(
    () =>
      parseNamedSet({
        set: params?.get('set') ?? undefined,
        event: params?.get('event') ?? undefined,
        site: params?.get('site') ?? undefined,
        opening: params?.get('opening') ?? undefined,
        mixed: params?.get('mixed') ?? undefined,
      }),
    [params],
  );
  const profile = useProfile();
  const aliases = useMemo(() => profile.data?.aliases ?? [], [profile.data?.aliases]);
  const games = useSeasonGames();
  const [now] = useState(() => Date.now());

  // Default to "Last 90 days" when no predicate is in the URL.
  const url = useMemo(() => (params ? `?${params.toString()}` : ''), [params]);
  const urlForLog = useMemo(() => `/season${url}`.replace(/\?$/, ''), [url]);

  const seasonResult = useMemo(() => {
    if (!games.data) return null;
    return buildSeason({
      games: games.data,
      aliases,
      predicate: predicate ?? { kind: 'last', value: '90' },
      now,
    });
  }, [games.data, aliases, now, predicate]);

  const record = useSeasonLog((state) => state.record);
  useEffect(() => {
    if (!seasonResult || 'error' in seasonResult) return;
    record({
      url: urlForLog,
      label: predicate ? namedSetUrl(predicate).replace(/^\/season/, '') : 'Last 90 days',
      sectionHashes: hashReport(seasonResult.report),
    });
  }, [record, seasonResult, urlForLog, predicate]);

  return (
    <WorkspaceFrame
      workspace="season"
      title="Season"
      subtitle="A named set of your games, joined into one report."
    >
      <div className="flex flex-col gap-4">
        <NavButton />
        {!predicate ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-secondary">
                Pick a named set above — last 90 days, an event, a site, or an opening. The default
                when no predicate is in the URL is <strong>Last 90 days</strong>; press a chip or
                change the dropdown to see another.
              </p>
            </PanelBody>
          </Panel>
        ) : null}
        <SeasonPicker
          games={games.data ?? []}
          predicate={predicate ?? { kind: 'last', value: '90' }}
        />
        {games.isPending ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-secondary">Reading your games…</p>
            </PanelBody>
          </Panel>
        ) : games.error ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-danger">
                Failed to read your games: {String(games.error)}
              </p>
            </PanelBody>
          </Panel>
        ) : seasonResult && 'error' in seasonResult ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-secondary">{seasonResult.error}</p>
            </PanelBody>
          </Panel>
        ) : seasonResult ? (
          <SeasonSections report={seasonResult.report} url={urlForLog} />
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}
