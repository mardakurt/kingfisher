/**
 * The monthly data cycle (Phase 85): when a new upstream month is published,
 * the six-month Recent Theory pack is rebuilt over the newest six months and
 * published as the next version, and a channel file on the data mirror says
 * which version is current so an installed Kingfisher can find it.
 *
 * This module is the decision, and nothing else — no network, no disk — so
 * the one question that decides whether a month's build happens can be
 * tested: is there a published upstream month newer than the one the live
 * pack ends on?
 *
 * The window ends on the newest month the publisher has listed, never on the
 * calendar: on 25 September the newest broadcast archive is August's, and a
 * window "ending in September" names a file that does not exist. (The first
 * status script did exactly that, and recommended a rebuild that would have
 * produced the pack already live.)
 */

const MONTH = /_(\d{4})-(\d{2})\.pgn\.zst$/;

/** `lichess_db_broadcast_2026-08.pgn.zst` → `2026-08`, or null. */
export function monthOf(file) {
  const match = MONTH.exec(file);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * @param {object} input
 * @param {readonly string[]} input.upstream  every file the publisher's digest list names
 * @param {readonly string[]} input.live      the live pack's upstream files (empty when none is live)
 * @param {number} input.liveVersion          the live pack's version (0 when none is live)
 * @param {number} [input.span]               months in the window
 * @returns {{ rebuild: boolean, reason: string, files: string[], months: string[], version: number }}
 */
export function planMonthly({ upstream, live, liveVersion, span = 6 }) {
  const published = [...new Set(upstream.filter((file) => monthOf(file) !== null))]
    .sort()
    .reverse();
  const files = published.slice(0, span);
  const months = files.map(monthOf);
  const liveMonths = live.map(monthOf).filter(Boolean).sort().reverse();
  if (files.length < span) {
    return {
      rebuild: false,
      reason: `the publisher lists ${files.length} month(s); a window needs ${span}`,
      files,
      months,
      version: liveVersion,
    };
  }
  if (liveMonths.length === 0) {
    return {
      rebuild: true,
      reason: 'nothing is live yet',
      files,
      months,
      version: liveVersion + 1,
    };
  }
  const newest = months[0];
  const liveNewest = liveMonths[0];
  if (newest <= liveNewest) {
    return {
      rebuild: false,
      reason: `the live pack already ends on ${liveNewest}, the newest month published`,
      files,
      months,
      version: liveVersion,
    };
  }
  return {
    rebuild: true,
    reason: `${newest} is published and the live pack ends on ${liveNewest}`,
    files,
    months,
    version: liveVersion + 1,
  };
}

/**
 * The channel file: the one mutable file on the mirror. Everything it points
 * at is an immutable version directory; moving it backwards is refused.
 */
export function channelFor({ id, version, directory, months, builtAt, previous }) {
  if (previous && Number(previous.version) >= Number(version)) {
    throw new Error(
      `The channel for ${id} is at version ${previous.version}; version ${version} would move it backwards.`,
    );
  }
  if (previous && previous.id !== id) {
    throw new Error(`The channel names ${previous.id}, not ${id}.`);
  }
  return {
    format: 'kingfisher-channel/1',
    id,
    version: String(version),
    manifest: `${directory}/manifest.json`,
    months,
    builtAt,
  };
}
