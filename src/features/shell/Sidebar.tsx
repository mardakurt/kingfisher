'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  ChevronLeft,
  ChevronRight,
  Close,
  Feedback,
  Moon,
  Settings,
  Sun,
} from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { StoragePersistenceStatus } from '@/persistence/StoragePersistenceStatus';
import { useUi } from '@/stores/ui-store';
import { usePreferences } from '@/stores/preferences-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import { BrandMark } from './BrandMark';
import { TitleBarSafeCorner } from './TitleBarSafeArea';
import { NAV_GROUPS, sectionsInGroup } from './navigation';

const FOOTER_ROW =
  'flex h-8 w-full items-center rounded-[7px] text-[13px] text-secondary transition-colors hover:bg-black/[0.04] hover:text-primary dark:hover:bg-white/[0.06]';
const FOOTER_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-secondary transition-colors hover:bg-black/[0.04] hover:text-primary dark:hover:bg-white/[0.06]';

interface SidebarProps {
  readonly variant?: 'desktop' | 'drawer';
  readonly onClose?: () => void;
}

export function Sidebar({ variant = 'desktop', onClose }: SidebarProps) {
  const pathname = usePathname();
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const openFeedback = useUi((state) => state.openFeedback);
  const collapsed = useWorkspaceLayout((state) => state.sidebarCollapsed);
  const setCollapsed = useWorkspaceLayout((state) => state.setSidebarCollapsed);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const drawer = variant === 'drawer';
  const compact = !drawer && collapsed;

  return (
    <nav
      className={cn(
        'shrink-0 flex-col border-r border-line-subtle bg-surface-sidebar',
        drawer
          ? 'flex h-full w-[min(86vw,300px)] shadow-2xl'
          : compact
            ? 'hidden w-[var(--sidebar-collapsed)] md:flex'
            : 'hidden w-[var(--sidebar-expanded)] md:flex',
      )}
      aria-label="Sections"
      /* Read by the macOS title-bar rules in globals.css, and by the window
         chrome harness, which has to know which layout it is measuring. */
      data-sidebar={drawer ? 'drawer' : compact ? 'collapsed' : 'expanded'}
    >
      <div
        className={cn(
          'relative flex h-14 shrink-0 items-center',
          drawer || !compact ? 'gap-2.5' : 'justify-center',
        )}
        /*
          The macOS window buttons sit over the top-left of this header, and the
          room for them *is* the header's own left inset rather than a spacer
          placed inside it. `max()` is what makes one expression serve both
          identities: `--titlebar-safe-w` is 0px in a browser, on Windows and on
          Linux, so the header keeps the inset it always had and every web pixel
          is unchanged; in the Mac shell it resolves to the reserved width and
          the mark lands one design gap clear of the last button.

          Phase 21 added the reservation *inside* this inset and then let the
          flex gap follow it, which paid the 14 px twice and put 32 px of dead
          space where 16 was meant to be. See docs/design/macos-window-chrome.md.

          Two layouts take the plain inset and reserve nothing. The drawer is
          the mobile overlay rather than the window's corner. And the collapsed
          rail is 72 px against an 84 px reservation, so the mark is hidden
          there by `globals.css` and the header is empty — there is no brand to
          inset, and insetting an empty box only pushes its padding past the
          rail's own edge.
        */
        style={
          drawer || compact
            ? {
                paddingLeft: compact ? '0.5rem' : '0.875rem',
                paddingRight: compact ? '0.5rem' : '0.875rem',
              }
            : {
                paddingLeft: 'var(--sidebar-brand-left-padding)',
                paddingRight: '0.875rem',
              }
        }
        /* Drag the window by its top chrome. Inert off macOS; see globals.css. */
        data-titlebar-drag={drawer ? undefined : ''}
      >
        {drawer ? null : <TitleBarSafeCorner />}
        {/*
          Phase 62: the Kingfisher mark + wordmark are a navigation
          affordance, not chrome. Clicking them returns to Analysis.
          The parent header is the macOS window-drag area; pointer
          events on this button still fire because the drag listener
          ignores non-target elements.
        */}
        <Link
          href="/analysis"
          aria-label="Back to Analysis"
          data-sidebar-home=""
          className="flex items-center gap-2.5 rounded-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <BrandMark className="kf-titlebar-yield h-9 w-9 shrink-0 text-accent" />
          <span
            className={cn(
              'text-[16px] font-semibold tracking-[-0.01em] text-primary',
              compact && 'hidden',
            )}
          >
            Kingfisher
          </span>
        </Link>
        {drawer && (
          <IconButton label="Close navigation" className="ml-auto" onClick={onClose} autoFocus>
            <Close />
          </IconButton>
        )}
      </div>

      {/*
        Primary navigation, in four named groups.

        Thirteen equally-weighted rows is a list nobody reads to the bottom of;
        the headings turn it into four short ones. They disappear in the
        collapsed rail — a heading with no room for its own text is noise — and
        a rule takes their place, so the grouping survives the collapse.
      */}
      <ul className="flex flex-col overflow-y-auto px-2.5 pt-1 pb-2">
        {NAV_GROUPS.map((group, groupIndex) => {
          const sections = sectionsInGroup(group.id);
          if (sections.length === 0) return null;

          return (
            <li key={group.id}>
              {group.label && !compact ? (
                <h2 className="mt-2.5 mb-0.5 px-2.5 text-[11px] font-semibold text-tertiary">
                  {group.label}
                </h2>
              ) : null}
              {group.label && compact && groupIndex > 0 ? (
                <hr className="mx-2 my-2 border-line" aria-hidden />
              ) : null}
              <ul className="flex flex-col gap-px">
                {sections.map((section) => {
                  const active = pathname.startsWith(section.href);
                  const Icon = section.icon;

                  return (
                    <li key={section.id}>
                      <Link
                        href={section.href}
                        title={compact ? `${section.label} — ${section.hint}` : section.hint}
                        aria-label={compact ? section.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        onClick={onClose}
                        data-nav-section={section.id}
                        className={cn(
                          /*
                            30px rows, the height of a Mac source list. Nineteen
                            sections and four headings then fit a 1440x900
                            display without the list scrolling, which the 40px
                            rows of Phase 53 no longer did once the list grew.
                          */
                          'relative flex items-center rounded-[7px] text-[13px] transition-colors',
                          compact ? 'h-10 justify-center px-1' : 'h-[30px] gap-2.5 px-2.5',
                          active
                            ? 'bg-black/[0.075] font-medium text-primary dark:bg-white/[0.1]'
                            : 'text-primary/85 hover:bg-black/[0.04] hover:text-primary dark:hover:bg-white/[0.06]',
                        )}
                      >
                        {/* Selection is a filled row, as in every Mac sidebar,
                            and the icon takes the accent so the selected
                            section still reads in the collapsed rail where the
                            label is gone. */}
                        <Icon
                          className={cn(
                            'h-[17px] w-[17px] shrink-0',
                            active ? 'text-accent' : 'text-secondary',
                          )}
                        />
                        <span className={cn('truncate', compact && 'hidden')}>{section.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* Settings has a keyboard shortcut and a palette entry, but until now no
          visible control outside Analysis — so on Repertoire, Training or
          Preparation there was nothing to click. It belongs with navigation.
          The "What should we call you?" prompt and "Welcome back, X" greeting
          that used to live here are gone: the user does not want them. */}
      <div className="mt-auto shrink-0 border-t border-line-subtle px-2.5 py-2">
        <button
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            onClose?.();
          }}
          className={cn(FOOTER_ROW, compact ? 'justify-center' : 'gap-2.5 px-2.5')}
        >
          <Settings className="h-[17px] w-[17px] shrink-0" />
          <span className={cn('truncate', compact && 'hidden')}>Settings</span>
          <kbd className={cn('ml-auto font-mono text-[10px] text-tertiary', compact && 'hidden')}>
            ⌘,
          </kbd>
        </button>
        {/*
          Phase 82: the theme, feedback and collapse controls share one row of
          icons, as the small controls at the foot of a Mac sidebar do. Each
          keeps the accessible name it had as a labelled row. In the collapsed
          rail they stack, because a 72px rail has room for one icon across.
        */}
        <div
          className={cn('mt-0.5 flex items-center', compact ? 'flex-col gap-0.5' : 'gap-0.5 px-1')}
        >
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Dark theme' : 'Light theme'}
            title={
              theme === 'dark' ? 'Dark theme — switch to light' : 'Light theme — switch to dark'
            }
            className={FOOTER_ICON}
          >
            {theme === 'dark' ? (
              <Moon className="h-[17px] w-[17px]" />
            ) : (
              <Sun className="h-[17px] w-[17px]" />
            )}
          </button>
          {/* Phase 40: the same Feedback modal the command palette opens. */}
          <button
            type="button"
            onClick={() => {
              openFeedback();
              onClose?.();
            }}
            aria-label="Send feedback"
            title="Send feedback"
            className={FOOTER_ICON}
            data-feedback-button=""
          >
            <Feedback className="h-[17px] w-[17px]" />
          </button>
          {!drawer && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className={FOOTER_ICON}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? (
                <ChevronRight className="h-[17px] w-[17px]" />
              ) : (
                <ChevronLeft className="h-[17px] w-[17px]" />
              )}
            </button>
          )}
        </div>
        {/*
          Phase 29: a quiet "Saved on this device" status, with copy that does
          not overpromise. The title carries the detail.
        */}
        <div
          className={cn('mt-0.5 flex min-h-6 items-center', compact ? 'justify-center' : 'px-2.5')}
        >
          <StoragePersistenceStatus compact={compact} />
        </div>
      </div>
    </nav>
  );
}
