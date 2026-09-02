'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Board, Library, Menu, Opening } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

const ITEMS = [
  { href: '/analysis', label: 'Analysis', icon: Board },
  { href: '/openings', label: 'Openings', icon: Opening },
  { href: '/games', label: 'Games', icon: Library },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="grid h-14 shrink-0 grid-cols-4 border-t border-line-subtle bg-surface-1 md:hidden"
    >
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-0.5 text-[10px]',
              active ? 'text-accent' : 'text-tertiary',
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] text-tertiary"
      >
        <Menu className="h-5 w-5" />
        <span>More</span>
      </button>
    </nav>
  );
}
