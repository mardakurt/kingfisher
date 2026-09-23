'use client';

/**
 * The search mask's new sections (`docs/design/search-mask.md`).
 *
 * Header fields narrow through the repository like every other filter. The
 * move fields are different in kind — they read each selected game's moves —
 * so they run only when asked, say how far they have read, and can be
 * stopped. Every input that parses something says what it could not read,
 * next to the input, instead of quietly matching nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { STRATEGIC_THEMES, themeById } from '@/chess/themes';
import type { Color } from '@/chess/types';
import { getRepositories } from '@/persistence/repositories';
import type { GameSearchQuery } from '@/persistence/types';
import { hasDeepFilters, type DeepQuery } from '@/search/game-scan';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';
import {
  TIME_CLASSES,
  TIME_CLASS_LABEL,
  TIME_CLASS_RULE,
  type TimeClass,
} from '@/search/time-control';

import { runDeepSearch, type DeepSearchState } from './deep-search';

export const FIELD =
  'h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60';

export const Field = ({
  label,
  children,
  wide = false,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly wide?: boolean | 'date';
}) => (
  <label
    className={`flex ${wide === 'date' ? 'w-[132px]' : wide ? 'w-[180px]' : 'w-[104px]'} shrink-0 flex-col gap-1 text-[10px] uppercase tracking-wide text-tertiary`}
  >
    {label}
    {children}
  </label>
);

// --- header -----------------------------------------------------------------

export interface HeaderMask {
  readonly event: string;
  readonly site: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly maxRating: string;
  readonly ratingScope: 'either' | 'both';
  readonly timeClass: TimeClass | 'any';
}

export const EMPTY_HEADER: HeaderMask = {
  event: '',
  site: '',
  fromDate: '',
  toDate: '',
  maxRating: '',
  ratingScope: 'either',
  timeClass: 'any',
};

export const headerMaskActive = (mask: HeaderMask): boolean =>
  Boolean(
    mask.event.trim() || mask.site.trim() || mask.fromDate || mask.toDate || mask.maxRating,
  ) || mask.timeClass !== 'any';

export function headerMaskQuery(mask: HeaderMask, minRating: string): Partial<GameSearchQuery> {
  const banded = Number(minRating) > 0 || Number(mask.maxRating) > 0;
  return {
    ...(mask.event.trim() ? { event: mask.event.trim() } : {}),
    ...(mask.site.trim() ? { site: mask.site.trim() } : {}),
    ...(mask.fromDate ? { fromDate: mask.fromDate } : {}),
    ...(mask.toDate ? { toDate: mask.toDate } : {}),
    ...(Number(mask.maxRating) > 0 ? { maxRating: Number(mask.maxRating) } : {}),
    ...(banded && mask.ratingScope === 'both' ? { ratingScope: 'both' as const } : {}),
    ...(mask.timeClass !== 'any' ? { timeClass: mask.timeClass } : {}),
  };
}

/** A saved filter's header fields back into the mask, including pre-Phase-81 years. */
export function headerMaskFrom(filters: Partial<GameSearchQuery>): HeaderMask {
  return {
    event: filters.event ?? '',
    site: filters.site ?? '',
    fromDate: filters.fromDate ?? (filters.fromYear ? `${filters.fromYear}-01-01` : ''),
    toDate: filters.toDate ?? (filters.toYear ? `${filters.toYear}-12-31` : ''),
    maxRating: filters.maxRating?.toString() ?? '',
    ratingScope: filters.ratingScope ?? 'either',
    timeClass: filters.timeClass ?? 'any',
  };
}

