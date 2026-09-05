/**
 * Installing an engine from Kingfisher, rather than from a terminal.
 *
 * Everything in the catalogue is fetched from the engine project's own release
 * page, checked against a digest recorded in the repository, made executable,
 * and then *interrogated* — the binary has to complete a UCI handshake and
 * find a move before it is registered. A download that fails any of those is
 * deleted rather than left on disk, so nothing half-installed can later be
 * mistaken for an engine.
 *
 * The trust boundary is unchanged and stated plainly in `docs/ENGINES.md`: a
 * managed engine is a native program running with the same operating-system
 * permissions as anything else the user launches. Kingfisher verifies where it
 * came from and that it is what it says it is. It does not sandbox it, and
 * does not claim to.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
  readdirSync,
  rmdirSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { verifyEngine } from './engine-verify.mjs';
import { compatibleAsset, cpuFeatures } from './cpu.mjs';

const run = promisify(execFile);

export class ManagedEngines {
  /**
   * In-flight installs, so the browser can show progress and a second click
   * cannot start a second download of the same engine.
   *
   * Per instance rather than per module: two `ManagedEngines` are two
   * installation states, and sharing one map between them would make a test —
   * or a second companion in the same process — see the other's downloads.
   */
  #inFlight = new Map();

  #catalogue;
  #digests;
  #platform;
  #engineDir;
  #recordFile;
  #registry;
  #records = new Map();
  #features;

  constructor({
    catalogue,
    digests,
    platform,
    engineDir,
    recordFile,
    registry,
    features = cpuFeatures(),
  }) {
    this.#catalogue = catalogue;
    this.#digests = digests;
    this.#platform = platform;
    this.#engineDir = engineDir;
    this.#recordFile = recordFile;
    this.#registry = registry;
    this.#features = features;
  }

  /**
   * Re-register everything installed in an earlier run.
   *
   * Re-validated against the filesystem exactly like custom engines and SQLite
   * collections: a binary that was deleted, or lived on removable media, is
   * dropped rather than left as a dead entry that fails the moment somebody
   * tries to analyse with it.
   */
  load() {
    if (!existsSync(this.#recordFile)) return;
    let stored;
    try {
      stored = JSON.parse(readFileSync(this.#recordFile, 'utf8'));
    } catch {
      return; // A corrupt record is not a reason to refuse to start.
    }
    for (const record of stored.engines ?? []) {
      if (!record.binary || !existsSync(record.binary)) continue;
      if (
        record.binarySha256 &&
        createHash('sha256').update(readFileSync(record.binary)).digest('hex') !==
          record.binarySha256
      )
        continue;
      this.#records.set(record.id, record);
      this.#registry.register(record.id, record.binary, {
        // Carried so `/status` can report what the engine was *measured* to
        // do rather than what the browser would otherwise have to assume.
        capabilities: record.capabilities,
        name: record.name,
        version: record.version,
        args: record.args ?? [],
        cwd: path.dirname(record.binary),
        license: record.license,
        managed: true,
      });
    }
  }

  #save() {
    mkdirSync(path.dirname(this.#recordFile), { recursive: true });
    const temporary = `${this.#recordFile}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify({ version: 1, engines: [...this.#records.values()] }, null, 2)}\n`,
    );
    renameSync(temporary, this.#recordFile);
  }

  /**
   * The catalogue as this machine sees it: what is offered, and what is on disk.
   *
   * The browser engine is in the shared catalogue because that file is the one
   * list of every engine Kingfisher knows, but it is not something a companion
   * can install, locate, run or remove — it ships inside the application and
   * Settings → Engines already shows it as its own row. Returning it here put
   * a second Stockfish in that list, permanently marked unavailable.
   */
  list() {
    return this.#catalogue
      .filter((entry) => entry.kind !== 'wasm')
      .map((entry) => {
        const published = entry.assets?.[this.#platform];
        const asset =
          entry.kind === 'binary' ? compatibleAsset(entry, this.#platform, this.#features) : {};
        const record = this.#records.get(entry.id) ?? null;
        const progress = this.#inFlight.get(entry.id) ?? null;
        const sha256 = asset && entry.kind === 'binary' ? (this.#digests[asset.url] ?? null) : null;
        return {
          id: entry.id,
          name: entry.name,
          version: entry.version ?? null,
          family: entry.family,
          kind: entry.kind,
          license: entry.license,
          source: entry.source,
          notes: entry.notes,
          /*
          Three separate reasons a row may not offer an Install button, kept
          apart because they need different words on screen: this platform has
          no build, the project ships no build for anyone to download, or the
          digest was never recorded so Kingfisher will not fetch it.
        */
          available:
            entry.kind === 'binary' ? asset !== null && sha256 !== null : entry.kind === 'system',
          unavailableReason:
            entry.kind === 'binary' && asset === null
              ? published
                ? `This build requires CPU features not confirmed on this machine: ${(published.requires ?? []).join(', ')}.`
                : `No ${this.#platform} build is published for ${entry.name}.`
              : entry.kind === 'binary' && !sha256
                ? 'No verified digest is recorded for this download.'
                : null,
          installHint: entry.kind === 'system' ? (entry.install?.[this.#platform] ?? null) : null,
          downloadUrl: asset?.url ?? null,
          sha256,
          installed: record !== null,
          installing: progress !== null,
          progress,
          record,
        };
      });
  }

  status(id) {
    return this.list().find((row) => row.id === id) ?? null;
  }

  progress(id) {
    return this.#inFlight.get(id) ?? null;
  }

  /**
   * Download, verify, test and register one catalogue engine.
   *
   * Deliberately sequential and deliberately fussy. Every failure removes what
   * it wrote; the only way out of this function with a registered engine is
   * through the digest check *and* the UCI verification.
   */
  async install(id) {
    if (this.#inFlight.has(id)) throw new Error(`${id} is already installing.`);
    const entry = this.#catalogue.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Unknown engine: ${id}`);
    if (entry.kind === 'wasm') {
      throw new Error('The browser engine ships with Kingfisher and is not installed separately.');
    }

    const state = { id, phase: 'starting', bytes: 0, total: 0, message: '' };
    this.#inFlight.set(id, state);
    try {
      const binary =
        entry.kind === 'system' ? await this.#locate(entry) : await this.#download(entry, state);

      state.phase = 'verifying';
      state.message = 'Checking that it speaks UCI…';
      /*
        Two ways this fails and both must clean up. `verifyEngine` throws when
        the process cannot be talked to at all — an executable that is not an
        engine exits immediately, which is the case a downloaded file most
        plausibly is — and returns a report with failed checks when it talks
        but cannot search. Either way the download is deleted: a binary on disk
        that a later run might mistake for an installed engine is the one
        outcome worth going out of the way to prevent.
      */
      let report;
      try {
        report = await verifyEngine(binary, { cwd: path.dirname(binary) });
      } catch (error) {
        this.#discard(entry, state);
        throw new Error(
          `${entry.name} did not pass its UCI check: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (!report.checks.handshake?.ok || !report.checks.search?.ok) {
        this.#discard(entry, state);
        throw new Error(
          `${entry.name} did not pass its UCI check: ${
            report.checks.search?.error ?? 'it could not find a move.'
          }`,
        );
      }

      const record = {
        id: entry.id,
        name: entry.name,
        reportedName: report.name,
        author: report.author,
        version: entry.version ?? null,
        license: entry.license,
        source: entry.source,
        binary,
        managed: entry.kind === 'binary',
        installedAt: Date.now(),
        sha256: state.sha256 ?? null,
        binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'),
        platform: this.#platform,
        cpuFeatures: this.#features,
        options: report.options,
        optionLines: report.optionLines ?? [],
        verifiedAt: report.verifiedAt,
        capabilities: report.capabilities,
        checks: report.checks,
      };
      this.#records.set(id, record);
      this.#save();
      this.#registry.register(id, binary, {
        capabilities: report.capabilities,
        name: entry.name,
        version: entry.version,
        args: [],
        cwd: path.dirname(binary),
        license: entry.license,
        managed: true,
      });
      state.phase = 'done';
      return record;
    } catch (error) {
      this.#discard(entry, state);
      throw error;
    } finally {
      // Kept for one beat so a poll immediately after completion still sees
      // the terminal phase rather than nothing at all.
      setTimeout(() => this.#inFlight.delete(id), 2_000).unref?.();
    }
  }

  /** Remove what an install wrote, when it wrote anything. */
  #discard(entry, state) {
    if (entry.kind !== 'binary' || !state.directory) return;
    // Only the new staging directory. A failed update never removes the old engine.
    rmSync(state.directory, { recursive: true, force: true });
    const base = path.dirname(state.directory);
    if (existsSync(base) && readdirSync(base).length === 0) rmdirSync(base);
  }

  async #locate(entry) {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    for (const command of entry.commands ?? []) {
      try {
        const { stdout } = await run(finder, [command]);
        const found = stdout.split(/\r?\n/)[0]?.trim();
        if (found && existsSync(found)) return found;
      } catch {
        // Not on the path.
      }
    }
    throw new Error(
      entry.install?.[this.#platform]
        ? `${entry.name} is not on this machine. Install it with: ${entry.install[this.#platform]}`
        : `${entry.name} is not on this machine.`,
    );
  }

  async #download(entry, state) {
    const asset = compatibleAsset(entry, this.#platform, this.#features);
    if (!asset)
      throw new Error(
        this.status(entry.id)?.unavailableReason ??
          `No compatible ${this.#platform} build is published for ${entry.name}.`,
      );
    const expected = this.#digests[asset.url];
    if (!expected) {
      throw new Error(
        `Kingfisher has no recorded digest for ${entry.name} on ${this.#platform}, and will ` +
          'not install a download it cannot verify.',
      );
    }

    state.phase = 'downloading';
    state.message = `Downloading ${asset.url.split('/').pop()}`;
    const response = await fetch(asset.url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`${entry.name}: the download failed (HTTP ${response.status}).`);
    }
    state.total = Number(response.headers.get('content-length') ?? 0);

    const chunks = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
      state.bytes += chunk.length;
      if (state.bytes > 512 * 1024 * 1024)
        throw new Error('Engine download exceeds the 512 MiB safety limit.');
    }
    const bytes = Buffer.concat(chunks);

    state.phase = 'checking';
    state.message = 'Checking the download against its recorded digest…';
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== expected) {
      throw new Error(
        `${entry.name}: the download does not match its recorded digest. Nothing was installed.`,
      );
    }
    state.sha256 = digest;
    const base = path.join(this.#engineDir, entry.id);
    mkdirSync(base, { recursive: true });
    const target = mkdtempSync(path.join(base, 'verified-install-'));
    state.directory = target;
    const archiveType = asset.archive ?? entry.archive;

    if (archiveType === 'tar' || archiveType === 'zip') {
      const archive = path.join(target, `download.${archiveType}`);
      writeFileSync(archive, bytes);
      // `tar` with an explicit member and directory; no shell, no wildcards.
      // Windows' bundled bsdtar reads ZIP too. Unix uses unzip for ZIP members.
      if (archiveType === 'zip' && process.platform !== 'win32')
        await run('unzip', ['-q', archive, asset.file, '-d', target]);
      else await run('tar', ['-xf', archive, '-C', target, asset.file]);
      rmSync(archive, { force: true });
      const extracted = path.join(target, asset.file);
      if (!existsSync(extracted)) {
        rmSync(target, { recursive: true, force: true });
        throw new Error(`${entry.name}: the archive did not contain ${asset.file}.`);
      }
      chmodSync(extracted, 0o755);
      return extracted;
    }

    const binary = path.join(target, asset.file);
    writeFileSync(binary, bytes);
    chmodSync(binary, 0o755);
    return binary;
  }

  /** Remove a managed engine and everything its install wrote. */
  uninstall(id) {
    if (this.#inFlight.has(id))
      throw new Error('Wait for this engine installation to finish before removing it.');
    const record = this.#records.get(id);
    if (!record) return false;
    this.#records.delete(id);
    this.#registry.delete(id);
    if (record.managed) {
      rmSync(path.join(this.#engineDir, id), { recursive: true, force: true });
    }
    this.#save();
    return true;
  }
}
