/**
 * Driving Sparkle's own windows from a harness.
 *
 * Sparkle draws native AppKit windows — the update found, the download, the
 * ready-to-install prompt — and Playwright cannot see them. macOS can: the
 * Accessibility API, through System Events, lists a process's windows,
 * their static texts and their buttons, and clicks the buttons. That is
 * what a person does, and it is what the update harnesses do; there is no
 * hidden "headless" path in the application for a test to take.
 *
 * The process running the harness needs Accessibility permission (System
 * Settings → Privacy & Security → Accessibility). Without it System Events
 * answers with error -25211, which `assertAccessibility()` turns into a
 * sentence.
 */

import { spawnSync } from 'node:child_process';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function osascript(script) {
  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

/** Throws a readable error when UI scripting is not permitted. */
export function assertAccessibility() {
  const probe = osascript(
    'tell application "System Events" to get name of every process whose frontmost is true',
  );
  if (!probe.ok) {
    throw new Error(
      `System Events refused UI scripting (${probe.err}). Grant Accessibility permission to the terminal running this harness: System Settings → Privacy & Security → Accessibility.`,
    );
  }
}

/**
 * Every window of the process, with its static texts and button names.
 * A process that is not running, or has no windows, yields [].
 */
export function windowsOf(processName) {
  const script = `
    tell application "System Events"
      if not (exists process "${processName}") then return ""
      tell process "${processName}"
        set out to ""
        set n to count of windows
        repeat with i from 1 to n
          set w to window i
          set texts to ""
          try
            repeat with t in (every static text of w)
              set texts to texts & (value of t as text) & "\\u001f"
            end repeat
          end try
          set names to ""
          try
            repeat with b in (every button of w)
              set names to names & (name of b as text) & "\\u001f"
            end repeat
          end try
          set title to ""
          try
            set title to name of w as text
          end try
          set out to out & i & "\\u001e" & title & "\\u001e" & texts & "\\u001e" & names & "\\u001d"
        end repeat
        return out
      end tell
    end tell`;
  const result = osascript(script);
  if (!result.ok || !result.out) return [];
  return result.out
    .split('')
    .filter(Boolean)
    .map((row) => {
      const [index, title, texts, names] = row.split('');
      return {
        index: Number(index),
        title,
        texts: texts.split('').filter(Boolean),
        buttons: names.split('').filter(Boolean),
      };
    });
}

/** The first window whose button names or texts match, or null. */
export function findWindow(processName, { button = null, text = null } = {}) {
  for (const window of windowsOf(processName)) {
    const buttonOk = !button || window.buttons.some((name) => button.test(name));
    const textOk =
      !text ||
      window.texts.some((value) => text.test(value)) ||
      (window.title && text.test(window.title));
    if (buttonOk && textOk) return window;
  }
  return null;
}

/** Wait for a window matching, up to `timeoutMs`; returns it or null. */
export async function waitForWindow(processName, match, { timeoutMs = 60_000, every = 500 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = findWindow(processName, match);
    if (found) return found;
    await wait(every);
  }
  return null;
}

/** Click the named button in the given window (by index). */
export function clickButton(processName, windowIndex, buttonName) {
  const script = `tell application "System Events" to tell process "${processName}" to click button "${buttonName.replace(/"/g, '\\"')}" of window ${windowIndex}`;
  const result = osascript(script);
  if (!result.ok) throw new Error(`could not click "${buttonName}": ${result.err}`);
  return true;
}

/** Wait for a button to appear in any window of the process, then click it. */
export async function waitAndClick(processName, button, { timeoutMs = 60_000, text = null } = {}) {
  const window = await waitForWindow(processName, { button, text }, { timeoutMs });
  if (!window) return null;
  const name = window.buttons.find((candidate) => button.test(candidate));
  // Re-resolve the window index at click time: Sparkle's windows come and go.
  const current = findWindow(processName, { button });
  clickButton(processName, (current ?? window).index, name);
  return { window, button: name };
}

/** Bring the process to the front, so its windows accept clicks. */
export function activate(processName) {
  osascript(
    `tell application "System Events" to set frontmost of process "${processName}" to true`,
  );
}
