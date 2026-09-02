'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChevronLeft, ChevronRight, Close, Moon, Settings, Sun } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';
import { usePreferences } from '@/stores/preferences-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import { BrandMark } from './BrandMark';
import { NAV_SECTIONS } from './navigation';

interface SidebarProps {
  readonly variant?: 'desktop' | 'drawer';
  readonly onClose?: () => void;
}

export function Sidebar({ variant = 'desktop', onClose }: SidebarProps) {
  const pathname = usePathname();
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const collapsed = useWorkspaceLayout((state) => state.sidebarCollapsed);
  const setCollapsed = useWorkspaceLayout((state) => state.setSidebarCollapsed);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const drawer = variant === 'drawer';
  const compact = !drawer && collapsed;

  return (
    <nav
      className={cn(
        'shrink-0 flex-col border-r border-line-subtle bg-surface-1',
        drawer
          ? 'flex h-full w-[min(86vw,300px)] shadow-2xl'
          : compact
            ? 'hidden w-[72px] md:flex'
            : 'hidden w-[228px] md:flex',
      )}
      aria-label="Sections"
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-line-subtle',
          drawer || !compact ? 'gap-2.5 px-3.5' : 'justify-center px-2',
        )}
      >
        <BrandMark className="h-9 w-9 shrink-0 text-accent" />
        <span
          className={cn(
            'text-[17px] font-semibold tracking-tight text-primary',
            compact && 'hidden',
          )}
        >
          Kingfisher
        </span>
        {drawer && (
          <IconButton label="Close navigation" className="ml-auto" onClick={onClose} autoFocus>
            <Close />
          </IconButton>
        )}
      </div>

      {/* Primary navigation is the most-used control in the product and must
          read as such: rows at least as large as the appearance and settings
          controls below them, not the 28px/12px strip they used to be. */}
      <ul className="flex flex-col gap-0.5 p-2">
        {NAV_SECTIONS.map((section) => {
          const active = pathname.startsWith(section.href);
          const Icon = section.icon;

          return (
            <li key={section.id}>
              <Link
                href={section.href}
                title={compact ? section.label : section.hint}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
                className={cn(
                  'relative flex h-10 items-center rounded-[5px] text-sm font-medium transition-colors',
                  compact ? 'justify-center px-1' : 'gap-3 px-3',
                  active
                    ? 'bg-surface-3 text-primary'
                    : 'text-secondary hover:bg-surface-2 hover:text-primary',
                )}
              >
                {/* The selected section is carried by an accent rail as well as
                    the raised surface, so it survives both themes and the
                    collapsed rail where the label is gone. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent"
                  />
                )}
                <Icon className={cn('h-5 w-5 shrink-0', active && 'text-accent')} />
                <span className={cn('truncate', compact && 'hidden')}>{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Settings has a keyboard shortcut and a palette entry, but until now no
          visible control outside Analysis — so on Repertoire, Training or
          Preparation there was nothing to click. It belongs with navigation. */}
      <div className="mt-auto border-t border-line-subtle p-1.5">
        {!drawer && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'mb-1 flex h-10 w-full items-center rounded-[4px] text-sm text-tertiary transition-colors hover:bg-surface-2 hover:text-primary',
              compact ? 'justify-center' : 'gap-3 px-3',
            )}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            {!compact && <span>Collapse</span>}
          </button>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'flex h-10 w-full items-center rounded-[4px] text-sm text-tertiary transition-colors hover:bg-surface-2 hover:text-primary',
            compact ? 'justify-center' : 'gap-3 px-3',
          )}
        >
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 shrink-0" />
          ) : (
            <Sun className="h-5 w-5 shrink-0" />
          )}
          {!compact && <span>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            onClose?.();
          }}
          className={cn(
            'flex h-10 w-full items-center rounded-[4px] text-sm text-tertiary transition-colors hover:bg-surface-2 hover:text-primary',
            compact ? 'justify-center' : 'gap-3 px-3',
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className={cn('truncate', compact && 'hidden')}>Settings</span>
          <kbd className={cn('ml-auto font-mono text-[10px]', compact && 'hidden')}>⌘,</kbd>
        </button>
      </div>
    </nav>
  );
}
