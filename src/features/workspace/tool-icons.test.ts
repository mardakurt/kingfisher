import { MOVE_TREE_MODULE, WORKSPACE_MODULES } from './modules';
import { WORKSPACE_TOOL_ICONS } from './tool-icons';

describe('workspace tool icon registry', () => {
  it('maps every tool exactly once through the shared icon family', () => {
    const modules = [...Object.keys(WORKSPACE_MODULES), MOVE_TREE_MODULE.id].sort();
    expect(Object.keys(WORKSPACE_TOOL_ICONS).sort()).toEqual(modules);
    expect(Object.values(WORKSPACE_TOOL_ICONS).every((icon) => typeof icon === 'function')).toBe(
      true,
    );
  });
});
