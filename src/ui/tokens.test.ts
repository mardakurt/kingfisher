import { UI_TOKENS, UI_TOKEN_CSS_NAMES } from './tokens';

describe('workstation design tokens', () => {
  it('keeps controls, icons and navigation on a compact four-pixel rhythm', () => {
    const measured = [
      ...Object.values(UI_TOKENS.spacing),
      ...Object.values(UI_TOKENS.control),
      ...Object.values(UI_TOKENS.sidebar),
      ...Object.values(UI_TOKENS.panelHeader),
    ];
    expect(measured.every((value) => value % 2 === 0)).toBe(true);
    expect(UI_TOKENS.control.navigation).toBeGreaterThanOrEqual(40);
    expect(UI_TOKENS.icon.navigation).toBeGreaterThanOrEqual(20);
    expect(Object.values(UI_TOKENS.icon).every((value) => value >= 16)).toBe(true);
  });

  it('publishes unique CSS custom-property names', () => {
    expect(new Set(UI_TOKEN_CSS_NAMES).size).toBe(UI_TOKEN_CSS_NAMES.length);
  });
});
