/**
 * The profile handoff across an update's relaunch.
 *
 * ## The defect this closes
 *
 * On macOS the update engine (Squirrel.Mac, behind electron-updater) replaces
 * the bundle and relaunches it itself — with no arguments. A Kingfisher that
 * was started with `--user-data-dir=<somewhere else>` therefore comes back
 * on the *default* profile, `~/Library/Application Support/kingfisher-desktop`,
 * which is the owner's own work. `scripts/desktop-update-e2e-real.mjs` ran
 * exactly that way in Phases 51, 52 and 53: a freshly built 1.1.5, then a
 * 1.1.6, each opened the owner's real profile for eight seconds, ran the web
 * server and the companion against it, and recorded itself as the last
 * version that launched there. The owner's installed 1.1.4 then greeted
 * them with "Kingfisher was updated to 1.1.4. Previously 1.1.6." before
 * they had updated anything. The harness's header called the few seconds a
 * known consequence; the notice made it a visible one.
 *
 * ## The mechanism
 *
 * Before `quitAndInstall`, the shell writes one small file under the
 * updater's own cache directory — never under any profile — naming the
 * profile it is running on. On the next start, before anything reads
 * `userData`, the shell takes the file (deletes it, whether or not it is
 * used) and, if it is fresh, adopts the profile it names. A person on the
 * default profile is handed the default profile, which changes nothing; a
 * harness or a power user on another profile is reopened where they were.
 *
 * Five minutes is the budget for a relaunch. A file older than that is a
 * relaunch that never happened — a crash between quit and relaunch, or a
 * person who declined the install at the last moment — and must not steer
 * some later, unrelated launch into a directory that may no longer exist.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RELAUNCH_PROFILE_FILE = 'relaunch-profile.json';
export const RELAUNCH_PROFILE_TTL_MS = 5 * 60_000;

/** Write the handoff. Never throws: a failure here must not stop an install. */
export function writeRelaunchProfile(cacheDir, userData, now = Date.now()) {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, RELAUNCH_PROFILE_FILE),
      `${JSON.stringify({ userData, at: new Date(now).toISOString() }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the handoff: the profile to adopt, or null. The file is removed in
 * every case, so a handoff is consumed by exactly one launch.
 */
export function takeRelaunchProfile(cacheDir, now = Date.now()) {
  const file = path.join(cacheDir, RELAUNCH_PROFILE_FILE);
  if (!existsSync(file)) return null;
  let body = null;
  try {
    body = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    body = null;
  }
  try {
    rmSync(file, { force: true });
  } catch {
    /* a file that cannot be removed is still not reused: it was read once */
  }
  if (!body || typeof body.userData !== 'string' || typeof body.at !== 'string') return null;
  const at = Date.parse(body.at);
  if (!Number.isFinite(at) || now - at > RELAUNCH_PROFILE_TTL_MS || at > now + 60_000) return null;
  if (!path.isAbsolute(body.userData) || !existsSync(body.userData)) return null;
  return { userData: body.userData };
}

/**
 * Whether `previous` is a newer marketing version than `current` — a launch
 * of an *older* build on a profile, which is a downgrade and not an update.
 * Dotted numbers compared field by field; a pre-release suffix is ignored,
 * because the question is only "did this profile go backwards".
 */
export function isDowngrade(previous, current) {
  const parse = (value) =>
    String(value)
      .split('-')[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(previous);
  const b = parse(current);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}
