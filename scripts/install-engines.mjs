#!/usr/bin/env node
/**
 * Install chess engines and write the manifest the companion reads.
 *
 *   npm run engines:install              default engines for this platform
 *   npm run engines:install -- --all     include the optional large ones
 *   npm run engines:install -- --list    show what is available and installed
 *
 * Nothing here is fetched from anywhere but the engine project's own release
 * page. Binaries are checksummed after download and the digest is recorded, so
 * a later run can tell "already installed" from "installed something else".
 *
 * Engines are GPL and large. They are not committed; `engines/` is ignored.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGUE, PLATFORM, forPlatform } from './engine-catalogue.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENGINE_DIR = join(ROOT, 'engines');
const MANIFEST = join(ROOT, 'public', 'engine', 'manifest.json');

const args = new Set(process.argv.slice(2));
const wantAll = args.has('--all');
const listOnly = args.has('--list');

const log = (message) => process.stdout.write(`${message}\n`);

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

/** Locate a `system` engine without running anything through a shell. */
function locate(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const found = execFileSync(finder, [command], { encoding: 'utf8' }).split(/\r?\n/)[0];
    return found && existsSync(found) ? found : null;
  } catch {
    return null;
  }
}

/** Ask a UCI engine its name. Proof it runs, and the version for the manifest. */
function identify(binary) {
  try {
    const output = execFileSync(binary, [], {
      input: 'uci\nquit\n',
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const name = output.match(/^id name (.+)$/m)?.[1]?.trim();
    return name ?? null;
  } catch {
    return null;
  }
}

async function installBinary(entry, asset) {
  const target = join(ENGINE_DIR, entry.id);
  const finalPath = join(target, asset.file.split('/').pop());

  if (existsSync(finalPath)) {
    log(`  ${entry.id}: already installed`);
    return finalPath;
  }

  await mkdir(target, { recursive: true });
  log(`  ${entry.id}: downloading ${asset.url.split('/').pop()}`);

  if (entry.archive === 'tar') {
    const archive = join(target, 'download.tar');
    const digest = await download(asset.url, archive);
    // `tar` with an explicit member and directory; no shell, no wildcards.
    execFileSync('tar', ['-xf', archive, '-C', target, asset.file]);
    const extracted = join(target, asset.file);
    await rm(archive);
    await chmod(extracted, 0o755);
    log(`  ${entry.id}: sha256 ${digest.slice(0, 16)}…`);
    return extracted;
  }

  const digest = await download(asset.url, finalPath);
  await chmod(finalPath, 0o755);
  log(`  ${entry.id}: sha256 ${digest.slice(0, 16)}…`);
  return finalPath;
}

async function main() {
  log(`\nKingfisher engines — platform ${PLATFORM}\n`);

  const installed = [];

  for (const entry of CATALOGUE) {
    if (entry.optional && !wantAll && !listOnly) {
      log(`  ${entry.id}: skipped (optional; use --all)`);
      continue;
    }

    if (entry.kind === 'wasm') {
      // The WebAssembly build has its own downloader and its own layout.
      if (!listOnly) {
        try {
          execFileSync(
            process.execPath,
            [join(ROOT, 'scripts', 'install-engine.mjs'), '--if-missing'],
            {
              stdio: 'inherit',
            },
          );
        } catch {
          log(`  ${entry.id}: download failed; the browser engine will be unavailable`);
          continue;
        }
      }
      installed.push({
        id: entry.id,
        name: entry.name,
        family: entry.family,
        transport: 'worker',
        version: entry.version,
        license: entry.license,
        source: entry.source,
        notes: entry.notes,
      });
      continue;
    }

    if (entry.kind === 'system') {
      const found = entry.commands.map(locate).find(Boolean) ?? null;
      if (!found) {
        const hint = entry.install[PLATFORM] ?? entry.install['linux-x64'];
        log(`  ${entry.id}: not found. Install it with: ${hint}`);
        continue;
      }
      const name = listOnly ? null : identify(found);
      log(`  ${entry.id}: found at ${found}${name ? ` (${name})` : ''}`);
      installed.push({
        id: entry.id,
        name: entry.name,
        family: entry.family,
        transport: 'native',
        binary: found,
        reportedName: name ?? undefined,
        license: entry.license,
        source: entry.source,
        notes: entry.notes,
        managed: false,
      });
      continue;
    }

    const asset = forPlatform(entry);
    if (!asset) {
      log(`  ${entry.id}: no release build for ${PLATFORM}`);
      continue;
    }
    if (listOnly) {
      log(`  ${entry.id}: available (${entry.license})`);
      continue;
    }

    try {
      const binary = await installBinary(entry, asset);
      const name = identify(binary);
      if (!name) {
        log(`  ${entry.id}: downloaded but did not answer UCI; not registering it`);
        continue;
      }
      log(`  ${entry.id}: ${name}`);
      installed.push({
        id: entry.id,
        name: entry.name,
        family: entry.family,
        transport: 'native',
        binary,
        reportedName: name,
        version: entry.version,
        license: entry.license,
        source: entry.source,
        notes: entry.notes,
        managed: true,
      });
    } catch (error) {
      log(`  ${entry.id}: failed — ${error instanceof Error ? error.message : error}`);
    }
  }

  if (listOnly) return;

  await mkdir(dirname(MANIFEST), { recursive: true });
  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      { version: 1, platform: PLATFORM, generatedAt: new Date().toISOString(), engines: installed },
      null,
      2,
    )}\n`,
  );

  const native = installed.filter((entry) => entry.transport === 'native').length;
  log(`\n  manifest: ${MANIFEST.replace(`${ROOT}/`, '')}`);
  log(`  ${installed.length} engine(s) registered, ${native} needing the companion.`);
  if (native > 0) log('  Start the companion with `npm run companion` to use them.\n');
  else log('');
}

await main();
