'use client';

/**
 * Search, as a page.
 *
 * The palette is the fast path and is unchanged. This is the other half of
 * the research's complaint (`docs/design/organising-work.md`): a result list
 * a person can read, sort through and come back to, with the query in the
 * URL so it can be linked and reloaded. One box: a FEN, a move sequence, or
 * words — and it says which it decided, because a query read the wrong way
 * silently answers a different question.
 *
 * It searches the player's own work. Not the reference packs, not the
 * explorer, not the web, and it says so.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';

import { Search } from '@/components/icons';
import { EmptyState } from '@/components/ui/Panel';
import { NavButton } from '@/features/shell/NavButton';
import { openPositionHit, openWorkspaceHit } from '@/features/search/open-hit';
import { parseMoveSequence } from '@/features/search/move-sequence';
import {
  canonicalise,
  positionHitLabel,
  searchByPosition,
  type PositionHit,
} from '@/persistence/position-search';
import { getRepositories } from '@/persistence/repositories';
import { searchWorkspace, type WorkspaceSearchHit } from '@/persistence/search';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

type Reading =
  | { readonly kind: 'empty' }
  | { readonly kind: 'position'; readonly fen: string; readonly from: 'fen' | 'moves' }
  | { readonly kind: 'words'; readonly text: string };

/** What the box was read as. Stated on the page, never guessed at silently. */
export function readQuery(raw: string): Reading {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  const fen = canonicalise(trimmed);
  if (fen) return { kind: 'position', fen, from: 'fen' };
  const sequence = parseMoveSequence(trimmed);
  if (sequence.ok) return { kind: 'position', fen: sequence.fen, from: 'moves' };
  return { kind: 'words', text: trimmed };
}

const READING_LABEL: Record<Reading['kind'], string> = {
  empty: '',
  position: 'Read as a position',
  words: 'Read as words',
};

/** Hits grouped by their kind's label, in the order the kinds first appear. */
function groupPositionHits(
  hits: readonly PositionHit[],
): readonly { readonly label: string; readonly hits: readonly PositionHit[] }[] {
  const groups = new Map<string, PositionHit[]>();
  for (const hit of hits) {
    const label = positionHitLabel(hit.kind);
    const list = groups.get(label) ?? [];
    list.push(hit);
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, group]) => ({ label, hits: group }));
}

function groupWorkspaceHits(
  hits: readonly WorkspaceSearchHit[],
): readonly { readonly label: string; readonly hits: readonly WorkspaceSearchHit[] }[] {
  const groups = new Map<string, WorkspaceSearchHit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.kind) ?? [];
    list.push(hit);
    groups.set(hit.kind, list);
  }
  return [...groups.entries()].map(([label, group]) => ({ label, hits: group }));
}

