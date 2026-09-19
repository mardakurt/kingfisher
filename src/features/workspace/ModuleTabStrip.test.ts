import { describe, expect, it } from 'vitest';

import { fitTabs, type ModuleTab } from './ModuleTabStrip';
import type { WorkspaceModuleId } from './layout-model';

const tab = (id: string): ModuleTab => ({ id: id as WorkspaceModuleId, label: id });
const engine = tab('engine');
const explorer = tab('explorer');
const theory = tab('theory-book');
const notes = tab('notes');
const moveTree = tab('move-tree');
const book = tab('book');

const widths: Record<string, number> = {
  engine: 70,
  explorer: 80,
  'theory-book': 100,
  notes: 60,
  'move-tree': 90,
  book: 60,
};
const widthOf = (id: WorkspaceModuleId) => widths[id];

describe('the tab strip fits one row', () => {
  it('draws everything wanted before it has been measured', () => {
    const fit = fitTabs({
      wanted: [engine, explorer, theory, notes],
      active: 'engine' as WorkspaceModuleId,
      rowWidth: 0,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [book],
    });
    expect(fit.shown.map((t) => t.id)).toEqual(['engine', 'explorer', 'theory-book', 'notes']);
    expect(fit.overflow.map((t) => t.id)).toEqual(['book']);
  });

  it('keeps the pinned order and folds from the end when the row is narrow', () => {
    // 70 + 80 + 100 + 60 = 310 of tabs; More 60 and the collapse button 36
    // leave a 380px row with 284px for tabs: engine, explorer and theory fit
    // (250), notes (60 more) does not.
    const fit = fitTabs({
      wanted: [engine, explorer, theory, notes],
      active: 'engine' as WorkspaceModuleId,
      rowWidth: 380,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [book, moveTree],
    });
    expect(fit.shown.map((t) => t.id)).toEqual(['engine', 'explorer', 'theory-book']);
    expect(fit.overflow.map((t) => t.id)).toEqual(['notes', 'book', 'move-tree']);
  });

  it('never folds the active tab, whatever its position', () => {
    const fit = fitTabs({
      wanted: [engine, explorer, theory, notes],
      active: 'notes' as WorkspaceModuleId,
      rowWidth: 300,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [],
    });
    // 204px for tabs: notes (60) is reserved, then engine (70) fits, explorer
    // (80) would exceed 204 — the row stops there and stays in pinned order.
    expect(fit.shown.map((t) => t.id)).toEqual(['engine', 'notes']);
    expect(fit.overflow.map((t) => t.id)).toEqual(['explorer', 'theory-book']);
  });

  it('shows every wanted tab with no More when they all fit and nothing is folded', () => {
    const fit = fitTabs({
      wanted: [engine, explorer],
      active: 'engine' as WorkspaceModuleId,
      rowWidth: 400,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [],
    });
    expect(fit.shown).toHaveLength(2);
    expect(fit.overflow).toHaveLength(0);
  });

  it('a row too narrow for anything still shows the active tab', () => {
    const fit = fitTabs({
      wanted: [engine, explorer],
      active: 'explorer' as WorkspaceModuleId,
      rowWidth: 50,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [],
    });
    expect(fit.shown.map((t) => t.id)).toEqual(['explorer']);
  });
});

describe('priority', () => {
  it('keeps the tabs the priority list names first, drawn in row order', () => {
    // A phone: the Move Tree folded from the lower panel comes last in the
    // row's order but first in priority, so it is what survives.
    const fit = fitTabs({
      wanted: [engine, explorer, theory, notes, moveTree],
      active: 'engine' as WorkspaceModuleId,
      rowWidth: 300,
      widthOf,
      moreWidth: 60,
      actionsWidth: 36,
      rest: [book],
      priority: ['move-tree', 'engine', 'explorer', 'theory-book', 'notes'] as WorkspaceModuleId[],
    });
    // 204px for tabs: engine (70, active) + move-tree (90) = 160; explorer (80) does not fit.
    expect(fit.shown.map((t) => t.id)).toEqual(['engine', 'move-tree']);
    expect(fit.overflow.map((t) => t.id)).toEqual(['explorer', 'theory-book', 'notes', 'book']);
  });
});
