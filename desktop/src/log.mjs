/**
 * A local log a beta tester can send, and nobody can accidentally publish.
 *
 * Kingfisher has no telemetry and is not getting any. What it did not have
 * either was any record that survived a quit: the shell kept the companion's
 * last two hundred lines in memory, so the one report worth having — "it
 * wouldn't start, here is what it said" — was gone by the time the person
 * reopened the application to look for a diagnostics screen.
 *
 * ## What this is not
 *
 * Not a crash reporter, not an uploader, and not a channel. Nothing here
 * contacts anything. The file sits in the user's own application-support
 * directory and is opened with the Finder when they ask for it.
 *
 * ## The two rules
 *
 * **Bounded.** A log that can grow without limit is a bug with a delay on it.
 * One file, rotated to a single `.1` at 512 kB, so the worst case on disk is
 * about a megabyte whatever happens — and a runaway loop can cost the user
 * that and no more.
 *
 * **Redacted at the point of writing.** The companion's pairing token is
 * minted per run and never printed, but "never printed" is a claim about code
 * that keeps changing, and this file outlives the process that made the claim.
 * Every line goes through the same replacement before it is written, so a token
 * that leaks into a stack trace is caught by the thing that would otherwise
 * persist it. Redaction on read would be too late: the bytes would already be
 * on the disk.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 512 * 1024;

/** Values replaced in every line, whatever produced them. */
const secrets = new Set();

let file = null;

/** Where the log lives, once a userData directory is known. */
export function openLog(userDataDirectory) {
  const directory = path.join(userDataDirectory, 'logs');
  mkdirSync(directory, { recursive: true });
  file = path.join(directory, 'kingfisher.log');
  return file;
}

export const logFile = () => file;

/**
 * Register a value that must never reach the disk.
 *
 * Short values are ignored rather than replaced: a two-character "secret" would
 * turn every line into asterisks and destroy the log's usefulness to make a
 * point about a value that is not secret anyway.
 */
export function redactInLog(value) {
  if (typeof value === 'string' && value.length >= 8) secrets.add(value);
}

function scrub(text) {
  let output = String(text);
  for (const secret of secrets) output = output.split(secret).join('[redacted]');
  // Custom manifest addresses and echoed request URLs may carry credentials
  // that were never entered in Settings. Keep the endpoint, not its secrets.
  output = output.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}${url.hash ? '#[redacted]' : ''}`;
    } catch {
      return '[redacted URL]';
    }
  });
  output = output.replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s]+/g, '[home]');
  // Bearer tokens and long hex strings, whether or not we know their value.
  output = output.replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]');
  output = output.replace(/\b[0-9a-f]{32,}\b/gi, '[redacted]');
  return output;
}

function rotate() {
  if (!file || !existsSync(file)) return;
  try {
    if (statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    // A log that cannot rotate must not take the application down with it.
  }
}

/**
 * Write one line.
 *
 * Every failure is swallowed, deliberately and at the only place it can be
 * decided: a full disk, a read-only home directory or a revoked permission are
 * all real, and none of them is a reason for a chess application to stop. The
 * cost of the swallow is that a broken log is silent, which is why `openLog`
 * returns the path and diagnostics reports it — an empty file at a stated
 * location is a diagnosis, and an exception here would not have been.
 */
export function log(scope, message) {
  if (!file) return;
  try {
    rotate();
    appendFileSync(file, `${new Date().toISOString()} [${scope}] ${scrub(message)}\n`);
  } catch {
    /* see above */
  }
}
