'use client';

/**
 * A player's photograph and its credit (`src/reference/player-photo.ts`).
 *
 * The picture is fetched as bytes and shown from a blob URL, so the page's
 * image policy stays `'self' data: blob:`; it is never written to storage.
 * Whatever goes wrong — offline, no roster match, no P18, no licence named —
 * the initials stay, which is what the card always showed.
 */

import { useQuery } from '@tanstack/react-query';

import { playerPhoto, rosterEntryFor, type PlayerPhoto } from '@/reference/player-photo';
import { loadTitledRoster } from '@/reference/titled-players';
import { usePreferences } from '@/stores/preferences-store';

interface LoadedPhoto extends PlayerPhoto {
  readonly objectUrl: string;
}

export function usePlayerPhoto(name: string) {
  // Off in Settings means no request to Wikimedia, not a request whose answer is hidden.
  const allowed = usePreferences((state) => state.showPlayerPhotos);
  const query = useQuery({
    queryKey: ['player-photo', name.trim().toLowerCase()],
    enabled: allowed && name.trim().length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<LoadedPhoto | null> => {
      const entry = rosterEntryFor(name, await loadTitledRoster());
      if (!entry) return null;
      const photo = await playerPhoto(entry.wikidata, (url) => fetch(url, { signal }));
      if (!photo) return null;
      const response = await fetch(photo.url, { signal });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;
      return { ...photo, objectUrl: URL.createObjectURL(blob) };
    },
  });
  return allowed ? query : { ...query, data: undefined };
}

const initials = (name: string): string =>
  name
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function PlayerPortrait({
  name,
  size = 'lg',
}: {
  readonly name: string;
  /**
   * `lg` for a player's own page, `sm` beside a name in a game's header, `xs`
   * within a line of text — as tall as the line, so it adds no height.
   */
  readonly size?: 'lg' | 'sm' | 'xs';
}) {
  const photo = usePlayerPhoto(name).data;
  const box =
    size === 'xs' ? 'size-5 text-[8px]' : size === 'sm' ? 'size-7 text-[10px]' : 'size-14 text-lg';
  if (photo) {
    return (
      // A blob URL from bytes already fetched; next/image has nothing to add.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.objectUrl}
        alt={`${name}, photograph by ${photo.author}`}
        className={`${box} shrink-0 rounded-full bg-surface-3 object-cover`}
        data-player-photo
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-secondary`}
    >
      {initials(name)}
    </span>
  );
}

/** The credit, wherever the photo is shown: author, licence, and the file's page. */
export function PlayerPhotoCredit({ name }: { readonly name: string }) {
  const photo = usePlayerPhoto(name).data;
  if (!photo) return null;
  return (
    <p className="truncate text-[10.5px] text-tertiary" data-player-photo-credit>
      Photo:{' '}
      <a href={photo.page} target="_blank" rel="noreferrer" className="hover:text-accent-ink">
        {photo.author}
      </a>
      ,{' '}
      {photo.licenceUrl ? (
        <a
          href={photo.licenceUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:text-accent-ink"
        >
          {photo.licence}
        </a>
      ) : (
        photo.licence
      )}
      , via Wikimedia Commons
    </p>
  );
}
