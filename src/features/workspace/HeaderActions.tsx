'use client';

/**
 * A route's header actions, folded to fit.
 *
 * The frame hands this the actions a route declared and the measurements of
 * everything else in the header; `fitHeaderActions` decides which are drawn,
 * whether with their short labels, and which go behind "⋯". Each action's
 * accessible name is its full label whatever is drawn, so a shortened or
 * folded action is still the same control to a screen reader and to the
 * browser suite.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { MoreHorizontal } from '@/components/icons';

import { fitHeaderActions, type HeaderActionWidths } from './header-actions';

export interface RouteAction {
  readonly id: string;
  readonly label: string;
  /** Drawn instead of `label` when the row is tight; the name stays `label`. */
  readonly shortLabel?: string;
  readonly icon?: ReactNode;
  readonly variant?: 'ghost' | 'subtle' | 'accent' | 'danger';
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onClick: () => void;
  /** A data attribute for the harnesses that find the control by it. */
  readonly dataAttribute?: string;
}

/** The "⋯" button's width before it has been drawn. */
const MORE_WIDTH_ESTIMATE = 36;

export function HeaderActions({
  actions,
  available,
  onMeasured,
}: {
  readonly actions: readonly RouteAction[];
  /**
   * Room left for these actions after the header's other content and the
   * title's floor; negative before the frame has measured anything.
   */
  readonly available: number;
  /** Reports the drawn actions' total width, so the frame can subtract it. */
  readonly onMeasured?: (width: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, HeaderActionWidths>>({});
  const [moreWidth, setMoreWidth] = useState(0);

  const ids = actions.map((action) => action.id);
  const fit = fitHeaderActions({
    ids,
    widthOf: (id) => widths[id],
    available,
    moreWidth: moreWidth || MORE_WIDTH_ESTIMATE,
  });

  // Measured after every paint whose contents could differ: the actions drawn,
  // the labels they carry, and the row itself. Written only when a number
  // moved, so the effect settles after one extra render at most.
  const drawn = `${fit.shown.join('|')}:${fit.compact ? 'c' : 'f'}:${ids.join('|')}`;
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const next: Record<string, HeaderActionWidths> = {};
    for (const button of element.querySelectorAll<HTMLElement>('[data-header-action]')) {
      const id = button.dataset.headerAction!;
      const width = button.offsetWidth;
      if (width <= 0) continue;
      const current = widths[id] ?? { full: width };
      next[id] = fit.compact ? { ...current, short: width } : { ...current, full: width };
    }
    const more = element.querySelector<HTMLElement>('[data-header-more]')?.offsetWidth ?? 0;
    setWidths((current) => {
      const merged = { ...current, ...next };
      const changed = Object.keys(merged).some(
        (id) => merged[id]?.full !== current[id]?.full || merged[id]?.short !== current[id]?.short,
      );
      return changed ? merged : current;
    });
    if (more > 0) setMoreWidth((current) => (current === more ? current : more));
    onMeasured?.(element.offsetWidth);
    // `widths` is what this effect writes; reading it here would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, available, onMeasured]);

  if (actions.length === 0) return null;
  const byId = new Map(actions.map((action) => [action.id, action]));

  return (
    <div ref={row} className="flex shrink-0 items-center gap-1.5" data-header-actions>
      {fit.shown.map((id) => {
        const action = byId.get(id)!;
        const text = fit.compact && action.shortLabel ? action.shortLabel : action.label;
        return (
          <Button
            key={id}
            variant={action.variant ?? 'ghost'}
            icon={action.icon}
            disabled={action.disabled}
            title={action.title ?? (text === action.label ? undefined : action.label)}
            aria-label={action.label}
            onClick={action.onClick}
            data-header-action={id}
            {...(action.dataAttribute ? { [action.dataAttribute]: '' } : {})}
          >
            {text}
          </Button>
        );
      })}
      {fit.folded.length > 0 ? (
        <Menu
          align="end"
          sections={[
            {
              id: 'folded',
              items: fit.folded.map((id) => {
                const action = byId.get(id)!;
                return {
                  id,
                  label: action.label,
                  ...(action.icon ? { icon: action.icon } : {}),
                  ...(action.disabled ? { disabled: true } : {}),
                  run: action.onClick,
                };
              }),
            },
          ]}
          trigger={({ open, toggle, id }) => (
            <Button
              id={id}
              aria-label="More actions"
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={open}
              active={open}
              icon={<MoreHorizontal />}
              onClick={toggle}
              data-header-more
            />
          )}
        />
      ) : null}
    </div>
  );
}
