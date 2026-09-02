'use client';

/**
 * Getting back to work.
 *
 * A player returning to Kingfisher almost always wants one of two things: the
 * thing they were doing last, or one of the four or five things they are
 * working on this month. So this is a short list and one strong action, not a
 * dashboard — no charts, no counters nobody acts on, nothing that has to be
 * read before it can be used.
 *
 * Continue is the point of the page. The session is already restored from the
 * draft by `useWorkspacePersistence`, so this does not rebuild any state: it
 * says what will be reopened and takes the user to the right route, which is
 * the honest description of what continuing actually is.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Board, Library, Notebook, Pin, Recall, Repertoire } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { getRepositories } from '@/persistence/repositories';
import { gameTitle } from '@/persistence/describe';
import { useAnalysis } from '@/stores/analysis-store';
import { usePins, type PinKind } from '@/stores/pins-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

/** Short enough to scan in one glance; the palette handles everything else. */
const LIMIT = 6;

export function RecentWorkspace() {
  const router = useRouter();
  const document = useAnalysis((state) => state.document);
  const openDocument = useAnalysis((state) => state.openDocument);
  const notify = useUi((state) => state.notify);
  const pins = usePins((state) => state.pins);
  const togglePin = usePins((state) => state.toggle);

  const data = useQuery({
    queryKey: ['recent-work'],
    staleTime: 5_000,
    retry: false,
    queryFn: async () => {
      const repositories = await getRepositories();
      const [studies, repertoires, games, due] = await Promise.all([
        repositories.studies.list(),
        repositories.repertoires.list(),
        repositories.games.search({ sortBy: 'importedAt', sortDirection: 'desc', limit: LIMIT }),
        repositories.training.due(Date.now(), 50),
      ]);

      // Chapters come from the most recent studies only: reading every chapter
      // of every study to sort six rows would read the whole library.
      const recentStudies = studies.slice(0, LIMIT);
      const chapters = (
        await Promise.all(
          recentStudies.map(async (study) => {
            const loaded = await repositories.studies.get(study.id);
            return (loaded?.chapters ?? []).map((chapter) => ({ chapter, study }));
          }),
        )
      )
        .flat()
        .sort((a, b) => b.chapter.updatedAt - a.chapter.updatedAt)
        .slice(0, LIMIT);

      return { studies: recentStudies, repertoires, games: games.games, chapters, due };
    },
  });

  const openChapter = async (chapterId: string) => {
    try {
      const repositories = await getRepositories();
      const chapter = await repositories.studies.getChapter(chapterId);
      if (!chapter) throw new Error('That chapter no longer exists.');
      const study = await repositories.studies.get(chapter.studyId);
      openDocument({
        tree: chapter.tree,
        document: {
          kind: 'study-chapter',
          title: chapter.title,
          studyId: chapter.studyId,
          studyTitle: study?.study.title ?? 'Study',
          chapterId: chapter.id,
          revision: chapter.revision,
        },
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That chapter could not be opened.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const openGame = async (gameId: string) => {
    try {
      const repositories = await getRepositories();
      const full = await repositories.games.get(gameId);
      if (!full) throw new Error('That game no longer exists.');
      openDocument({
        tree: full.tree,
        document: { kind: 'database-game', title: gameTitle(full), gameId: full.id },
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That game could not be opened.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const pinned = data.data
    ? pins
        .map((pin) => {
          if (pin.kind === 'study') {
            const study = data.data.studies.find((entry) => entry.id === pin.id);
            return study ? { pin, label: study.title, href: '/studies' } : null;
          }
          if (pin.kind === 'repertoire') {
            const repertoire = data.data.repertoires.find((entry) => entry.id === pin.id);
            return repertoire ? { pin, label: repertoire.title, href: '/repertoire' } : null;
          }
          const game = data.data.games.find((entry) => entry.id === pin.id);
          return game ? { pin, label: gameTitle(game), href: '/games' } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-line-subtle px-5 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-primary">Recent work</h1>
        <p className="mt-0.5 text-sm text-secondary">Pick up where you left off.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            icon={<Board />}
            onClick={() => router.push('/analysis')}
            data-continue
          >
            Continue {document.title}
          </Button>
          <span className="text-xs text-tertiary">
            {document.kind === 'study-chapter'
              ? `Chapter in ${document.studyTitle}`
              : document.kind === 'database-game'
                ? 'A game from your database'
                : 'Your unsaved analysis'}
            {' · board, position and tools as you left them'}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
        {pinned.length > 0 && (
          <Section title="Pinned" icon={<Pin />}>
            {pinned.map(({ pin, label, href }) => (
              <Row
                key={`${pin.kind}-${pin.id}`}
                label={label}
                meta={pin.kind}
                href={href}
                pinned
                onPin={() => togglePin(pin.kind, pin.id)}
              />
            ))}
          </Section>
        )}

        <Section title="Chapters" icon={<Notebook />}>
          {data.data?.chapters.length === 0 && <Empty what="chapters" href="/studies" />}
          {data.data?.chapters.map(({ chapter, study }) => (
            <Row
              key={chapter.id}
              label={chapter.title}
              meta={`${study.title} · ${ago(chapter.updatedAt)}`}
              onOpen={() => void openChapter(chapter.id)}
            />
          ))}
        </Section>

        <Section title="Studies" icon={<Notebook />}>
          {data.data?.studies.length === 0 && <Empty what="studies" href="/studies" />}
          {data.data?.studies.map((study) => (
            <Row
              key={study.id}
              label={study.title}
              meta={ago(study.updatedAt)}
              href="/studies"
              pinned={pins.some((pin) => pin.kind === 'study' && pin.id === study.id)}
              onPin={() => togglePin('study', study.id)}
            />
          ))}
        </Section>

        <Section title="Games" icon={<Library />}>
          {data.data?.games.length === 0 && <Empty what="games" href="/games" />}
          {data.data?.games.map((game) => (
            <Row
              key={game.id}
              label={gameTitle(game)}
              meta={game.event ?? game.date ?? ''}
              onOpen={() => void openGame(game.id)}
              pinned={pins.some((pin) => pin.kind === 'game' && pin.id === game.id)}
              onPin={() => togglePin('game', game.id)}
            />
          ))}
        </Section>

        <Section title="Repertoires" icon={<Repertoire />}>
          {data.data?.repertoires.length === 0 && <Empty what="repertoires" href="/repertoire" />}
          {data.data?.repertoires.map((repertoire) => (
            <Row
              key={repertoire.id}
              label={repertoire.title}
              meta={`${repertoire.color === 'w' ? 'White' : 'Black'} · ${ago(repertoire.updatedAt)}`}
              href="/repertoire"
              pinned={pins.some((pin) => pin.kind === 'repertoire' && pin.id === repertoire.id)}
              onPin={() => togglePin('repertoire', repertoire.id)}
            />
          ))}
        </Section>

        <Section title="Training due" icon={<Recall />}>
          {(data.data?.due.length ?? 0) === 0 ? (
            <p className="px-3 py-2 text-xs text-tertiary">Nothing is due right now.</p>
          ) : (
            <Row
              label={`${data.data!.due.length} position${data.data!.due.length === 1 ? '' : 's'} due`}
              meta="Spaced recall over positions you recorded"
              href="/training"
            />
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[5px] border border-line-subtle bg-surface-1">
      <h2 className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs font-semibold uppercase tracking-[0.07em] text-tertiary">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {title}
      </h2>
      <div className="divide-y divide-line-subtle">{children}</div>
    </section>
  );
}

function Row({
  label,
  meta,
  href,
  onOpen,
  pinned,
  onPin,
}: {
  label: string;
  meta?: string;
  href?: string;
  onOpen?: () => void;
  pinned?: boolean;
  onPin?: () => void;
}) {
  const body = (
    <>
      <span className="block truncate text-sm text-primary">{label}</span>
      {meta ? (
        <span className="mt-0.5 block truncate text-[11px] text-tertiary">{meta}</span>
      ) : null}
    </>
  );

  return (
    <div className="flex items-center gap-1 pr-1">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 px-3 py-2 hover:bg-surface-2">
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-surface-2"
        >
          {body}
        </button>
      )}
      {onPin && (
        <IconButton
          label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          onClick={onPin}
          className={cn(pinned && 'text-accent')}
        >
          <Pin />
        </IconButton>
      )}
    </div>
  );
}

function Empty({ what, href }: { what: string; href: string }) {
  return (
    <div className="p-3">
      <EmptyState
        title={`No ${what} yet.`}
        description="They appear here once you create one."
        action={
          <Link href={href} className="text-xs text-accent hover:underline">
            Go to {what}
          </Link>
        }
      />
    </div>
  );
}

function ago(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString();
}

export type { PinKind };
