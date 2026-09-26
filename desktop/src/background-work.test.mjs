import { describe, expect, it } from 'vitest';

import { createBackgroundWork, normaliseWork } from './background-work.mjs';

function blocker() {
  const started = new Set();
  let next = 1;
  return {
    started,
    start: (kind) => {
      expect(kind).toBe('prevent-app-suspension');
      const id = next++;
      started.add(id);
      return id;
    },
    stop: (id) => started.delete(id),
    isStarted: (id) => started.has(id),
  };
}

describe('background work', () => {
  it('hides the window instead of closing it while work goes on, and never when quitting', () => {
    const power = blocker();
    const work = createBackgroundWork({ powerSaveBlocker: power });
    expect(work.shouldHide(false)).toBe(false);
    work.set({ active: true, label: 'Deep analysis' });
    expect(work.label()).toBe('Deep analysis');
    expect(work.shouldHide(false)).toBe(true);
    expect(work.shouldHide(true)).toBe(false);
    work.set({ active: false });
    expect(work.shouldHide(false)).toBe(false);
  });

  it('says when the work ends, once, so a window hidden for it can finish closing', () => {
    let idle = 0;
    const work = createBackgroundWork({ powerSaveBlocker: blocker(), onIdle: () => (idle += 1) });
    work.set({ active: false });
    expect(idle).toBe(0);
    work.set({ active: true, label: 'Deep analysis' });
    work.set({ active: true, label: 'Deep analysis' });
    expect(idle).toBe(0);
    work.set({ active: false });
    expect(idle).toBe(1);
    work.set({ active: false });
    expect(idle).toBe(1);
  });

  it('holds exactly one power-save blocker while work goes on, and releases it after', () => {
    const power = blocker();
    const work = createBackgroundWork({ powerSaveBlocker: power });
    work.set({ active: true, label: 'Deep analysis' });
    work.set({ active: true, label: 'Deep analysis' });
    expect(power.started.size).toBe(1);
    work.set({ active: false });
    expect(power.started.size).toBe(0);
  });

  it('accepts a boolean and a short label from the renderer, and nothing else', () => {
    expect(normaliseWork(null)).toEqual({ active: false, label: '' });
    expect(normaliseWork({ active: 'yes' })).toEqual({ active: false, label: '' });
    expect(normaliseWork({ active: true })).toEqual({ active: true, label: 'Background work' });
    expect(normaliseWork({ active: true, label: 'x'.repeat(200) }).label).toHaveLength(80);
  });
});
