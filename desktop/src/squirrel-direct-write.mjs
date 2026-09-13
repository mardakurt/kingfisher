/**
 * Work around the Squirrel.Mac SMJobBless prompt that fires on every
 * Electron-updater install of a Developer ID-signed macOS app.
 *
 * ## What is wrong
 *
 * `electron-updater`'s macOS path uses Electron's stock `Squirrel.Mac`
 * helper (`Squirrel.framework/Resources/ShipIt`). ShipIt tries to
 * install itself as a privileged helper tool via `SMJobBless` so it can
 * swap the bundle on disk in protected locations. That call surfaces
 * the macOS dialog
 *
 *     "An update is ready to install. Kingfisher is trying to add a
 *      new helper tool. Touch ID or enter your password to allow this."
 *
 * and the prompt fires **every** update. On a Developer ID-signed,
 * notarised bundle, ShipIt always detects that it cannot write the
 * bundle contents directly (because of `com.apple.macl`), so the
 * SMJobBless path is always taken, and the prompt never goes away.
 * This is a known Squirrel.Mac bug — see Squirrel/Squirrel.Mac#192
 * and #247.
 *
 * ## What this module does
 *
 * Squirrel.Mac reads `SquirrelMacEnableDirectContentsWrite` from the
 * user's defaults for the app's bundle identifier. When it is set to
 * the **string** `"TRUE"` (or `"true"` / `"1"`), ShipIt uses its
 * direct-bundle-write path and never calls `SMJobBless`. The check in
 * ShipIt's source is
 *
 *     return [override isEqualToString:@"true"]
 *         || [override isEqualToString:@"TRUE"]
 *         || [override isEqualToString:@"1"];
 *
 * Note the string comparison: writing `-bool TRUE` (which `defaults`
 * stores as an integer `1`) does **not** enable the path, because the
 * comparison fails for `NSNumber`. It has to be `-string TRUE`. This
 * module writes the value as a string and is the only place in the
 * codebase that does so.
 *
 * ## When it runs
 *
 * Once per app launch, from `main.mjs`, after the log is open and
 * before the update service is constructed. Idempotent: re-writing the
 * same value is a no-op for `defaults`.
 *
 * ## What it is not
 *
 * - Not a privilege escalation. The fix only suppresses the prompt;
 *   ShipIt still has to be able to write the bundle on disk, which
 *     requires the user to own (or be able to modify) the install
 *     directory. If the bundle lives in `/Applications/` and is owned
 *     by `root:wheel`, ShipIt will silently fail later in its own
 *     direct-write path. The user has to reinstall from the DMG into
 *     a user-writable location for updates to actually apply.
 * - Not a security downgrade. The `SquirrelMacEnableDirectContentsWrite`
 *   flag does not change who can install a Kingfisher update — the
 *   install ZIP is still SHA-512 verified against a notarised manifest,
 *   and the new bundle is still Developer ID signed by the same
 *   identity. It only removes the *re-prompt*; the actual privilege
 *   check happens at the file-system layer the way it always has.
 */

import { execFileSync } from 'node:child_process';
import { platform } from 'node:process';

import { log } from './log.mjs';

const FLAG = 'SquirrelMacEnableDirectContentsWrite';
const ON = 'TRUE';

/**
 * If we are running on macOS, set the Squirrel.Mac direct-write flag in
 * the user's defaults for our bundle identifier. Idempotent. Returns
 * whether anything was changed (false on non-macOS, false if the flag
 * was already correct).
 */
export function ensureSquirrelMacDirectWrite(bundleIdentifier) {
  if (platform !== 'darwin') return false;
  if (!bundleIdentifier) {
    log('update', `squirrel direct-write flag not set: no bundle identifier`);
    return false;
  }

  let current;
  try {
    current = execFileSync('/usr/bin/defaults', ['read', bundleIdentifier, FLAG], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // `defaults read` exits non-zero when the key is missing; treat as
    // "unset" and fall through to the write below.
    current = null;
  }
  if (current === ON) {
    return false;
  }

  try {
    execFileSync('/usr/bin/defaults', ['write', bundleIdentifier, FLAG, '-string', ON], {
      encoding: 'utf8',
    });
  } catch (err) {
    log('update', `squirrel direct-write flag write failed: ${String(err?.message ?? err)}`);
    return false;
  }

  if (current === null) {
    log(
      'update',
      `squirrel direct-write flag set: ${bundleIdentifier} ${FLAG}="<unset>" -> "${ON}"`,
    );
  } else {
    log(
      'update',
      `squirrel direct-write flag changed: ${bundleIdentifier} ${FLAG}="${current}" -> "${ON}"`,
    );
  }
  return true;
}
