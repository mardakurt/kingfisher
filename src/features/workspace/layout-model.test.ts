import { describe, expect, it } from 'vitest';

import {
  activeInRegion,
  clampDockWidth,
  clampLowerHeight,
  DEFAULT_ARRANGEMENT,
  modulesInRegion,
  moveModule,
  regionOf,
  type WorkspaceArrangement,
  type WorkspaceModuleId,
  type WorkspaceRegion,
} from './layout-model';

const available: readonly { id: WorkspaceModuleId; home: WorkspaceRegion }[] = [
  { id: 'engine', home: 'dock' },
  { id: 'explorer', home: 'dock' },
  { id: 'notes', home: 'dock' },
  { id: 'move-tree', home: 'primary' },
];

describe('regionOf', () => {
  it('reads through to the module home when the layout says nothing', () => {
    expect(regionOf(DEFAULT_ARRANGEMENT, 'engine', 'dock')).toBe('dock');
  });

  it('prefers an explicit placement', () => {
    const moved = moveModule(DEFAULT_ARRANGEMENT, 'engine', 'lower');
    expect(regionOf(moved, 'engine', 'dock')).toBe('lower');
  });
});

describe('modulesInRegion', () => {
  it('lists a region in the workspace order, not the order things were moved', () => {
    const moved = moveModule(moveModule(DEFAULT_ARRANGEMENT, 'notes', 'lower'), 'engine', 'lower');
    expect(modulesInRegion(moved, available, 'lower')).toEqual(['engine', 'notes']);
  });

  it('leaves a module out of the region it was moved away from', () => {
    const moved = moveModule(DEFAULT_ARRANGEMENT, 'engine', 'lower');
    expect(modulesInRegion(moved, available, 'dock')).toEqual(['explorer', 'notes']);
  });

  it('keeps the move tree out of the dock until it is put there', () => {
    expect(modulesInRegion(DEFAULT_ARRANGEMENT, available, 'primary')).toEqual(['move-tree']);
  });
});

describe('activeInRegion', () => {
  it('falls back to the first module when the stored selection has moved away', () => {
    /*
      The bug this prevents: move the active tool to the lower panel and the
      dock is left selecting a module that is no longer in it, so it renders
      nothing and looks broken.
    */
    const arrangement: WorkspaceArrangement = {
      ...DEFAULT_ARRANGEMENT,
      active: { dock: 'engine' },
    };
    expect(activeInRegion(arrangement, ['explorer', 'notes'], 'dock')).toBe('explorer');
  });

  it('keeps a stored selection that is still present', () => {
    const arrangement: WorkspaceArrangement = {
      ...DEFAULT_ARRANGEMENT,
      active: { dock: 'notes' },
    };
    expect(activeInRegion(arrangement, ['explorer', 'notes'], 'dock')).toBe('notes');
  });

  it('reports nothing for an empty region rather than inventing a module', () => {
    expect(activeInRegion(DEFAULT_ARRANGEMENT, [], 'lower')).toBeNull();
  });
});

describe('moveModule', () => {
  it('selects the module in its new region, so the move is visible', () => {
    const moved = moveModule(DEFAULT_ARRANGEMENT, 'engine', 'lower');
    expect(moved.active.lower).toBe('engine');
  });

  it('does not disturb other placements', () => {
    const first = moveModule(DEFAULT_ARRANGEMENT, 'engine', 'lower');
    const second = moveModule(first, 'notes', 'lower');
    expect(second.placement).toEqual({ engine: 'lower', notes: 'lower' });
  });
});

describe('size clamps', () => {
  it('keeps the dock wide enough to read and narrow enough to leave the board room', () => {
    expect(clampDockWidth(10)).toBe(320);
    expect(clampDockWidth(5000)).toBe(640);
    expect(clampDockWidth(451.4)).toBe(451);
  });

  it('keeps the lower panel from swallowing the board', () => {
    expect(clampLowerHeight(0)).toBe(140);
    expect(clampLowerHeight(9999)).toBe(520);
  });
});
