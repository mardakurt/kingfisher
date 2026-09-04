import type { ComponentType, SVGProps } from 'react';

import {
  Board,
  Copy,
  Database,
  Download,
  Export,
  Filter,
  Import,
  Play,
  Search,
  Settings,
  Stop,
  Trash,
} from '@/components/icons';
import { NAV_SECTIONS } from '@/features/shell/navigation';
import { MOVE_TREE_MODULE, WORKSPACE_MODULES } from '@/features/workspace/modules';
import { WORKSPACE_TOOL_ICONS } from '@/features/workspace/tool-icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const GENERIC_ICON_GALLERY: readonly { readonly label: string; readonly icon: Icon }[] = [
  { label: 'Search', icon: Search },
  { label: 'Settings', icon: Settings },
  { label: 'Import', icon: Import },
  { label: 'Export', icon: Export },
  { label: 'Download', icon: Download },
  { label: 'Copy', icon: Copy },
  { label: 'Delete', icon: Trash },
  { label: 'Filter', icon: Filter },
  { label: 'Start', icon: Play },
  { label: 'Stop', icon: Stop },
  { label: 'Board', icon: Board },
  { label: 'Database', icon: Database },
];

const SIZES = [16, 20, 24, 32] as const;

export function IconGallery() {
  const icons = [
    ...NAV_SECTIONS.map((section) => ({ label: section.label, icon: section.icon })),
    ...Object.entries(WORKSPACE_TOOL_ICONS).map(([id, icon]) => ({
      label:
        id === MOVE_TREE_MODULE.id
          ? MOVE_TREE_MODULE.label
          : WORKSPACE_MODULES[id as keyof typeof WORKSPACE_MODULES].label,
      icon,
    })),
    ...GENERIC_ICON_GALLERY,
  ];
  return (
    <main className="min-h-dvh overflow-auto bg-surface-0 p-6 text-primary">
      <header className="mb-6 border-b border-line pb-4">
        <p className="text-xs text-tertiary">Development visual test surface</p>
        <h1 className="text-xl font-semibold">Kingfisher icon family</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          One 24×24 grid, 1.75px rounded strokes, currentColor, inspected at every production size.
        </p>
      </header>
      {(['dark', 'light'] as const).map((theme) => (
        <section
          key={theme}
          data-theme={theme}
          className="mb-5 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 text-primary"
        >
          <h2 className="mb-3 text-sm font-semibold capitalize">{theme} theme</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-px overflow-hidden rounded-[var(--radius-control)] border border-line bg-line-subtle">
            {icons.map(({ label, icon: Icon }, index) => (
              <div key={`${label}-${index}`} className="bg-surface-1 p-3">
                <p className="mb-3 text-xs text-secondary">{label}</p>
                <div className="flex items-end gap-3 text-accent">
                  {SIZES.map((size) => (
                    <Icon
                      key={size}
                      width={size}
                      height={size}
                      aria-label={`${label}, ${size}px`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
