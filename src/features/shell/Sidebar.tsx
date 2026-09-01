'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Close, Settings } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

import { BrandMark } from './BrandMark';
import { NAV_SECTIONS } from './navigation';

interface SidebarProps {
  readonly variant?: 'desktop' | 'drawer';
  readonly onClose?: () => void;
}

export function Sidebar({ variant = 'desktop', onClose }: SidebarProps) {
  const pathname = usePathname();
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const drawer = variant === 'drawer';

  return (
    <nav
      className={cn(
        'shrink-0 flex-col border-r border-line-subtle bg-surface-1',
        drawer ? 'flex h-full w-[min(82vw,280px)] shadow-2xl' : 'hidden w-12 md:flex xl:w-[188px]',
      )}
      aria-label="Sections"
    >
      <div
        className={cn(
          'flex h-10 shrink-0 items-center border-b border-line-subtle',
          drawer ? 'gap-2 px-3' : 'justify-center px-2 xl:justify-start xl:gap-2 xl:px-3',
        )}
      >
        <BrandMark className="h-[18px] w-[18px] shrink-0 text-accent" />
        <span
          className={cn(
            'text-[13px] font-semibold tracking-tight text-primary',
            !drawer && 'hidden xl:inline',
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

      <ul className="flex flex-col gap-px p-1.5">
        {NAV_SECTIONS.map((section) => {
          const active = pathname.startsWith(section.href);
          const Icon = section.icon;

          if (!section.ready) {
            return (
              <li key={section.id}>
                <span
                  title={section.hint}
                  aria-disabled
                  className={cn(
                    'flex cursor-default items-center rounded-[4px] py-1.5 text-xs text-tertiary/60',
                    drawer
                      ? 'gap-2.5 px-2'
                      : 'justify-center px-1 xl:justify-start xl:gap-2.5 xl:px-2',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn('truncate', !drawer && 'hidden xl:inline')}>
                    {section.label}
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={section.id}>
              <Link
                href={section.href}
                title={!drawer ? section.label : undefined}
                onClick={onClose}
                className={cn(
                  'flex items-center rounded-[4px] py-1.5 text-xs transition-colors',
                  drawer
                    ? 'gap-2.5 px-2'
                    : 'justify-center px-1 xl:justify-start xl:gap-2.5 xl:px-2',
                  active
                    ? 'bg-surface-3 text-primary'
                    : 'text-secondary hover:bg-surface-2 hover:text-primary',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active && 'text-accent')} />
                <span className={cn('truncate', !drawer && 'hidden xl:inline')}>
                  {section.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Settings has a keyboard shortcut and a palette entry, but until now no
          visible control outside Analysis — so on Repertoire, Training or
          Preparation there was nothing to click. It belongs with navigation. */}
      <div className="mt-auto border-t border-line-subtle">
        <button
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            onClose?.();
          }}
          className={cn(
            'flex w-full items-center gap-2 py-2 text-xs text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary',
            drawer ? 'px-3' : 'justify-center px-2 xl:justify-start xl:px-3',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className={cn('truncate', !drawer && 'hidden xl:inline')}>Settings</span>
          <kbd className={cn('ml-auto font-mono text-[10px]', !drawer && 'hidden xl:inline')}>
            ⌘,
          </kbd>
        </button>
        <p
          className={cn(
            'border-t border-line-subtle px-3 py-2 text-[10px] leading-relaxed text-tertiary',
            !drawer && 'hidden xl:block',
          )}
        >
          Local-first chess research.
          <br />
          Preparation grounded in your evidence.
        </p>
      </div>
    </nav>
  );
}
