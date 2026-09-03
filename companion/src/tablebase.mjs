/**
 * Local Syzygy tablebases.
 *
 * Two jobs, and it is worth being precise about which is which, because the
 * split is the whole design.
 *
 * **Capability is answered from the files.** Pointed at a directory, this
 * reads the Syzygy filenames — `KQvKR.rtbw`, `KRPvKR.rtbz` and so on — and
 * derives exactly which material configurations are present and therefore what
 * the real piece limit is. That is not a guess and not a setting: a user who
 * has downloaded five-piece tables but not six gets told five, and a user
 * whose directory is missing `.rtbz` files gets told that DTZ is unavailable
 * even though WDL is. Kingfisher can then decide whether a position is
 * answerable locally *before* asking.
 *
 * **Probing is delegated.** Kingfisher does not implement Syzygy
 * decompression. That is several thousand lines of Huffman-coded table
 * decoding whose failure mode is a silently wrong endgame assessment — the
 * worst possible bug in a tool whose entire claim is that a tablebase result
 * is proof rather than opinion. Instead the companion forwards the probe to a
 * local tablebase server (the `lila-tablebase` API shape, which is the
 * standard self-hosted option and identical to the public endpoint's), so the
 * answer comes from an implementation that is already trusted with it.
 *
 * The result: a user with tables and a local server gets local answers with
 * local provenance; a user with tables and no server gets told exactly that,
 * rather than getting a wrong answer or a silent fallback.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Syzygy WDL and DTZ table extensions, for standard chess. */
const WDL_EXTENSIONS = new Set(['.rtbw']);
const DTZ_EXTENSIONS = new Set(['.rtbz']);

/**
 * Read a Syzygy filename into the material it covers.
 *
 * `KQvKR` is four pieces plus the two kings — the count is simply the number
 * of piece letters, since both kings are always named. A filename that does
 * not match the shape is ignored rather than guessed at.
 */
export function parseSyzygyName(name) {
  const base = path.basename(name, path.extname(name));
  if (!/^K[QRBNP]*vK[QRBNP]*$/.test(base)) return null;
  return { material: base, pieces: base.replace(/v/g, '').length };
}

/**
 * What is actually in the configured directory.
 *
 * Reports per piece-count what is present, because "I have six-piece tables"
 * is almost never true of a directory that has *some* six-piece files: the
 * complete set is
 * hundreds of files, and a partial set answers some positions and not others.
 * So the limit reported is the largest count for which at least one table
 * exists, and the material list is returned so the user can see what they
 * really have.
 */
export function scanTablebaseDirectory(directory) {
  if (!directory) {
    return { configured: false, path: null, exists: false, maxPieces: 0, wdl: [], dtz: [] };
  }
  let entries;
  try {
    const stats = statSync(directory);
    if (!stats.isDirectory()) {
      return {
        configured: true,
        path: directory,
        exists: false,
        error: 'That path is not a directory.',
        maxPieces: 0,
        wdl: [],
        dtz: [],
      };
    }
    entries = readdirSync(directory);
  } catch (error) {
    return {
      configured: true,
      path: directory,
      exists: false,
      error: error instanceof Error ? error.message : 'The directory could not be read.',
      maxPieces: 0,
      wdl: [],
      dtz: [],
    };
  }

  const wdl = new Set();
  const dtz = new Set();
  for (const entry of entries) {
    const extension = path.extname(entry).toLowerCase();
    const parsed = parseSyzygyName(entry);
    if (!parsed) continue;
    if (WDL_EXTENSIONS.has(extension)) wdl.add(parsed.material);
    if (DTZ_EXTENSIONS.has(extension)) dtz.add(parsed.material);
  }

  const counts = [...wdl].map((material) => material.replace(/v/g, '').length);
  return {
    configured: true,
    path: directory,
    exists: true,
    // The largest count with any table present. Partial sets are why the
    // material lists are returned as well as this number.
    maxPieces: counts.length ? Math.max(...counts) : 0,
    wdl: [...wdl].sort(),
    dtz: [...dtz].sort(),
  };
}

/**
 * Probe a local tablebase server.
 *
 * The `lila-tablebase` response shape, which is also what the public Lichess
 * endpoint returns, so the client parses one format regardless of where the
 * answer came from. Failures are returned rather than thrown: a local server
 * that is not running is a normal condition, and the caller's next step is to
 * fall back with the provenance changed, not to show an error.
 */
export async function probeLocalTablebase(endpoint, fen, timeoutMs = 4000) {
  if (!endpoint) return { ok: false, reason: 'No local tablebase server configured.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL('/standard', endpoint);
    url.searchParams.set('fen', fen);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: `The local tablebase server answered ${response.status}.` };
    }
    return { ok: true, result: await response.json() };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The local tablebase server did not answer in time.'
          : 'The local tablebase server could not be reached.',
    };
  } finally {
    clearTimeout(timer);
  }
}
