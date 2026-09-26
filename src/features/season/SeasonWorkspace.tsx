'use client';

/**
 * `/season` — the season reader's workspace.
 *
 * Receives the URL predicate from the server page, fetches the player's games
 * (one complete paged query), builds the season report, and renders the picker
 * at the top and the five sections below.
 *
 * No invented score, no rating chart, no "you've improved" headline.
 * The reader counts; the player reads. See `docs/design/season.md`.
 */

import { useEffect, useMemo, useState } from 'react';

import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { NavButton } from '@/features/shell/NavButton';
import { Panel, PanelBody } from '@/components/ui/Panel';
import { useProfile } from '@/features/persistence/queries';
import { buildSeason, seasonScope } from '@/season/season';
import Link from 'next/link';
import { WorkspaceDocument } from '@/features/workspace/WorkspaceDocument';
import { useUi } from '@/stores/ui-store';
import { describeNamedSet, namedSetUrl, type SeasonNamedSet } from '@/season/named-set';
import { useSeasonLog } from '@/stores/season-log-store';
import { hashReport } from '@/features/season/hash-report';
import { SeasonPicker } from './SeasonPicker';
import { SeasonSections } from './SeasonSections';
import { useSeasonGames } from './use-season-games';

export function SeasonWorkspace({ predicate }: { readonly predicate: SeasonNamedSet | null }) {
  const profile = useProfile();
  const aliases = useMemo(() => profile.data?.aliases ?? [], [profile.data?.aliases]);
  const games = useSeasonGames();
  const [now] = useState(() => Date.now());

  // Default to "Last 90 days" when no predicate is in the URL.
  const urlForLog = predicate ? namedSetUrl(predicate) : '/season';

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

  const scope = useMemo(
    () => (games.data ? seasonScope({ games: games.data, aliases }) : null),
    [games.data, aliases],
  );
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const label = predicate ? describeNamedSet(predicate) : 'Last 90 days';

  /*
    Why a period is empty, in the order the causes apply. "No games match"
    alone was said for all four, including the commonest — Kingfisher not
    knowing which player is you — which no choice of period could fix.
  */
  const emptyBecause =
    !scope || scope.yours > 0 ? null : scope.library === 0 ? (
      <>
        My games is empty.{' '}
        <Link className="underline" href="/games">
          Import your games
        </Link>{' '}
        — a PGN from your club, or a linked Lichess or Chess.com account — and they are read here.
      </>
    ) : scope.names === 0 ? (
      <>
        You have {scope.library.toLocaleString()} games in My games, but Kingfisher does not know
        which player is you, and it never guesses.{' '}
        <button type="button" className="underline" onClick={() => openSettingsAt('profile')}>
          Add the names you play under
        </button>{' '}
        in Settings → Profile.
      </>
    ) : (
      <>
        None of your {scope.library.toLocaleString()} games in My games has a player named as in
        Settings → Profile ({scope.names} {scope.names === 1 ? 'name' : 'names'}).{' '}
        <button type="button" className="underline" onClick={() => openSettingsAt('profile')}>
          Check the names
        </button>
        : they must match the PGN exactly, as “Surname, Forename” or a handle.
      </>
    );

  return (
    <WorkspaceFrame
      workspace="season"
      title="Season"
      subtitle="Your own games over a period, an event, a site or an opening."
      takeover={
        <WorkspaceDocument label="Season report">
          <NavButton />
          <section className="flex flex-col gap-2" data-season-scope>
            <SeasonPicker
              games={games.data ?? []}
              predicate={predicate ?? { kind: 'last', value: '90' }}
            />
            {scope && scope.yours > 0 ? (
              <p className="text-xs text-tertiary">
                Reading {scope.yours.toLocaleString()} of your games (of{' '}
                {scope.library.toLocaleString()} in My games
                {scope.firstYear !== null
                  ? `, dated ${scope.firstYear === scope.lastYear ? scope.firstYear : `${scope.firstYear}–${scope.lastYear}`}`
                  : ''}
                {scope.undatedYours ? `; ${scope.undatedYours.toLocaleString()} undated` : ''}).
                Showing {label}.
              </p>
            ) : null}
          </section>
          {games.isPending ? (
            <Panel>
              <PanelBody>
                <p className="text-sm text-secondary">Reading your games…</p>
              </PanelBody>
            </Panel>
          ) : games.error ? (
            <Panel>
              <PanelBody>
                <p className="text-sm text-danger" role="alert">
                  Your games could not be read: {String(games.error)}
                </p>
              </PanelBody>
            </Panel>
          ) : emptyBecause ? (
            <Panel>
              <PanelBody>
                <p className="text-sm text-secondary" data-season-empty>
                  {emptyBecause}
                </p>
              </PanelBody>
            </Panel>
          ) : seasonResult && 'error' in seasonResult ? (
            <Panel>
              <PanelBody>
                <p className="text-sm text-secondary" data-season-empty>
                  {seasonResult.error}
                  {scope && scope.firstYear !== null
                    ? ` Your games are dated ${scope.firstYear === scope.lastYear ? scope.firstYear : `${scope.firstYear}–${scope.lastYear}`}; choose a longer period, or an event or site.`
                    : ''}
                </p>
              </PanelBody>
            </Panel>
          ) : seasonResult ? (
            <SeasonSections report={seasonResult.report} url={urlForLog} />
          ) : null}
        </WorkspaceDocument>
      }
    />
  );
}
