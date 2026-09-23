import { describe, expect, it } from 'vitest';

import {
  activate,
  adoptOrphans,
  closeTab,
  initialTabs,
  liveTitle,
  MAX_TABS,
  moveTab,
  neighbour,
  openTab,
  sanitizeTabs,
  sectionTitle,
  updateTab,
  type TabsState,
} from './tab-model';

const three = (): TabsState => ({
  tabs: [
    { id: 'a', href: '/analysis', title: 'A' },
    { id: 'b', href: '/games', title: 'B' },
    { id: 'c', href: '/preparation', title: 'C' },
  ],
  activeId: 'b',
});

describe('workspace tabs', () => {
  it('opens a tab beside the active one and makes it active', () => {
    const next = openTab(three(), { id: 'n', href: '/analysis', title: 'N' });
    expect(next.tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'n', 'c']);
    expect(next.activeId).toBe('n');
  });

  it('refuses a tab past the limit rather than opening one nobody can read', () => {
    let state = initialTabs('0');
    for (let index = 1; index < MAX_TABS + 3; index += 1) {
      state = openTab(state, { id: String(index), href: '/analysis', title: '' });
    }
    expect(state.tabs).toHaveLength(MAX_TABS);
  });

  it('activates the right neighbour when the active tab closes, the left at the end', () => {
    expect(closeTab(three(), 'b').activeId).toBe('c');
    expect(closeTab({ ...three(), activeId: 'c' }, 'c').activeId).toBe('b');
  });

  it('keeps the active tab when another closes', () => {
    const next = closeTab(three(), 'a');
    expect(next.activeId).toBe('b');
    expect(next.tabs.map((tab) => tab.id)).toEqual(['b', 'c']);
  });

  it('never closes the last tab', () => {
    const one = initialTabs('only');
    expect(closeTab(one, 'only')).toBe(one);
  });

  it('wraps round when stepping through tabs', () => {
    expect(neighbour({ ...three(), activeId: 'c' }, 1)?.id).toBe('a');
    expect(neighbour({ ...three(), activeId: 'a' }, -1)?.id).toBe('c');
    expect(neighbour(initialTabs('x'), 1)).toBeUndefined();
  });

  it('ignores an unknown tab rather than inventing one', () => {
    const state = three();
    expect(activate(state, 'zzz')).toBe(state);
    expect(closeTab(state, 'zzz')).toBe(state);
    expect(updateTab(state, 'zzz', { title: 'x' })).toBe(state);
  });

  it('returns the same state when an update changes nothing', () => {
    const state = three();
    expect(updateTab(state, 'a', { title: 'A' })).toBe(state);
    expect(updateTab(state, 'a', { title: 'Z' }).tabs[0]?.title).toBe('Z');
  });

  it('reorders by moving one tab to an index', () => {
    expect(moveTab(three(), 'a', 2).tabs.map((tab) => tab.id)).toEqual(['b', 'c', 'a']);
    expect(moveTab(three(), 'c', -5).tabs.map((tab) => tab.id)).toEqual(['c', 'a', 'b']);
  });

  it('makes board work nobody names reachable, once, up to the limit', () => {
    const next = adoptOrphans(three(), [
      { id: 'a', title: 'already here' },
      { id: 'orphan', title: 'Restored analysis' },
    ]);
    expect(next.tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'c', 'orphan']);
    expect(next.tabs[3]?.title).toBe('Restored analysis');
    expect(next.activeId).toBe('b');
    const nothing = three();
    expect(adoptOrphans(nothing, [])).toBe(nothing);
  });

  it('reads back only what it could have written', () => {
    expect(sanitizeTabs(null)).toBeNull();
    expect(sanitizeTabs({ tabs: [] })).toBeNull();
    expect(
      sanitizeTabs({
        tabs: [
          { id: 'a', href: '/analysis', title: 'A' },
          { id: 'a', href: '/games', title: 'duplicate' },
          { id: 'b', href: 'https://elsewhere.example', title: 'foreign' },
          { id: 'c', href: '/games' },
          'junk',
        ],
        activeId: 'gone',
      }),
    ).toEqual({
      tabs: [
        { id: 'a', href: '/analysis', title: 'A' },
        { id: 'c', href: '/games', title: 'Library' },
      ],
      activeId: 'a',
    });
  });

  it('names a place as the sidebar names it', () => {
    expect(sectionTitle('/games?q=Carlsen')).toBe('Library');
    expect(sectionTitle('/preparation')).toBe('Preparation');
    expect(sectionTitle('/analysis')).toBe('Analysis board');
    expect(sectionTitle('/nowhere')).toBe('Kingfisher');
  });

  it('names the document on the board, and prefers a title the route published', () => {
    expect(liveTitle('/analysis', 'Sicilian Najdorf', null)).toBe('Analysis: Sicilian Najdorf');
    expect(liveTitle('/analysis', 'Untitled analysis', null)).toBe('Analysis board');
    expect(liveTitle('/games', 'Sicilian Najdorf', null)).toBe('Library');
    expect(liveTitle('/preparation', null, 'Preparation against Karpov')).toBe(
      'Preparation against Karpov',
    );
  });
});
