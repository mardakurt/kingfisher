/**
 * Diagnostic row helpers used by the Settings → Diagnostics section
 * and by feature modules that need to surface a small piece of
 * status in the same visual language.
 *
 * Extracted from `SettingsDialog.tsx` so the PWA module and any
 * other feature can render their own row without re-implementing
 * the style. The visual contract is unchanged.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function DiagnosticGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        {title}
      </h3>
      <div className="mt-1 border-y border-line-subtle">{children}</div>
    </section>
  );
}

export function DiagnosticLine({
  name,
  status,
  detail,
  ok,
}: {
  name: string;
  status: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line-subtle py-2 last:border-0">
      <div>
        <p className="text-xs text-primary">{name}</p>
        <p className="mt-0.5 text-[10px] text-tertiary">{detail}</p>
      </div>
      <span
        className={cn(
          'self-center text-[10px] uppercase tracking-wide',
          ok ? 'text-positive' : 'text-caution',
        )}
      >
        {status}
      </span>
    </div>
  );
}
