/**
 * What a managed engine is allowed to see, ask for, and take.
 *
 * ## Read this before describing any of it as a sandbox
 *
 * It is not one. A managed engine is a native binary running as the user, with
 * the user's own filesystem permissions, and nothing here changes that.
 * `docs/ENGINES.md` says so and must keep saying so. What this module does is
 * narrower and worth doing anyway: it removes the reasons an engine would ever
 * need to see the rest of the machine, and it puts a ceiling on what one can
 * take when it is asked for too much.
 *
 * Four things, each of which was something an engine could previously do:
 *
 * **See every environment variable the companion has.** `spawn` was handed
 * `process.env` wholesale, so an engine inherited whatever was in the shell
 * that started Kingfisher — API tokens, cloud credentials, anything. An engine
 * needs a handful of variables to start at all and none of them are secret, so
 * it now gets an allowlist and the paths its own configuration names.
 *
 * **Outlive the stop.** `child.kill()` ends the process Kingfisher spawned. An
 * engine that had spawned helpers of its own left them running, holding cores
 * and memory with nothing tracking them. Engines are started in their own
 * process group and the group is what gets signalled.
 *
 * **Grow a line without end.** The output reader buffered a partial line until
 * a newline arrived. An engine writing without one — a broken build, a binary
 * that is not an engine at all — grew that buffer until the companion died.
 *
 * **Take the whole machine.** `setoption name Threads value 1024` and
 * `setoption name Hash value 33554432` are both inside what Stockfish 19
 * accepts, and 32 GB of hash on a 16 GB machine is not a slow search, it is a
 * dead one. Four sessions can run at once, so the ceiling has to hold across
 * all of them.
 *
 * ## What is deliberately not here
 *
 * There is **no search timeout**. A ten-minute think on a critical position is
 * the product working, and a watchdog that ended it would be a bug that looked
 * like a feature. Limits here are on resources an engine holds, not on how long
 * it is allowed to think.
 */

import { cpus, totalmem } from 'node:os';

/**
 * Environment variables an engine is given, by platform.
 *
 * Every one is here because a process needs it to start or to find its own
 * libraries, and none of them carries anything private. Anything an engine
 * genuinely needs beyond this — a Syzygy directory, a network file — is
 * configuration, comes from the engine's own record, and is passed explicitly.
 *
 * `HOME` is on the list reluctantly and for a real reason: Lc0 looks beside it
 * for weights, and an Lc0 that cannot find its network is an Lc0 that
 * handshakes and cannot search, which is the exact failure the fleet
 * verification exists to catch.
 */
const ALLOWED = {
  posix: ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_NUMERIC', 'TERM'],
  win32: [
    'PATH',
    'SystemRoot',
    'SystemDrive',
    'windir',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'COMSPEC',
    'PATHEXT',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
  ],
};

/** Longest single line accepted from an engine before the line is cut. */
export const MAX_LINE = 64 * 1024;

/**
 * The environment a managed engine runs with.
 *
 * `extra` is the engine's own configured variables — the caller's, not the
 * request's. A variable there overrides an inherited one, which is how a
 * configured `TMPDIR` wins over the companion's.
 */
export function engineEnvironment(source = process.env, extra = {}, platform = process.platform) {
  const allowed = platform === 'win32' ? ALLOWED.win32 : ALLOWED.posix;
  const env = {};
  for (const name of allowed) {
    // Windows environment names are case-insensitive; match them that way
    // rather than missing `Path` because the list says `PATH`.
    const key =
      platform === 'win32'
        ? Object.keys(source).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
        : name;
    if (key && source[key] !== undefined) env[name] = source[key];
  }
  for (const [name, value] of Object.entries(extra ?? {})) {
    if (value === undefined || value === null) continue;
    env[name] = String(value);
  }
  return env;
}

/**
 * Ceilings for one engine session, derived from the machine.
 *
 * `sessions` is how many engines may run at once, and the thread ceiling is
 * divided by it: the multi-engine comparison is the case this exists for, and
 * four engines each given every core is four engines each running at a quarter
 * speed while the interface stops responding.
 *
 * Hash is a quarter of physical memory divided the same way. A quarter is
 * conservative on purpose — the operating system, the browser and the
 * companion are all still running, and an engine that is swapping searches
 * slower than one with a smaller table.
 */
export function resourceCeiling({
  sessions = 1,
  cores = cpus().length,
  memoryBytes = totalmem(),
} = {}) {
  const share = Math.max(1, sessions);
  return {
    // At least one thread each, however many sessions are asked for.
    threads: Math.max(1, Math.floor(Math.max(1, cores) / share)),
    // At least 16 MB, which is Stockfish's own default and always workable.
    hashMb: Math.max(16, Math.floor(memoryBytes / 4 / 1024 / 1024 / share)),
  };
}

const NUMERIC_OPTIONS = {
  threads: 'threads',
  hash: 'hashMb',
};

/**
 * Clamp a UCI command to the session's ceiling.
 *
 * Returns the line to send and, when it was changed, what was asked for — the
 * caller reports that rather than silently substituting a number, because an
 * engine that quietly ignores the thread count it was given is indistinguishable
 * from one that is broken.
 *
 * Only `Threads` and `Hash` are clamped. Every other option is passed through
 * untouched: this is a resource ceiling, not a filter on what an engine may be
 * configured to do.
 */
export function clampCommand(line, ceiling) {
  const text = String(line);
  const match = /^\s*setoption\s+name\s+(.+?)\s+value\s+(.+?)\s*$/i.exec(text);
  if (!match) return { line: text, clamped: null };
  const name = (match[1] ?? '').trim();
  const field = NUMERIC_OPTIONS[name.toLowerCase()];
  if (!field) return { line: text, clamped: null };

  const requested = Number((match[2] ?? '').trim());
  if (!Number.isFinite(requested)) return { line: text, clamped: null };
  const limit = ceiling[field];
  if (!Number.isFinite(limit) || requested <= limit) return { line: text, clamped: null };

  return {
    line: `setoption name ${name} value ${limit}`,
    clamped: { option: name, requested, allowed: limit },
  };
}

/**
 * Cut a partial line that has grown past what any UCI line can be.
 *
 * A UCI line is a move list at worst. Something producing 64 kB without a
 * newline is not speaking UCI, and the honest response is to stop accumulating
 * it and say so rather than to keep reading until memory runs out.
 */
export function truncatePending(pending, max = MAX_LINE) {
  if (pending.length <= max) return { pending, overflowed: false };
  return { pending: '', overflowed: true };
}

/**
 * How this platform can be told to end a whole process group.
 *
 * POSIX signals the negated process-group id, which is why engines are started
 * detached. Windows has no process groups in that sense; `taskkill /T` walks
 * the child tree instead, and is a separate process rather than a signal.
 *
 * Named rather than assumed because the two behave differently enough that a
 * caller has to know which it got — and because "we kill the process group" is
 * a claim, and on Windows it is a different claim.
 */
export const GROUP_TERMINATION = process.platform === 'win32' ? 'taskkill-tree' : 'process-group';
