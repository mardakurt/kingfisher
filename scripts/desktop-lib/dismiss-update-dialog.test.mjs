import { describe, expect, it, vi } from 'vitest';
import { dismissUpdateDialog } from './dismiss-update-dialog.mjs';

const alert = { index: 1, sheet: null, texts: ['You’re up to date!'], buttons: ['OK'] };
function boundary(shown = alert) {
  return {
    waitForWindow: vi.fn(async () => shown),
    findWindow: vi.fn(() => ({ ...shown, index: 2 })),
    clickButton: vi.fn(),
    closeWindow: vi.fn(),
    pause: vi.fn(async () => {}),
    readVerdict: vi.fn(async () => ({ status: 'up-to-date' })),
    windowsOf: vi.fn(() => []),
    confirmUpToDate: vi.fn(),
  };
}
describe('native update dismissal', () => {
  it('clicks the freshly resolved index rather than the observed index', async () => {
    const ui = boundary();
    await dismissUpdateDialog({ pid: 42 }, ui);
    expect(ui.clickButton).toHaveBeenCalledWith({ pid: 42 }, 2, 'OK', null);
    expect(ui.confirmUpToDate).not.toHaveBeenCalled();
  });
  it('dismisses a known full-screen up-to-date alert after AX click failure', async () => {
    const ui = boundary();
    ui.clickButton.mockImplementation(() => {
      throw new Error('Invalid index (-1719)');
    });
    const result = await dismissUpdateDialog(42, ui);
    expect(ui.confirmUpToDate).toHaveBeenCalledOnce();
    expect(result.said).toBe('dismissed with Return (up to date)');
  });
  it('does not keep clicking the stale index when the window disappears', async () => {
    const ui = boundary();
    ui.findWindow.mockReturnValue(null);
    await dismissUpdateDialog(42, ui);
    expect(ui.clickButton).not.toHaveBeenCalled();
    expect(ui.confirmUpToDate).toHaveBeenCalledOnce();
  });
  it('never presses Return on an offered update even with an older up-to-date verdict', async () => {
    const ui = boundary({
      ...alert,
      texts: ['A new version is available'],
      buttons: ['Install Update'],
    });
    ui.closeWindow.mockImplementation(() => {
      throw new Error('Invalid index');
    });
    await expect(dismissUpdateDialog(42, ui)).rejects.toThrow('Invalid index');
    expect(ui.confirmUpToDate).not.toHaveBeenCalled();
  });
  it('refuses Return if an offered window appeared after the observed alert', async () => {
    const ui = boundary();
    ui.findWindow.mockReturnValue(null);
    ui.windowsOf.mockReturnValue([{ buttons: ['Install Update'] }]);
    await expect(dismissUpdateDialog(42, ui)).rejects.toThrow('safely dismissed');
    expect(ui.confirmUpToDate).not.toHaveBeenCalled();
  });
  it('fails if the native dialog remains after the click', async () => {
    const ui = boundary();
    ui.windowsOf.mockReturnValue([alert]);
    await expect(dismissUpdateDialog(42, ui)).rejects.toThrow('remains open');
  });
});
