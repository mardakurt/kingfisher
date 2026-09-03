import { describe, expect, it } from 'vitest';

import { sanitizePersistedState } from './workspace-layout-store';

/**
 * §16: the app must boot safely from a corrupted layout file, whatever shape
 * the corruption takes. Each case below is a way a real localStorage value
 * could go wrong — hand-edited, half-written, or written by a build with a
 * different module catalogue — and every one must come out as something the
 * workspace can render rather than throw on.
 */
describe('sanitizePersistedState', () => {
  it('passes clean state through unchanged', () => {
    const clean = {
      sidebarCollapsed: true,
      compact: false,
      preset: 'study',
      arrangements: {
        'desktop:analysis': {
          placement: { engine: 'lower' },
          active: { dock: 'explorer' },
          dockWidth: 480,
          lowerHeight: 300,
          dockCollapsed: false,
        },
      },
      savedLayouts: [
        {
          id: 'layout-1',
          name: 'Tournament Prep',
          arrangement: {
            placement: {},
            active: {},
            dockWidth: 420,
            lowerHeight: 210,
            dockCollapsed: false,
          },
        },
      ],
      pinnedTools: { analysis: ['engine', 'explorer'] },
    };

    expect(sanitizePersistedState(clean)).toEqual(clean);
  });

  it('boots safely from a non-object, null, or primitive value', () => {
    for (const garbage of [null, undefined, 'a string', 42, [], true]) {
      expect(sanitizePersistedState(garbage)).toEqual({});
    }
  });

  it('drops placements naming a module this build does not have', () => {
    const result = sanitizePersistedState({
      arrangements: {
        'desktop:analysis': {
          placement: { engine: 'dock', 'retired-tool-from-phase-4': 'lower' },
          active: {},
          dockWidth: 420,
          lowerHeight: 210,
          dockCollapsed: false,
        },
      },
    });
    expect(result.arrangements?.['desktop:analysis']?.placement).toEqual({ engine: 'dock' });
  });

  it('drops placements naming an illegal region', () => {
    const result = sanitizePersistedState({
      arrangements: {
        'desktop:analysis': {
          placement: { engine: 'floating-window' },
          active: { primary: 'engine' },
          dockWidth: 420,
          lowerHeight: 210,
          dockCollapsed: false,
        },
      },
    });
    expect(result.arrangements?.['desktop:analysis']?.placement).toEqual({});
    // "primary" is a real region, but "engine" cannot live there per the
    // module catalogue; sanitizing only checks the shape, not per-module
    // region legality, so this is intentionally kept — the render layer
    // already falls back safely when a module is not actually present.
    expect(result.arrangements?.['desktop:analysis']?.active).toEqual({ primary: 'engine' });
  });

  it('clamps NaN, negative, and gigantic dimensions to sane defaults', () => {
    const cases: readonly [unknown, unknown][] = [
      [Number.NaN, 420],
      [-999999, 320],
      // Infinity is not treated as "a huge number to clamp" — it fails the
      // finiteness check the same way NaN does, and falls back to the default.
      [Number.POSITIVE_INFINITY, 420],
      [1e20, 640],
      ['420', 420],
    ];
    for (const [input, expected] of cases) {
      const result = sanitizePersistedState({
        arrangements: {
          w: {
            placement: {},
            active: {},
            dockWidth: input,
            lowerHeight: 210,
            dockCollapsed: false,
          },
        },
      });
      expect(result.arrangements?.w?.dockWidth).toBe(expected);
    }
  });

  it('clamps a gigantic or negative lower-panel height the same way', () => {
    const result = sanitizePersistedState({
      arrangements: {
        w: { placement: {}, active: {}, dockWidth: 420, lowerHeight: -50, dockCollapsed: false },
      },
    });
    expect(result.arrangements?.w?.lowerHeight).toBe(140);
  });

  it('ignores unknown fields from a future-version layout without failing', () => {
    const result = sanitizePersistedState({
      arrangements: {
        w: {
          placement: { engine: 'dock' },
          active: {},
          dockWidth: 420,
          lowerHeight: 210,
          dockCollapsed: false,
          // A field this build has never heard of.
          floatingPanels: [{ id: 'x', x: 100, y: 200 }],
        },
      },
    });
    expect(result.arrangements?.w).toEqual({
      placement: { engine: 'dock' },
      active: {},
      dockWidth: 420,
      lowerHeight: 210,
      dockCollapsed: false,
    });
  });

  it('drops a saved layout missing an id or name rather than crashing on it', () => {
    const result = sanitizePersistedState({
      savedLayouts: [
        { id: 'ok', name: 'Fine', arrangement: {} },
        { name: 'No id' },
        { id: 'no-name' },
        null,
        'not an object',
      ],
    });
    expect(result.savedLayouts).toHaveLength(1);
    expect(result.savedLayouts?.[0]?.id).toBe('ok');
  });

  it('falls back to the analysis preset when the stored preset is unrecognised', () => {
    expect(sanitizePersistedState({ preset: 'a-preset-from-the-future' }).preset).toBe('analysis');
  });

  it('filters pinned tools to ones this build still has', () => {
    const result = sanitizePersistedState({
      pinnedTools: { analysis: ['engine', 'a-removed-tool', 42, null] },
    });
    expect(result.pinnedTools?.analysis).toEqual(['engine']);
  });

  it('drops an entire arrangements map that is not an object', () => {
    expect(sanitizePersistedState({ arrangements: 'not-an-object' }).arrangements).toEqual({});
    expect(sanitizePersistedState({ arrangements: null }).arrangements).toEqual({});
  });

  it('coerces sidebarCollapsed and compact to strict booleans', () => {
    const result = sanitizePersistedState({ sidebarCollapsed: 'yes', compact: 1 });
    expect(result.sidebarCollapsed).toBe(false);
    expect(result.compact).toBe(false);
  });
});
