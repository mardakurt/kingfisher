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
 * The System Events reference for a process: by pid when the caller has one
 * (a harness always does, and an installed Kingfisher may be running beside
 * the one under test), by name otherwise.
 */
function processRef(target) {
  if (typeof target === 'number') return `first process whose unix id is ${target}`;
  if (target && typeof target === 'object' && Number.isInteger(target.pid)) {
    return `first process whose unix id is ${target.pid}`;
  }
  return `process "${String(target).replace(/"/g, '\\"')}"`;
}

function processExists(target) {
  if (typeof target === 'number' || (target && typeof target === 'object')) {
    const pid = typeof target === 'number' ? target : target.pid;
    return `(exists (${processRef(pid)}))`;
  }
  return `(exists ${processRef(target)})`;
}

/**
 * Every window of the process, with its static texts and button names.
 * A process that is not running, or has no windows, yields []. `target`
 * is a process name, a pid, or `{ pid }`.
 */
export function windowsOf(target) {
  // Separators are ASCII control characters, spelled as `character id N`:
  // AppleScript strings have no \u escapes, and a script that tries one
  // does not compile — which this function once reported as "no windows".
  const script = `
    tell application "System Events"
      if not ${processExists(target)} then return ""
      set fieldSep to character id 30
      set itemSep to character id 31
      set rowSep to character id 29
      tell (${processRef(target)})
        set out to ""
        set n to count of windows
        repeat with i from 1 to n
          set w to window i
          set texts to ""
          try
            repeat with t in (every static text of w)
              set texts to texts & (value of t as text) & itemSep
            end repeat
          end try
          set names to ""
          try
            repeat with b in (every button of w)
              set names to names & (name of b as text) & itemSep
            end repeat
          end try
          set windowTitle to ""
          try
            set windowTitle to name of w as text
          end try
          set out to out & i & fieldSep & windowTitle & fieldSep & texts & fieldSep & names & fieldSep & "" & rowSep
          -- A message box the shell attaches to its window is a sheet, not a
          -- window of its own; list each with the window it hangs from.
          try
            set sheetCount to count of sheets of w
            repeat with j from 1 to sheetCount
              set sh to sheet j of w
              set sheetTexts to ""
              repeat with t in (every static text of sh)
                set sheetTexts to sheetTexts & (value of t as text) & itemSep
              end repeat
              set sheetNames to ""
              repeat with b in (every button of sh)
                set sheetNames to sheetNames & (name of b as text) & itemSep
              end repeat
              set out to out & i & fieldSep & windowTitle & fieldSep & sheetTexts & fieldSep & sheetNames & fieldSep & j & rowSep
            end repeat
          end try
        end repeat
        return out
      end tell
    end tell`;
  const result = osascript(script);
  if (!result.ok) {
    throw new Error(
      `System Events could not list the windows of ${JSON.stringify(target)}: ${result.err}`,
    );
  }
  if (!result.out) return [];
  return result.out
    .split('\u001d')
    .filter(Boolean)
    .map((row) => {
      const [index, title, texts, names, sheet] = row.split('\u001e');
      return {
        index: Number(index),
        /** The sheet's index within the window, when the row is a sheet. */
        sheet: sheet ? Number(sheet) : null,
        title,
        texts: texts.split('\u001f').filter(Boolean),
        buttons: names.split('\u001f').filter((name) => name && name !== 'missing value'),
      };
    });
}

/** The first window whose button names or texts match, or null. */
export function findWindow(target, { button = null, text = null } = {}) {
  for (const window of windowsOf(target)) {
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
export async function waitForWindow(target, match, { timeoutMs = 60_000, every = 500 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = findWindow(target, match);
    if (found) return found;
    await wait(every);
  }
  return null;
}

/** Click the named button in the given window (by index). */
export function clickButton(target, windowIndex, buttonName, sheetIndex = null) {
  const where = sheetIndex
    ? `sheet ${sheetIndex} of window ${windowIndex}`
    : `window ${windowIndex}`;
  const script = `tell application "System Events" to tell (${processRef(target)}) to click button "${buttonName.replace(/"/g, '\\"')}" of ${where}`;
  const result = osascript(script);
  if (!result.ok) throw new Error(`could not click "${buttonName}": ${result.err}`);
  return true;
}

/** Wait for a button to appear in any window of the process, then click it. */
export async function waitAndClick(target, button, { timeoutMs = 60_000, text = null } = {}) {
  const window = await waitForWindow(target, { button, text }, { timeoutMs });
  if (!window) return null;
  const name = window.buttons.find((candidate) => button.test(candidate));
  // Re-resolve the window index at click time: Sparkle's windows come and go.
  const current = findWindow(target, { button }) ?? window;
  clickButton(target, current.index, name, current.sheet);
  return { window, button: name };
}

/** Bring the process to the front, so its windows accept clicks. */
export function activate(processName) {
  osascript(
    `tell application "System Events" to set frontmost of process "${processName}" to true`,
  );
}
