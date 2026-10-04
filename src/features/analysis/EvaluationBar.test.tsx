// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { EvaluationBar } from './EvaluationBar';

it('keeps both bands opaque during position updates and labels the held score as previous', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    await act(async () => {
      root.render(
        <EvaluationBar score={{ kind: 'cp', cp: -180 }} orientation="w" catchingUp depth={18} />,
      );
    });
    const bar = container.querySelector('[data-evaluation-bar]')!;
    expect(bar.classList.contains('opacity-60')).toBe(false);
    expect(bar.querySelector('[data-evaluation-bar-label]')?.textContent).toBe('…');
    expect(bar.getAttribute('aria-label')).toContain('previous position');
    expect(bar.getAttribute('title')).toContain('previous position');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps stored readings opaque and prioritizes a game outcome over pending analysis', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    await act(async () => {
      root.render(<EvaluationBar score={{ kind: 'cp', cp: 120 }} orientation="b" stale />);
    });
    const bar = container.querySelector('[data-evaluation-bar]')!;
    expect(bar.classList.contains('opacity-60')).toBe(false);
    expect(bar.querySelector('[data-evaluation-bar-label]')?.textContent).toBe('+1.2');
    await act(async () => {
      root.render(
        <EvaluationBar
          score={{ kind: 'cp', cp: 120 }}
          orientation="b"
          catchingUp
          outcome={{ kind: 'checkmate', winner: 'b' }}
        />,
      );
    });
    expect(bar.querySelector('[data-evaluation-bar-label]')?.textContent).toBe('0-1');
    expect(bar.hasAttribute('data-catching-up')).toBe(false);
    expect(bar.getAttribute('aria-label')).toBe('Checkmate — Black wins');
  } finally {
    await act(async () => root.unmount());
  }
});
