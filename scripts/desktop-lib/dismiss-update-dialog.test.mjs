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
  /*
    Phase 88, recorded and not fixed there: walk seed 46 step 83 reported
    `action-threw: could not click "OK": Can't get window 1 of process 1 …
    Invalid index. (-1719)`, and three later runs of the same seed were clean.
    The window was already gone — the harness lost a race with Sparkle — and
    the application had done nothing wrong. Recording that as a finding makes
    a green bundle look broken and a real defect harder to find among races.
  */
  it('does not report a finding when the update window leaves before the click lands', async () => {
    const ui = boundary();
    ui.clickButton.mockImplementation(() => {
      throw new Error("Can't get window 1 of process 1 … Invalid index. (-1719)");
    });
    // The window is no longer in Accessibility's list, and the verdict is not
    // the up-to-date one the Return path is allowed to act on.
    ui.windowsOf.mockReturnValue([]);
    ui.readVerdict.mockResolvedValue({ status: 'unknown' });
    const result = await dismissUpdateDialog({ pid: 42 }, ui);
    expect(result.vanished).toBe(true);
    expect(result.said).toContain('up to date');
  });
  it('still reports a vanished window when an update was on offer', async () => {
    // The one case where "it is gone" must not be believed: the default button
    // installs the bundle under test, so a dismissal that did not happen has
    // to stay visible.
    const ui = boundary({
      ...alert,
      texts: ['You’re up to date!'],
      buttons: ['Install Update'],
    });
    ui.closeWindow.mockImplementation(() => {
      throw new Error('Invalid index');
    });
    ui.readVerdict.mockResolvedValue({ status: 'unknown' });
    await expect(dismissUpdateDialog({ pid: 42 }, ui)).rejects.toThrow('Invalid index');
  });
  it('still reports a window that is present but was never clicked', async () => {
    const ui = boundary();
    ui.clickButton.mockImplementation(() => {
      throw new Error('Invalid index (-1719)');
    });
    ui.readVerdict.mockResolvedValue({ status: 'error' });
    // Still in Accessibility's list: nothing was dismissed, so this must throw.
    ui.windowsOf.mockReturnValue([alert]);
    await expect(dismissUpdateDialog({ pid: 42 }, ui)).rejects.toThrow(
      /Invalid index|safely dismissed/,
    );
  });
});
