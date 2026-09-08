/**
 * The address Kingfisher's own work lives at, and why it may not move.
 *
 * ## The defect this exists for
 *
 * The desktop shell serves the application over loopback and, until Phase 22,
 * took a **fresh free port every launch**. A browser partitions IndexedDB and
 * `localStorage` by *origin*, and an origin includes the port — so
 * `http://127.0.0.1:56531` and `http://127.0.0.1:56566` are two different
 * machines as far as storage is concerned.
 *
 * Every quit and relaunch therefore threw away every study, repertoire, note,
 * review and preference the user had. Measured rather than reasoned about: one
 * study written, the application closed and reopened, zero studies read back,
 * and two directories left behind in the profile —
 *
 *     IndexedDB/http_127.0.0.1_56531.indexeddb.leveldb
 *     IndexedDB/http_127.0.0.1_56566.indexeddb.leveldb
 *
 * Nothing in the browser suite could see it: a browser's origin is stable, so
 * every persistence test passed and always would. Nothing in the desktop smoke
 * saw it either, because the smoke had never quit the application and started
 * it again with the same profile and then looked for the data.
 *
 * ## The rule
 *
 * **The port is a property of the profile, not of the launch.** It is chosen
 * once, written down beside the data it addresses, and used again for as long
 * as that data exists.
 *
 * ## What happens when it is taken
 *
 * It fails, loudly, naming the port. That is deliberate and it is the whole
 * design: the alternative — quietly taking a different port — is exactly the
 * bug above, and a silent restart with an empty workspace is far worse for a
 * person than a message saying which port to free. Kingfisher already holds a
 * single-instance lock, so a busy port is always some *other* program.
 *
 * The first choice is scanned from a small fixed band rather than taken from
 * the ephemeral range. An ephemeral port is exactly what every other program on
 * the machine grabs transiently, so recording one would make the collision
 * above likely rather than rare.
 *
 * ## Adopting what is already there
 *
 * A profile written by an earlier build has data at whatever port that launch
 * happened to get, and no record of it. Rather than stranding it, a profile
 * with no `origin.json` is asked what it already holds: the IndexedDB directory
 * names its origins, and the most recently written one is the workspace the
 * user last used. That turns "your work is gone" into "your work is still
 * here" for every profile created before this file existed.
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where the first choice comes from.
 *
 * Ninety ports, above the registered range and below the ephemeral one, so a
 * fresh profile almost always gets the first and a machine already running
 * something there quietly gets the next.
 */
export const PORT_BAND = { first: 43110, last: 43199 };

const RECORD = 'origin.json';

/** Names Chromium gives an origin's IndexedDB directory. */
const IDB_ORIGIN = /^http_127\.0\.0\.1_(\d{2,5})\.indexeddb\.leveldb$/;

/** Is this port free to listen on, right now, for us? */
export function portFree(host, port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/**
 * The port a profile's existing data is addressed by, if any.
 *
 * Exported because it is the interesting half and deserves its own test: a
 * profile with three abandoned origins in it has to produce the newest, not
 * the first one `readdir` happens to return.
 */
export function adoptedPort(userData) {
  const directory = path.join(userData, 'IndexedDB');
  if (!existsSync(directory)) return null;
  let best = null;
  for (const entry of readdirSync(directory)) {
    const match = IDB_ORIGIN.exec(entry);
    if (!match) continue;
    const port = Number(match[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) continue;
    let at = 0;
    try {
      at = statSync(path.join(directory, entry)).mtimeMs;
    } catch {
      continue;
    }
    if (!best || at > best.at) best = { port, at };
  }
  return best?.port ?? null;
}

const recordPath = (userData) => path.join(userData, RECORD);

function readRecord(userData) {
  try {
    const value = JSON.parse(readFileSync(recordPath(userData), 'utf8'));
    const port = Number(value?.port);
    return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null;
  } catch {
    return null;
  }
}

function writeRecord(userData, port) {
  try {
    mkdirSync(userData, { recursive: true });
    writeFileSync(recordPath(userData), `${JSON.stringify({ port }, null, 2)}\n`);
  } catch {
    /*
      A profile that cannot be written to is a problem, and not this one's to
      report: the application is about to fail on its own data directory in a
      far more legible way. What must not happen is the launch dying here and
      blaming the port.
    */
  }
}

/**
 * Raised when the profile's port is held by something else.
 *
 * A distinct type so the shell can say the one useful sentence — which port,
 * and that the work is at that port rather than lost — instead of showing a
 * generic listen failure.
 */
export class PortUnavailableError extends Error {
  constructor(port) {
    super(
      `Kingfisher keeps your studies, repertoires and settings under ` +
        `http://127.0.0.1:${port}, and another program is using that port.\n\n` +
        `Your work is safe and still there. Close whatever is using port ${port} ` +
        `and open Kingfisher again.`,
    );
    this.name = 'PortUnavailableError';
    this.port = port;
  }
}

/**
 * The port this profile is served on.
 *
 * @param {string} userData          the application-support directory
 * @param {(host: string, port: number) => Promise<boolean>} [free] test seam
 * @param {string} [host]
 */
export async function resolveAppPort(userData, free = portFree, host = '127.0.0.1') {
  const recorded = readRecord(userData) ?? adoptedPort(userData);
  if (recorded !== null) {
    if (!(await free(host, recorded))) throw new PortUnavailableError(recorded);
    writeRecord(userData, recorded);
    return recorded;
  }

  for (let port = PORT_BAND.first; port <= PORT_BAND.last; port += 1) {
    if (await free(host, port)) {
      writeRecord(userData, port);
      return port;
    }
  }

  /*
    Ninety ports all busy is not a real machine, but a shell that refused to
    start over it would be choosing to fail where it could still work. An
    ephemeral port is recorded like any other, so the profile stays coherent
    from here on even in this case.
  */
  const ephemeral = await new Promise((resolve) => {
    const server = createServer();
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
  writeRecord(userData, ephemeral);
  return ephemeral;
}
