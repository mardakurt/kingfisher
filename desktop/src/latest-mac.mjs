/**
 * Parser and validator for the `latest-mac.yml` file electron-builder
 * produces alongside the macOS auto-update ZIP.
 *
 * The format is the one electron-updater fetches from the
 * `publish.provider: github` target at packaging time. It is the
 * same shape whether the feed is the public GitHub release, a
 * private mirror, or a local staging server — the test suite
 * exercises the parser against the staging variant to certify the
 * update engine.
 *
 * Why a separate module from `update-protocol.mjs`: that file
 * validates the *human-readable* Kingfisher release manifest. The
 * two are different artifacts with different fields, different
 * fields, and different guards. Conflating them would force every
 * change in one to be reflected in the other, which is exactly the
 * kind of coupling that lets a manifest field drift.
 */

/**
 * @typedef {Object} MacUpdateFile
 * @property {string} url
 * @property {string} sha512  base64-encoded SHA-512
 * @property {number} size    bytes
 * @property {string} [name]
 * @property {string} [path]
 * @property {'arm64'|'x64'} [arch]
 *
 * @typedef {Object} MacUpdateInfo
 * @property {string} version
 * @property {MacUpdateFile[]} files
 * @property {string} [path]
 * @property {string} [sha512]
 * @property {number} [size]
 * @property {string} [releaseDate]
 * @property {string} [releaseName]
 * @property {string} [releaseNotes]
 */

/**
 * Parse and validate a `latest-mac.yml` body. Returns either a
 * `MacUpdateInfo` or a `reason` string explaining why the body is
 * not a usable update record. The caller turns the failure into an
 * "unable to check" verdict.
 *
 * @param {unknown} body
 * @returns {{ ok: true, info: MacUpdateInfo } | { ok: false, reason: string }}
 */
export function parseLatestMac(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'Update feed is not an object.' };
  }
  const root = /** @type {Record<string, unknown>} */ (body);
  const version = root['version'];
  if (typeof version !== 'string' || !isSemverTriple(version)) {
    return { ok: false, reason: `Update feed version "${String(version)}" is not a semver triple.` };
  }
  const files = root['files'];
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, reason: 'Update feed has no files.' };
  }
  const parsedFiles = [];
  for (const entry of files) {
    const f = parseFileEntry(entry);
    if (f) parsedFiles.push(f);
  }
  if (parsedFiles.length === 0) {
    return { ok: false, reason: 'Update feed has no parseable file entries.' };
  }
  return {
    ok: true,
    info: {
      version,
      files: parsedFiles,
      path: stringOrUndefined(root['path']),
      sha512: stringOrUndefined(root['sha512']),
      size: numberOrUndefined(root['size']),
      releaseDate: stringOrUndefined(root['releaseDate']),
      releaseName: stringOrUndefined(root['releaseName']),
      releaseNotes: stringOrUndefined(root['releaseNotes']),
    },
  };
}

function parseFileEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const root = /** @type {Record<string, unknown>} */ (entry);
  const url = root['url'];
  if (typeof url !== 'string' || !isHttpUrl(url)) return null;
  const sha512 = root['sha512'];
  if (typeof sha512 !== 'string' || !/^[A-Za-z0-9+/=]{64,}$/.test(sha512)) return null;
  const size = root['size'];
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null;
  return {
    url,
    sha512,
    size,
    name: stringOrUndefined(root['name']),
    path: stringOrUndefined(root['path']),
    arch: root['arch'] === 'arm64' || root['arch'] === 'x64' ? root['arch'] : undefined,
  };
}

function stringOrUndefined(value) {
  return typeof value === 'string' ? value : undefined;
}

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('https://')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSemverTriple(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return Boolean(m);
}
