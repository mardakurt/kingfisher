'use client';

/**
 * Dropdown and context menus.
 *
 * One implementation serves both, because they differ only in where they are
 * anchored: a toolbar menu hangs off its button, a context menu off a pointer
 * position. Sharing the implementation means the roving focus, the Escape
 * handling, the outside-click dismissal and the `menuitem` roles are written
 * once and are correct in both places.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly icon?: ReactNode;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly run: () => void;
}

export interface MenuSection {
  readonly id: string;
  readonly items: readonly MenuItem[];
}

interface MenuListProps {
  readonly sections: readonly MenuSection[];
  readonly onClose: () => void;
  readonly labelledBy?: string;
  readonly autoFocus?: boolean;
}

function MenuList({ sections, onClose, labelledBy, autoFocus = true }: MenuListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    listRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [autoFocus]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []),
    ];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="menu"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      /*
        A menu grows with the actions a screen offers; a viewport does not. The
        cap is expressed against the viewport rather than a fixed pixel height,
        so a long menu scrolls on a laptop in split screen instead of running
        off the bottom with its last items unreachable.
      */
      className="max-h-[min(70dvh,32rem,var(--menu-room,100dvh))] min-w-[200px] overflow-y-auto overscroll-contain rounded-[7px] border border-line-strong bg-surface-1 py-1 shadow-2xl"
    >
      {sections.map((section, index) => (
        <div key={section.id}>
          {index > 0 && <div className="my-1 h-px bg-line-subtle" role="separator" />}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.run();
                onClose();
              }}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1 text-left text-xs transition-colors',
                'disabled:pointer-events-none disabled:opacity-35',
                item.danger
                  ? 'text-negative hover:bg-negative/12'
                  : 'text-secondary hover:bg-surface-3 hover:text-primary',
                'focus:bg-surface-3 focus:text-primary focus:outline-none',
              )}
            >
              {item.icon && (
                <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="shrink-0 font-mono text-[10px] text-tertiary">{item.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The box a menu inside `element` can draw in: the viewport, cut by every clipping ancestor. */
function clippingBounds(element: HTMLElement | null): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  return { top, bottom };
}

interface MenuProps {
  readonly trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  readonly sections: readonly MenuSection[];
  readonly align?: 'start' | 'end';
}

export function Menu({ trigger, sections, align = 'start' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Open upwards when there is more room there, and never taller than the
  // room on the side it opens to. The room is measured against the nearest
  // ancestor that clips — not the window — because a menu in a panel that
  // hides its overflow is cut at the panel's edge: Phase 82 put the tool tabs
  // in the middle of the side panel, and More opened upwards into a region
  // the panel clipped, under the header, with its items unclickable.
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = wrapper.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!trigger || !box) return;
    const bounds = clippingBounds(wrapper.current);
    const below = bounds.bottom - trigger.bottom;
    const aboveRoom = trigger.top - bounds.top;
    const up = box.height > below - 8 && aboveRoom > below;
    setAbove(up);
    setRoom(Math.max(120, Math.floor((up ? aboveRoom : below) - 8)));
  }, [open, sections]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div ref={wrapper} className="relative shrink-0">
      {trigger({ open, toggle: () => setOpen((value) => !value), id })}
      {open && (
        <div
          ref={panel}
          className={cn(
            'absolute z-50',
            above ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
          style={room === null ? undefined : ({ '--menu-room': `${room}px` } as CSSProperties)}
        >
          <MenuList sections={sections} onClose={() => setOpen(false)} labelledBy={id} />
        </div>
      )}
    </div>
  );
}

interface ContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly sections: readonly MenuSection[];
  readonly onClose: () => void;
}

export function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Measure once mounted and pull the menu back inside the viewport, so a
  // right-click near the bottom-right corner does not open off-screen.
  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  return (
    <div
      ref={wrapper}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 animate-fade-in"
    >
      <MenuList sections={sections} onClose={onClose} />
    </div>
  );
}
