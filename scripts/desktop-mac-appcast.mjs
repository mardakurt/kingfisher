#!/usr/bin/env node
/**
 * `npm run release:mac:appcast` — write the Sparkle feed for a built release.
 *
 * Sparkle finds an update by reading an **appcast**: an RSS document whose
 * items name a version, the archive to download, its length and its EdDSA
 * signature. This script produces one for the ZIP `desktop:dist` made, with
 * Sparkle's own `generate_appcast`, so the signature, the
 * `sparkle:version` (the build number, `CFBundleVersion`), the
 * `sparkle:shortVersionString` (the marketing version) and the minimum
 * macOS are read from the bundle itself rather than typed here.
 *
 *   appcast.xml        the feed. Uploaded to the release by
 *                      `release:mac:publish`; `SUFeedURL` in every installed
 *                      Kingfisher is `…/releases/latest/download/appcast.xml`,
 *                      which GitHub redirects to the newest stable release's
 *                      copy — so each release carries the feed that offers
 *                      it, and a preview (a pre-release) is never offered.
 *   <version>.html     the release notes Sparkle shows beside the update,
 *                      rendered from CHANGELOG.md's entry for this version.
 *   latest-mac.yml     the *previous* engine's feed, for the installed
 *                      1.1.0–1.1.6, which still ask electron-updater's
 *                      question. Written for as long as those exist; the
 *                      ZIP is the same bytes, named with its SHA-512.
 *
 * The private key is the maintainer's, in the login keychain under the
 * `kingfisher` account (`desktop/sparkle.json` explains); `--ed-key-file`
 * passes a file instead, for the staging harnesses' throwaway keys. The
 * public half in `Info.plist` is what an installed Kingfisher checks
 * against, so a feed signed with any other key is refused by every copy
 * out there — that refusal is the point.
 *
 * Usage:
 *   node scripts/desktop-mac-appcast.mjs [--zip <file>] [--out <dir>]
 *     [--download-url-prefix <url>] [--ed-key-file <file>] [--account <name>]
 *     [--notes <file.md|file.html>] [--no-latest-mac]
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS, isVendored } from '../desktop/scripts/fetch-sparkle.mjs';
import { plistValue } from '../desktop/src/sparkle-bundle.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DEFAULT = path.resolve(
  process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist'),
);
export const SPARKLE_KEYCHAIN_ACCOUNT = 'kingfisher';

/** The ZIP's marketing version, from its name. */
export function versionOfArchive(name) {
  return (
    /^Kingfisher-(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)-arm64\.zip$/.exec(path.basename(name))?.[1] ??
    null
  );
}

/**
 * The CHANGELOG entry for a version, as HTML Sparkle can show.
 *
 * The changelog is written for people: a `## <version> — <date>` heading,
 * paragraphs, and bullets with bold leads, links and inline code. That
 * subset is rendered here — nothing is executed, every character of text
 * is escaped, and anything the renderer does not recognise is a paragraph.
 */
export function releaseNotesHtml(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) =>
    new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`).test(line),
  );
  if (start === -1) return null;
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end);
  const escape = (text) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (text) => {
    let html = '';
    let rest = text;
    const token = /(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/;
    while (rest.length) {
      const match = token.exec(rest);
      if (!match) {
        html += escape(rest);
        break;
      }
      html += escape(rest.slice(0, match.index));
      const found = match[0];
      if (found.startsWith('`')) html += `<code>${escape(found.slice(1, -1))}</code>`;
      else if (found.startsWith('**')) html += `<strong>${escape(found.slice(2, -2))}</strong>`;
      else if (found.startsWith('_')) html += `<em>${escape(found.slice(1, -1))}</em>`;
      else {
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(found);
        const href = /^https:\/\//.test(link[2]) ? link[2] : null;
        html += href ? `<a href="${escape(href)}">${escape(link[1])}</a>` : escape(link[1]);
      }
      rest = rest.slice(match.index + found.length);
    }
    return html;
  };
  const blocks = [];
  let paragraph = [];
  let items = [];
  const flush = () => {
    if (paragraph.length) blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
    if (items.length)
      blocks.push(
        `<ul>\n${items.map((item) => `  <li>${inline(item.join(' '))}</li>`).join('\n')}\n</ul>`,
      );
    items = [];
  };
  for (const raw of body) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^- /.test(line)) {
      if (paragraph.length) flush();
      items.push([line.slice(2).trim()]);
      continue;
    }
    if (/^\s{2,}\S/.test(line) && items.length) {
      items[items.length - 1].push(line.trim());
      continue;
    }
    if (/^### /.test(line)) {
      flush();
      blocks.push(`<h3>${inline(line.slice(4).trim())}</h3>`);
      continue;
    }
    if (items.length) flush();
    paragraph.push(line.trim());
  }
  flush();
  const heading = lines[start].replace(/^## /, '').trim();
  return `<h2>${inline(heading)}</h2>\n${blocks.join('\n')}\n`;
}

