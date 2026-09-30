/** Drive the native update UI without ever accepting an offered update. */
export async function dismissUpdateDialog(target, ui) {
  const shown = await ui.waitForWindow(
    target,
    { button: /^(OK|Install Update|Cancel Update|Close|Remind Me Later)$/ },
    { timeoutMs: 45_000 },
  );
  let said = shown?.texts.join(' | ') ?? null;
  let clicked = false;
  let lastError = null;
  if (shown) {
    const dismiss = ['OK', 'Cancel Update', 'Close', 'Remind Me Later'].find((name) =>
      shown.buttons.includes(name),
    );
    for (let attempt = 0; attempt < 8 && !clicked; attempt += 1) {
      // Never reuse an index belonging to a window that has disappeared.
      const current = ui.findWindow(target, {
        button: dismiss ? new RegExp(`^${dismiss}$`) : /^Install Update$/,
      });
      if (current) {
        try {
          if (dismiss) ui.clickButton(target, current.index, dismiss, current.sheet);
          else ui.closeWindow(target, current.index);
          clicked = true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!clicked) await ui.pause(400);
    }
    if (clicked) await ui.pause(700);
  }
  const verdict = await ui.readVerdict();
  if (!clicked && verdict?.status === 'up-to-date') {
    // A modal NSAlert in a full-screen Space can disappear from AX's window
    // list. Return is safe only for the observed up-to-date alert (or the
    // existing no-window case), never an offered update's default Install.
    const offered =
      shown?.buttons.includes('Install Update') ||
      ui.windowsOf(target).some((window) => window.buttons.includes('Install Update'));
    const knownAlert =
      !shown || shown.texts.some((text) => /up.to.date|newest version available/i.test(text));
    if (!offered && knownAlert) {
      ui.confirmUpToDate(target);
      await ui.pause(700);
      clicked = true;
      said = 'dismissed with Return (up to date)';
    }
  }
  if (shown && !clicked) {
    throw lastError ?? new Error('Native update window could not be safely dismissed');
  }
  if (
    clicked &&
    ui
      .windowsOf(target)
      .some((window) =>
        window.buttons.some((button) =>
          /^(OK|Install Update|Cancel Update|Remind Me Later)$/.test(button),
        ),
      )
  ) {
    throw new Error('Native update dialog remains open after dismissal');
  }
  return { verdict, said, shown: Boolean(shown) };
}