export function HeaderMaskFields({
  mask,
  onChange,
}: {
  readonly mask: HeaderMask;
  readonly onChange: (next: HeaderMask) => void;
}) {
  const set = <K extends keyof HeaderMask>(key: K, value: HeaderMask[K]) =>
    onChange({ ...mask, [key]: value });
  const rangeBackwards = Boolean(mask.fromDate && mask.toDate && mask.fromDate > mask.toDate);
  return (
    <>
      <Field label="Event">
        <input
          value={mask.event}
          onChange={(event) => set('event', event.target.value)}
          className={FIELD}
          placeholder="Olympiad"
          title="Any part of the Event tag; case is ignored."
        />
      </Field>
      <Field label="Site">
        <input
          value={mask.site}
          onChange={(event) => set('site', event.target.value)}
          className={FIELD}
          placeholder="lichess"
          title="Any part of the Site tag; case is ignored."
        />
      </Field>
      <Field label="From date" wide="date">
        <input
          type="date"
          value={mask.fromDate}
          onChange={(event) => set('fromDate', event.target.value)}
          className={FIELD}
          aria-invalid={rangeBackwards || undefined}
        />
      </Field>
      <Field label="To date" wide="date">
        <input
          type="date"
          value={mask.toDate}
          onChange={(event) => set('toDate', event.target.value)}
          className={FIELD}
          aria-invalid={rangeBackwards || undefined}
          title="A game dated only by its year counts when that year is inside the range. A game with no date is never assumed to be inside one."
        />
      </Field>
      {rangeBackwards ? (
        <p role="alert" className="w-full text-2xs text-caution">
          The range ends before it starts, so no game can be inside it.
        </p>
      ) : null}
      <Field label="Max Elo">
        <input
          value={mask.maxRating}
          inputMode="numeric"
          onChange={(event) => set('maxRating', event.target.value.replace(/\D/g, ''))}
          className={FIELD}
          placeholder="2600"
        />
      </Field>
      <Field label="Elo of">
        <select
          value={mask.ratingScope}
          onChange={(event) => set('ratingScope', event.target.value as 'either' | 'both')}
          className={FIELD}
          title="Either: at least one player's rating is in the band. Both: both ratings are known and in it."
        >
          <option value="either">Either</option>
          <option value="both">Both</option>
        </select>
      </Field>
      <Field label="Time control">
        <select
          value={mask.timeClass}
          onChange={(event) => set('timeClass', event.target.value as TimeClass | 'any')}
          className={FIELD}
          title={TIME_CLASS_RULE}
          aria-describedby="time-class-rule"
        >
          <option value="any">Any</option>
          {TIME_CLASSES.map((id) => (
            <option key={id} value={id}>
              {TIME_CLASS_LABEL[id]}
            </option>
          ))}
        </select>
      </Field>
      {mask.timeClass !== 'any' ? (
        <p id="time-class-rule" className="w-full text-2xs normal-case text-tertiary">
          {TIME_CLASS_RULE}
        </p>
      ) : null}
    </>
  );
}

// --- moves ------------------------------------------------------------------

export interface MoveMask {
  readonly material: string;
  readonly materialColour: Color | 'either';
  readonly theme: string;
  readonly route: string;
  readonly routeColour: Color | 'either';
  readonly comment: string;
}

export const EMPTY_MOVES: MoveMask = {
  material: '',
  materialColour: 'either',
  theme: '',
  route: '',
  routeColour: 'either',
  comment: '',
};

export interface CompiledMoves {
  readonly query: DeepQuery;
  readonly errors: { readonly material?: string; readonly route?: string };
}

export function compileMoves(mask: MoveMask): CompiledMoves {
  const errors: { material?: string; route?: string } = {};
  let material: DeepQuery['material'];
  if (mask.material.trim()) {
    const parsed = parseMaterialQuery(mask.material);
    if (parsed.ok) {
      material = {
        query: parsed.query,
        ...(mask.materialColour !== 'either' ? { colour: mask.materialColour } : {}),
      };
    } else errors.material = parsed.error;
  }
  let route: DeepQuery['route'];
  if (mask.route.trim()) {
    const parsed = parseRoute(mask.route);
    if (parsed.ok) {
      route = {
        route: parsed.route,
        ...(mask.routeColour !== 'either' ? { colour: mask.routeColour } : {}),
      };
    } else errors.route = parsed.error;
  }
  return {
    query: {
      ...(material ? { material } : {}),
      ...(mask.theme ? { theme: mask.theme } : {}),
      ...(route ? { route } : {}),
      ...(mask.comment.trim() ? { comment: mask.comment.trim() } : {}),
    },
    errors,
  };
}

