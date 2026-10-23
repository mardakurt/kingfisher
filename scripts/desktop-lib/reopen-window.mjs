/** Reopen after the native window has closed. */
export async function reopenWindow(app) {
  // BrowserWindow's native close can finish before Playwright marks its old
  // Page closed. Subscribe first, so neither that page nor a fast new window
  // can be mistaken for the result of this activation.
  const opened = app.waitForEvent('window', { timeout: 10_000 });
  await app.evaluate(({ app }) => app.emit('activate'));
  return opened;
}