export function SearchWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  /*
    The URL is the query. The box is a controlled input over `?q=`, so a
    linked or reloaded search shows its own results and the browser's back
    button walks the searches — which is the reason to have a page at all
    rather than a second palette.
  */
  const text = params.get('q') ?? '';

  const reading = useMemo(() => readQuery(text), [text]);

  const positions = useQuery({
    queryKey: ['search-page', 'position', reading.kind === 'position' ? reading.fen : ''],
    enabled: reading.kind === 'position',
    queryFn: async () =>
      searchByPosition(await getRepositories(), (reading as { fen: string }).fen),
  });
  const words = useQuery({
    queryKey: ['search-page', 'words', reading.kind === 'words' ? reading.text : ''],
    enabled: reading.kind === 'words',
    queryFn: async () =>
      searchWorkspace(await getRepositories(), (reading as { text: string }).text, 120),
  });

  const navigate = (href: string) => router.push(href);
  const failed = (error: unknown) =>
    notify({
      tone: 'error',
      message: error instanceof Error ? error.message : 'That could not be opened.',
    });

  const positionGroups = groupPositionHits(positions.data?.hits ?? []);
  const structureGroups = groupPositionHits(positions.data?.structure ?? []);
  const wordGroups = groupWorkspaceHits(words.data ?? []);
  const total =
    reading.kind === 'position'
      ? (positions.data?.hits.length ?? 0) + (positions.data?.structure.length ?? 0)
      : (words.data?.length ?? 0);
  const loading = positions.isFetching || words.isFetching;

  const submit = (value: string) => {
    const url = value.trim() ? `/search?q=${encodeURIComponent(value.trim())}` : '/search';
    router.replace(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-workspace-frame="search">
      <header className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-2 py-2">
        <NavButton />
        <Search className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Search</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            Everything you have made or imported — by position, by line, or by name.
          </p>
        </div>
      </header>

      <div className="shrink-0 border-b border-line-subtle p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(text);
          }}
        >
          <input
            aria-label="Search your work"
            value={text}
            autoFocus
            spellCheck={false}
            onChange={(event) => submit(event.target.value)}
            placeholder="A FEN, a line like 1.e4 c5 2.Nf3, or a name"
            className="h-9 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
          />
        </form>
        <p className="mt-1 text-2xs text-tertiary" data-testid="search-reading">
          {reading.kind === 'empty'
            ? 'Type a position, a line, or a name.'
            : `${READING_LABEL[reading.kind]}${
                reading.kind === 'position'
                  ? reading.from === 'moves'
                    ? ' (from the moves you typed)'
                    : ''
                  : ''
              }${loading ? ' · searching…' : ` · ${total} result${total === 1 ? '' : 's'}`}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
        {reading.kind === 'empty' ? (
          <EmptyState
            title="Search your own work."
            description="Studies and their chapters, games, repertoire lines, training items, opening files, preparation, reviews and hand-ins. Reference packs and the explorer are not searched here — they answer about a population, not about you."
          />
        ) : total === 0 && !loading ? (
          <EmptyState
            title="Nothing of yours matches."
            description={
              reading.kind === 'position'
                ? 'This position is not in any study, game, repertoire or note you have. The explorer answers what a population played; this answers what you have.'
                : 'No study, chapter, game, player, repertoire, set or note has that in its name.'
            }
          />
        ) : null}

        {[...positionGroups, ...wordGroups.map(() => null)].length && reading.kind === 'position'
          ? positionGroups.map((group) => (
              <section key={group.label} className="mb-3" data-testid={`group-${group.label}`}>
                <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {group.label} · {group.hits.length}
                </h2>
                <ul className="space-y-1">
                  {group.hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="w-full rounded-[4px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
                        onClick={() => void openPositionHit(hit, navigate).catch(failed)}
                      >
                        <span className="block truncate text-primary">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-2xs text-tertiary">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          : null}

        {reading.kind === 'position' && structureGroups.length ? (
          <section className="mb-3" data-testid="group-structure">
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Same pawns, elsewhere in your work ·{' '}
              {structureGroups.reduce((sum, group) => sum + group.hits.length, 0)}
            </h2>
            <ul className="space-y-1">
              {structureGroups.flatMap((group) =>
                group.hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="w-full rounded-[4px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
                      onClick={() => void openPositionHit(hit, navigate).catch(failed)}
                    >
                      <span className="block truncate text-primary">{hit.title}</span>
                      <span className="block truncate text-2xs text-tertiary">
                        {group.label}
                        {hit.subtitle ? ` · ${hit.subtitle}` : ''}
                      </span>
                    </button>
                  </li>
                )),
              )}
            </ul>
          </section>
        ) : null}

        {reading.kind === 'words'
          ? wordGroups.map((group) => (
              <section key={group.label} className="mb-3" data-testid={`group-${group.label}`}>
                <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {group.label} · {group.hits.length}
                </h2>
                <ul className="space-y-1">
                  {group.hits.map((hit) => (
                    <li key={`${hit.kind}:${hit.id}`}>
                      <button
                        type="button"
                        className={cn(
                          'w-full rounded-[4px] border border-line px-2 py-1.5 text-left hover:bg-surface-2',
                        )}
                        onClick={() => void openWorkspaceHit(hit, navigate).catch(failed)}
                      >
                        <span className="block truncate text-primary">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-2xs text-tertiary">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          : null}
      </div>
    </div>
  );
}