/** electron-updater's feed, for the installs that predate Sparkle. */
export function latestMacYml({ zipName, zipBytes, releaseDate }) {
  const sha512 = createHash('sha512').update(zipBytes).digest('base64');
  const version = versionOfArchive(zipName);
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${zipName}`,
    `    sha512: ${sha512}`,
    `    size: ${zipBytes.length}`,
    `path: ${zipName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');
}

/** What the generated feed says, for the log and the publish step. */
export function summarizeAppcast(xml) {
  const item = /<item>([\s\S]*?)<\/item>/.exec(xml)?.[1] ?? '';
  const pick = (re) => re.exec(item)?.[1] ?? null;
  return {
    items: (xml.match(/<item>/g) ?? []).length,
    title: pick(/<title>([^<]*)<\/title>/),
    version: pick(/<sparkle:version>([^<]*)<\/sparkle:version>/),
    shortVersion: pick(/<sparkle:shortVersionString>([^<]*)<\/sparkle:shortVersionString>/),
    minimumSystemVersion: pick(
      /<sparkle:minimumSystemVersion>([^<]*)<\/sparkle:minimumSystemVersion>/,
    ),
    url: pick(/<enclosure[^>]*\surl="([^"]+)"/),
    length: Number(pick(/<enclosure[^>]*\slength="(\d+)"/)),
    edSignature: pick(/<enclosure[^>]*\ssparkle:edSignature="([^"]+)"/),
    hasNotes: /<description>/.test(item),
  };
}

/**
 * Why a feed must not be published for a release, or null. Read by
 * `release:mac:publish` before uploading and by the mutation harness with
 * feeds deliberately made wrong: one item, the release's own archive on
 * the release host, the archive's exact length, a signature, the version.
 */
