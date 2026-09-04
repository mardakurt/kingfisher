import { describe, expect, it } from 'vitest';

import {
  activeInRegion,
  BOARD_PRIORITIES,
  clampDockWidth,
  clampLowerHeight,
  DEFAULT_ARRANGEMENT,
  defaultArrangement,
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  LOWER_HEIGHT_MAX,
  LOWER_HEIGHT_MIN,
  modulesInRegion,
  moveModule,
  regionOf,
  sanitizeArrangement,
  type BoardPriority,
  type WorkspaceArrangement,
  type WorkspaceModuleId,
  type WorkspaceRegion,
} from './layout-model';

const knownModules: ReadonlySet<WorkspaceModuleId> = new Set([
  'engine',
  'explorer',
  'notes',
  'move-tree',
]);

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
    expect(clampDockWidth(10)).toBe(DOCK_WIDTH_MIN);
    expect(clampDockWidth(5000)).toBe(DOCK_WIDTH_MAX);
    expect(clampDockWidth(451.4)).toBe(451);
  });

  it('keeps the lower panel from swallowing the board', () => {
    expect(clampLowerHeight(0)).toBe(LOWER_HEIGHT_MIN);
    expect(clampLowerHeight(9999)).toBe(LOWER_HEIGHT_MAX);
  });

  /*
    The floors are what a laptop's board depends on. At 1280x720 the board is
    limited by height, and every pixel the notation panel keeps is a pixel the
    board does not get — so the minimum has to be small enough that Maximum
    board priority can actually deliver a maximum board.
  */
  it('lets the notation panel get small enough for a laptop board to be large', () => {
    expect(LOWER_HEIGHT_MIN).toBeLessThanOrEqual(120);
    expect(DOCK_WIDTH_MIN).toBeLessThanOrEqual(340);
  });
});

describe('board priority', () => {
  it('offers three policies, ordered by how much the board gets', () => {
    const order = ['balanced', 'large', 'maximum'] as const;
    for (let index = 1; index < order.length; index += 1) {
      const looser = BOARD_PRIORITIES[order[index - 1] as BoardPriority];
      const tighter = BOARD_PRIORITIES[order[index] as BoardPriority];
      expect(tighter.dockWidth).toBeLessThan(looser.dockWidth);
      expect(tighter.maxBoard).toBeGreaterThan(looser.maxBoard);
    }
  });

  it('gives a laptop a smaller notation panel than a desktop, at every policy', () => {
    for (const shape of Object.values(BOARD_PRIORITIES)) {
      expect(shape.shortLowerHeight).toBeLessThanOrEqual(shape.lowerHeight);
      expect(shape.shortLowerHeight).toBeGreaterThanOrEqual(LOWER_HEIGHT_MIN);
    }
  });

  it('produces a valid arrangement for every policy, on both screen shapes', () => {
    for (const priority of ['balanced', 'large', 'maximum'] as const) {
      for (const short of [false, true]) {
        const arrangement = defaultArrangement(priority, short);
        expect(clampDockWidth(arrangement.dockWidth)).toBe(arrangement.dockWidth);
        expect(clampLowerHeight(arrangement.lowerHeight)).toBe(arrangement.lowerHeight);
      }
    }
  });

  it('folds the notation into the dock only at Maximum', () => {
    expect(defaultArrangement('maximum').placement['move-tree']).toBe('dock');
    expect(defaultArrangement('large').placement['move-tree']).toBeUndefined();
    expect(defaultArrangement('balanced').placement['move-tree']).toBeUndefined();
  });
});

describe('sanitizeArrangement', () => {
  it('returns the default for anything that is not an object', () => {
    expect(sanitizeArrangement(null, knownModules)).toEqual(DEFAULT_ARRANGEMENT);
    expect(sanitizeArrangement('garbage', knownModules)).toEqual(DEFAULT_ARRANGEMENT);
    expect(sanitizeArrangement(undefined, knownModules)).toEqual(DEFAULT_ARRANGEMENT);
  });

  it('keeps a well-formed arrangement as-is', () => {
    const value: WorkspaceArrangement = {
      placement: { engine: 'lower' },
      active: { lower: 'engine' },
      dockWidth: 500,
      lowerHeight: 250,
      dockCollapsed: true,
    };
    expect(sanitizeArrangement(value, knownModules)).toEqual(value);
  });

  it('drops an unknown module from placement and active', () => {
    const result = sanitizeArrangement(
      { placement: { ghost: 'dock' }, active: { dock: 'ghost' } },
      knownModules,
    );
    expect(result.placement).toEqual({});
    expect(result.active).toEqual({});
  });

  it('drops an illegal region', () => {
    const result = sanitizeArrangement({ placement: { engine: 'floating' } }, knownModules);
    expect(result.placement).toEqual({});
  });
});
