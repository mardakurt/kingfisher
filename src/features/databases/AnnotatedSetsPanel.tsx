'use client';

/**
 * Public-domain annotated games (Phase 85): books whose games and notes are
 * out of copyright, transcribed by `npm run annotated:build` into
 * `public/data/annotated/`.
 *
 * Nothing is added until asked. "Add to my games" fetches the set, checks it
 * against the digest its catalog row records, and imports it like any PGN —
 * so the games land in the player's own database with the book, the edition
 * and the game number in their tags, and a second click adds nothing twice.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { invalidateGames } from '@/features/persistence/queries';
import { importGames } from '@/persistence/import-game';
import { getRepositories } from '@/persistence/repositories';
import { useUi } from '@/stores/ui-store';

interface AnnotatedSet {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly year: number;
  readonly edition: string;
  readonly source: string;
  readonly rights: string;
  readonly file: string;
  readonly sha256: string;
  readonly games: number;
  readonly notes: number;
}

const BASE = '/data/annotated';

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function AnnotatedSetsPanel() {
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ['annotated-sets'],
    queryFn: async (): Promise<readonly AnnotatedSet[]> => {
      const response = await fetch(`${BASE}/catalog.json`);
      if (!response.ok) throw new Error(`The catalog could not be read (HTTP ${response.status}).`);
      return ((await response.json()) as { sets: AnnotatedSet[] }).sets;
    },
    staleTime: Infinity,
  });

  const add = async (set: AnnotatedSet) => {
    setBusy(set.id);
    try {
      const response = await fetch(`${BASE}/${set.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const digest = await sha256Hex(bytes);
      if (digest !== set.sha256) {
        throw new Error('The file is not the one its catalog describes; nothing was added.');
      }
      const repositories = await getRepositories();
      const summary = await importGames(new TextDecoder().decode(bytes), repositories.games);
      invalidateGames(client);
      notify({
        tone: 'success',
        message:
          summary.imported === 0
            ? `Every game of ${set.title} is already in your games.`
            : `${summary.imported} game${summary.imported === 1 ? '' : 's'} from ${set.title} added to your games.`,
        detail:
          `${set.author}, ${set.year}, with the author's notes. ${summary.duplicates ? `${summary.duplicates} were already there.` : ''}`.trim(),
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: `${set.title} could not be added.`,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border-t border-line-subtle px-4 py-3" aria-label="Annotated classics">
      <h2 className="text-xs font-semibold text-tertiary">Annotated classics</h2>
      <p className="mt-1 text-[11px] leading-snug text-tertiary">
        Games from public-domain books, with the author&apos;s own notes, every move checked against
        the rules as it was transcribed.
      </p>
      {catalog.isError ? (
        <p className="mt-2 text-xs text-tertiary">{catalog.error.message}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {(catalog.data ?? []).map((set) => (
            <li key={set.id} data-annotated-set={set.id}>
              <div className="text-sm text-primary">
                {set.title}{' '}
                <span className="text-tertiary">
                  · {set.author}, {set.year}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-tertiary tabular">
                {set.games} games · {set.notes} notes · public domain · {set.edition}
              </p>
              <Button
                size="sm"
                className="mt-1"
                disabled={busy !== null}
                onClick={() => void add(set)}
              >
                {busy === set.id ? 'Adding…' : 'Add to my games'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