export function appcastMismatch(
  summary,
  { tag, version, zipSize, host = 'https://github.com/mardakurt/kingfisher' },
) {
  const expectedUrl = `${host}/releases/download/${tag}/Kingfisher-${version}-arm64.zip`;
  if (summary.items !== 1) return `expected one item, found ${summary.items}`;
  if (summary.url !== expectedUrl) return `names ${summary.url}, not ${expectedUrl}`;
  if (!/^https:\/\//.test(summary.url ?? '')) return `the enclosure is not https: ${summary.url}`;
  if (summary.length !== zipSize) return `length ${summary.length} is not the archive's ${zipSize}`;
  if (!summary.edSignature) return 'no sparkle:edSignature on the enclosure';
  if (!/^[A-Za-z0-9+/]{86}==$/.test(summary.edSignature))
    return 'sparkle:edSignature is not an Ed25519 signature';
  if (summary.shortVersion !== version) return `offers ${summary.shortVersion}, not ${version}`;
  if (!/^\d+$/.test(summary.version ?? ''))
    return `sparkle:version ${summary.version} is not a build number`;
  return null;
}

export function writeAppcast({
  zip,
  out = path.dirname(zip),
  downloadUrlPrefix,
  landing = 'https://kingfisherchess.app/',
  edKeyFile = null,
  account = SPARKLE_KEYCHAIN_ACCOUNT,
  notes = null,
  latestMac = true,
  log = console.log,
} = {}) {
  if (!isVendored())
    throw new Error('Sparkle is not vendored; run npm run desktop:sparkle:fetch first.');
  if (!existsSync(zip)) throw new Error(`No update archive at ${zip}`);
  const zipName = path.basename(zip);
  const version = versionOfArchive(zipName);
  if (!version)
    throw new Error(
      `${zipName} is not a Kingfisher update archive (Kingfisher-<version>-arm64.zip).`,
    );
  if (!downloadUrlPrefix)
    throw new Error('--download-url-prefix is required: the URL the ZIP will be served under.');
  const prefix = downloadUrlPrefix.endsWith('/') ? downloadUrlPrefix : `${downloadUrlPrefix}/`;

  // A staging directory: generate_appcast writes beside the archives and
  // moves what it considers old; it gets a copy of the one ZIP and nothing
  // it can rearrange.
  const staging = mkdtempSync(path.join(tmpdir(), 'kingfisher-appcast-'));
  try {
    copyFileSync(zip, path.join(staging, zipName));
    let notesFile = null;
    if (notes) {
      notesFile = path.join(staging, `${zipName.replace(/\.zip$/, '')}${path.extname(notes)}`);
      copyFileSync(notes, notesFile);
    } else {
      const html = releaseNotesHtml(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
      if (html) {
        notesFile = path.join(staging, `${zipName.replace(/\.zip$/, '')}.html`);
        writeFileSync(notesFile, html);
      } else {
        log(`no CHANGELOG.md entry for ${version}; the feed carries no release notes`);
      }
    }
    const args = [
      '--download-url-prefix',
      prefix,
      '--link',
      landing,
      '--maximum-versions',
      '1',
      '--maximum-deltas',
      '0',
      '--embed-release-notes',
      '-o',
      path.join(staging, 'appcast.xml'),
      ...(edKeyFile ? ['--ed-key-file', edKeyFile] : ['--account', account]),
      staging,
    ];
    log(`generate_appcast ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
    const generated = spawnSync(path.join(TOOLS, 'generate_appcast'), args, { encoding: 'utf8' });
    if (generated.status !== 0) {
      throw new Error(`generate_appcast failed:\n${generated.stdout}${generated.stderr}`);
    }
    if (generated.stdout.trim()) log(generated.stdout.trim());
    const appcastPath = path.join(staging, 'appcast.xml');
    if (!existsSync(appcastPath)) throw new Error('generate_appcast wrote no appcast.xml');
    const xml = readFileSync(appcastPath, 'utf8');
    const summary = summarizeAppcast(xml);
    if (summary.items !== 1)
      throw new Error(`expected one item in the appcast, found ${summary.items}`);
    if (summary.url !== `${prefix}${zipName}`) {
      throw new Error(`the appcast names ${summary.url}, not ${prefix}${zipName}`);
    }
    if (summary.length !== statSync(zip).size) {
      throw new Error(
        `the appcast's length ${summary.length} is not the ZIP's ${statSync(zip).size}`,
      );
    }
    if (!summary.edSignature) throw new Error('the appcast item carries no sparkle:edSignature');
    // Verify with sign_update, against the same key: the signature that was
    // just written must be the one the tool accepts.
    const verify = spawnSync(
      path.join(TOOLS, 'sign_update'),
      [
        '--verify',
        ...(edKeyFile ? ['--ed-key-file', edKeyFile] : ['--account', account]),
        zip,
        summary.edSignature,
      ],
      { encoding: 'utf8' },
    );
    if (verify.status !== 0) {
      throw new Error(
        `sign_update --verify refused the signature:\n${verify.stdout}${verify.stderr}`,
      );
    }
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'appcast.xml'), xml);
    log(`wrote ${path.join(out, 'appcast.xml')}`);
    if (notesFile && path.extname(notesFile) === '.html') {
      copyFileSync(notesFile, path.join(out, `${version}.html`));
    }
    if (latestMac) {
      const zipBytes = readFileSync(zip);
      writeFileSync(
        path.join(out, 'latest-mac.yml'),
        latestMacYml({ zipName, zipBytes, releaseDate: new Date().toISOString() }),
      );
      log(`wrote ${path.join(out, 'latest-mac.yml')} (for the installs that predate Sparkle)`);
    }
    return { appcast: path.join(out, 'appcast.xml'), summary, version };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Read the build's own plist values from the ZIP, for the log. */
export function describeArchive(zip) {
  const staging = mkdtempSync(path.join(tmpdir(), 'kingfisher-archive-'));
  try {
    execFileSync('ditto', ['-x', '-k', zip, staging]);
    const app = readdirSync(staging).find((name) => name.endsWith('.app'));
    if (!app) return null;
    const plist = path.join(staging, app, 'Contents', 'Info.plist');
    return {
      version: plistValue(plist, 'CFBundleShortVersionString'),
      build: plistValue(plist, 'CFBundleVersion'),
      feedURL: plistValue(plist, 'SUFeedURL'),
      publicKey: plistValue(plist, 'SUPublicEDKey'),
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? null : args[at + 1];
  };
  const out = path.resolve(option('out') ?? OUT_DEFAULT);
  let zip = option('zip');
  if (!zip) {
    const zips = existsSync(out) ? readdirSync(out).filter((name) => versionOfArchive(name)) : [];
    if (zips.length !== 1) {
      console.error(
        zips.length === 0
          ? `No Kingfisher-<version>-arm64.zip in ${out}; run npm run desktop:dist first, or pass --zip.`
          : `More than one update archive in ${out}; pass --zip:\n  ${zips.join('\n  ')}`,
      );
      process.exit(1);
    }
    zip = path.join(out, zips[0]);
  }
  zip = path.resolve(zip);
  const version = versionOfArchive(zip);
  const prefix =
    option('download-url-prefix') ??
    `https://github.com/mardakurt/kingfisher/releases/download/v${version}/`;
  try {
    const built = describeArchive(zip);
    if (built) {
      console.log(
        `archive: Kingfisher ${built.version} build ${built.build} · feed ${built.feedURL} · key ${built.publicKey?.slice(0, 8)}…`,
      );
    }
    const result = writeAppcast({
      zip,
      out,
      downloadUrlPrefix: prefix,
      edKeyFile: option('ed-key-file'),
      account: option('account') ?? SPARKLE_KEYCHAIN_ACCOUNT,
      notes: option('notes'),
      latestMac: !args.includes('--no-latest-mac'),
    });
    const s = result.summary;
    console.log(
      `appcast: ${s.title} · sparkle:version ${s.version} · ${s.shortVersion} · macOS ${s.minimumSystemVersion ?? '?'}+ · ${s.length} bytes · notes ${s.hasNotes ? 'embedded' : 'none'}`,
    );
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  }
}