export function MoveMaskFields({
  mask,
  onChange,
  compiled,
  state,
  onSearch,
  onStop,
  onClear,
}: {
  readonly mask: MoveMask;
  readonly onChange: (next: MoveMask) => void;
  readonly compiled: CompiledMoves;
  readonly state: DeepSearchState | null;
  readonly onSearch: () => void;
  readonly onStop: () => void;
  readonly onClear: () => void;
}) {
  const set = <K extends keyof MoveMask>(key: K, value: MoveMask[K]) =>
    onChange({ ...mask, [key]: value });
  const theme = mask.theme ? themeById(mask.theme) : undefined;
  const invalid = Boolean(compiled.errors.material || compiled.errors.route);
  const running = state?.status === 'running';
  return (
    <fieldset
      className="flex w-full flex-wrap items-end gap-2 border-t border-line-subtle pt-2"
      data-search-moves
    >
      <legend className="sr-only">In the moves</legend>
      <p className="w-full text-[10px] uppercase tracking-wide text-tertiary">
        In the moves{' '}
        <span className="normal-case tracking-normal">
          — these read each selected game’s moves, so they run when you ask.
        </span>
      </p>
      <Field label="Material" wide>
        <input
          value={mask.material}
          onChange={(event) => set('material', event.target.value)}
          className={FIELD}
          placeholder="R v B"
          aria-invalid={Boolean(compiled.errors.material) || undefined}
          title="Kings are implied; pawns count only if you name one. Must hold for two positions, or be where the game ended."
        />
      </Field>
      <Field label="First side is">
        <select
          value={mask.materialColour}
          onChange={(event) => set('materialColour', event.target.value as Color | 'either')}
          className={FIELD}
        >
          <option value="either">Either</option>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </Field>
      <Field label="Theme" wide>
        <select
          value={mask.theme}
          onChange={(event) => set('theme', event.target.value)}
          className={FIELD}
        >
          <option value="">Any</option>
          {STRATEGIC_THEMES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Route" wide>
        <input
          value={mask.route}
          onChange={(event) => set('route', event.target.value)}
          className={FIELD}
          placeholder="N b1 d2 f1 g3"
          aria-invalid={Boolean(compiled.errors.route) || undefined}
          title="One piece making exactly these moves in order; it may wait, but may not move elsewhere in between."
        />
      </Field>
      <Field label="Route by">
        <select
          value={mask.routeColour}
          onChange={(event) => set('routeColour', event.target.value as Color | 'either')}
          className={FIELD}
        >
          <option value="either">Either</option>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </Field>
      <Field label="Comment" wide>
        <input
          value={mask.comment}
          onChange={(event) => set('comment', event.target.value)}
          className={FIELD}
          placeholder="zugzwang"
          title="Any comment in the game, variations included; case is ignored."
        />
      </Field>
      <div className="flex items-end gap-1.5">
        {running ? (
          <Button variant="subtle" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="accent"
            onClick={onSearch}
            disabled={invalid || !hasDeepFilters(compiled.query)}
            data-search-moves-run
          >
            Search the moves
          </Button>
        )}
        {state && !running ? <Button onClick={onClear}>Clear move search</Button> : null}
      </div>
      {compiled.errors.material ? (
        <p role="alert" className="w-full text-2xs text-caution">
          Material: {compiled.errors.material}
        </p>
      ) : null}
      {compiled.errors.route ? (
        <p role="alert" className="w-full text-2xs text-caution">
          Route: {compiled.errors.route}
        </p>
      ) : null}
      {theme ? (
        <p className="w-full text-2xs text-tertiary" data-theme-definition>
          <span className="text-secondary">{theme.name}:</span> {theme.definition} Held for two
          positions, or where the game ended.
        </p>
      ) : null}
    </fieldset>
  );
}

// --- the scan's lifecycle ---------------------------------------------------

export function useDeepSearch() {
  const [state, setState] = useState<DeepSearchState | null>(null);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => controller.current?.abort(), []);
  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState(null);
  }, []);

  const start = useCallback(
    async (header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>, deep: DeepQuery) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setState({ status: 'running', read: 0, selected: 0, matches: [] });
      const repositories = await getRepositories();
      await runDeepSearch({
        games: repositories.games,
        header,
        deep,
        signal: next.signal,
        // A superseded search must not paint over the one that replaced it.
        onProgress: (progress) => {
          if (controller.current === next) setState(progress);
        },
      });
    },
    [],
  );

  // Leaving the page stops the reading; nothing keeps running unseen.
  useEffect(() => () => controller.current?.abort(), []);

  return useMemo(() => ({ state, start, stop, clear }), [state, start, stop, clear]);
}

/** "after White's 17th move" — where a move-level match was found. */
export function foundAtLabel(ply: number): string {
  if (ply <= 0) return 'at the start';
  const move = Math.ceil(ply / 2);
  return `after ${ply % 2 === 1 ? 'White' : 'Black'}’s move ${move}`;
}
