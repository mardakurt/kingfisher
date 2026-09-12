#!/usr/bin/env node
/**
 * Run electron-builder, with the things it cannot be told in a config file.
 *
 * ## The output directory
 *
 * electron-builder refuses an output directory whose path contains characters
 * a shell would treat specially, and reports it as "Invalid output directory"
 * without saying which character or which directory. A checkout under a path
 * with an `&` in it — this one — cannot write to `desktop/dist` at all.
 *
 * So the output directory is chosen here: `desktop/dist` when the repository
 * path allows it, and a directory beside the system temporary directory when
 * it does not. `KINGFISHER_DESKTOP_OUT` overrides both, and is exported so
 * that `npm run desktop:smoke -- --packaged` looks in the same place without
 * being told twice.
 *
 * ## The build identity
 *
 * A packaged Kingfisher records what it was built from — see
 * `desktop/src/build-identity.mjs` for what and why. The values are computed
 * here, from git, and handed to electron-builder as `buildVersion`
 * (`CFBundleVersion`) and as `extraMetadata.kingfisher` (the packaged
 * `package.json`). The channel comes from `KINGFISHER_DESKTOP_CHANNEL`:
 *
 *   unset / `dev`   a local build; the tree may be dirty
 *   `preview`       a build the landing will offer; the tree must be clean
 *   `stable`        a signed release candidate; the tree must be clean
 *
 * A publishable channel from a dirty tree is refused, because the commit it
 * would record would not describe the bytes it shipped — that is the bug the
 * public 1.0.0 release manifest records as `"dirty": true`.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { artifactName, CHANNELS } from '../src/build-identity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const REPO = path.resolve(DESKTOP, '..');

/**
 * The characters electron-builder rejects in an output path.
 *
 * The backslash is excluded on Windows, where it is the path separator and
 * not a metacharacter: including it meant every Windows path matched, so the
 * build always diverted to the temporary directory and always printed a
 * message about a character the path did not contain.
 */
const SHELL_SPECIAL =
  process.platform === 'win32' ? /[&|;<>()$`"' *?[\]{}~!#]/ : /[&|;<>()$`\\"' *?[\]{}~!#]/;

const chosen =
  process.env.KINGFISHER_DESKTOP_OUT ??
  (SHELL_SPECIAL.test(DESKTOP)
    ? path.join(tmpdir(), 'kingfisher-desktop-dist')
    : path.join(DESKTOP, 'dist'));

if (chosen !== path.join(DESKTOP, 'dist')) {
  console.log(`Output directory: ${chosen}`);
  if (!process.env.KINGFISHER_DESKTOP_OUT) {
    console.log('(the repository path contains a character electron-builder refuses)');
  }
  console.log('');
}

// --- identity ----------------------------------------------------------------

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/** What the tree is, from git. Null fields when this is not a checkout. */
export function buildIdentity({ env = process.env, gitImpl = git } = {}) {
  const commit = gitImpl('rev-parse', 'HEAD');
  const count = Number(gitImpl('rev-list', '--count', 'HEAD'));
  const porcelain = gitImpl('status', '--porcelain');
  const dirty = porcelain === null ? true : porcelain.length > 0;
  const requested = env.KINGFISHER_DESKTOP_CHANNEL ?? 'dev';
  if (!CHANNELS.includes(requested)) {
    throw new Error(
      `KINGFISHER_DESKTOP_CHANNEL=${requested} is not one of ${CHANNELS.join(', ')}.`,
    );
  }
  if (requested !== 'dev' && dirty && env.KINGFISHER_ALLOW_DIRTY !== '1') {
    throw new Error(
      `A ${requested} build needs a clean tree, and this one is not:\n\n${porcelain ?? '(not a git checkout)'}\n\n` +
        'Commit or stash, then build again. The recorded commit must describe the shipped bytes.',
    );
  }
  return {
    commit,
    build: Number.isInteger(count) && count > 0 ? count : null,
    dirty,
    channel: requested,
  };
}

const require_ = createRequire(import.meta.url);
const { version } = require_('../package.json');

/*
  The landing URL, from the one place it is defined. `src/release/public-urls.ts`
  is TypeScript with only erasable annotations, which Node strips; the desktop
  build reads it rather than keeping a second copy of the address.
*/
const { publicUrl } = await import('../../src/release/public-urls.ts');

const identity = buildIdentity();

/*
  A publishable build is notarised in the directory step (electron-builder.yml
  `notarize: true`), which needs Apple credentials in the environment. Without
  them electron-builder only warns and skips, and a preview or stable DMG would
  be signed but not notarised — the state the public 1.0.0 shipped in.
*/
if (identity.channel !== 'dev') {
  const apiKey =
    process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
  if (!apiKey && !process.env.APPLE_KEYCHAIN_PROFILE) {
    console.error(
      `A ${identity.channel} build is notarised, and no notarization credentials are set.\n` +
        'Set APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER (docs/release/apple-developer-id-setup.md).',
    );
    process.exit(1);
  }
}
const name = artifactName({ version, build: identity.build, channel: identity.channel });
console.log(
  `Build identity: ${version} · build ${identity.build ?? '?'} · ${identity.commit?.slice(0, 7) ?? 'no commit'}` +
    `${identity.dirty ? ' (dirty)' : ''} · ${identity.channel}`,
);
console.log(`Artifact: ${name}\n`);

/*
  electron-builder's own CLI, run under this Node.

  Not `npx`: npm's shims are `.cmd` files on Windows and, since the fix for
  CVE-2024-27980, Node refuses to spawn one without a shell — the first Windows
  packaging run got no further than `spawnSync npx ENOENT`. Resolving the CLI
  and running it directly needs no shell on any platform, which also means the
  arguments below can never be read as shell syntax.
*/
const builder = path.join(
  path.dirname(require_.resolve('electron-builder/package.json')),
  require_('electron-builder/package.json').bin['electron-builder'],
);

const config = [
  `-c.directories.output=${chosen}`,
  // CFBundleVersion: the build number, monotonic, distinct from the marketing
  // version. Falls back to the marketing version outside a checkout.
  `-c.buildVersion=${identity.build ?? version}`,
  `-c.extraMetadata.kingfisher.channel=${identity.channel}`,
  `-c.extraMetadata.kingfisher.dirty=${identity.dirty}`,
  ...(identity.commit ? [`-c.extraMetadata.kingfisher.commit=${identity.commit}`] : []),
  ...(identity.build ? [`-c.extraMetadata.kingfisher.build=${identity.build}`] : []),
  `-c.extraMetadata.kingfisher.landing=${publicUrl.landing}`,
  // The DMG name is the channel's, so a preview can never overwrite a stable
  // release's bytes. The ZIP keeps electron-builder's own name; it is only
  // ever uploaded by the stable release process.
  `-c.dmg.artifactName=${name}`,
  // The feed is configured (so `app-update.yml` is written into the bundle)
  // and never published from here: uploads are the release process's job,
  // after verification.
  '--publish',
  'never',
];

/*
  Superseded development artefacts are removed before the build. Every dev
  build writes a new 160 MB DMG named by its build number and nothing ever
  removed the previous one; a day of Phase 46 left 3.4 GB in the output
  directory. Only `dev` artefacts are touched — a preview or stable DMG is
  something that may have been published and is never deleted here.
*/
if (existsSync(chosen)) {
  for (const entry of readdirSync(chosen)) {
    if (
      /^Kingfisher-.*-dev-\d+-arm64\.(dmg|dmg\.blockmap)$/.test(entry) &&
      !entry.startsWith(name.replace(/\.dmg$/, ''))
    ) {
      rmSync(path.join(chosen, entry), { force: true });
      console.log(`removed superseded ${entry}`);
    }
  }
}

/*
  One electron-builder run. Packaging, signing, notarisation, the boot gate
  (`afterSign: scripts/verify-package-boot.mjs`, which runs after the
  signature and the notarisation ticket and before any archive exists) and
  the DMG and ZIP all happen inside it. A split run — `--dir`, boot, then
  a prepackaged archive step — was tried in Phase 47 and dropped `app-update.yml`
  from the bundle: electron-builder writes the feed only in a run whose
  targets include the DMG or the ZIP, and a bundle without it cannot check
  for updates. The boot gate and the DMG verifier assert the file now.
*/
const result = spawnSync(process.execPath, [builder, ...process.argv.slice(2), ...config], {
  cwd: DESKTOP,
  stdio: 'inherit',
  env: { ...process.env, KINGFISHER_DESKTOP_OUT: chosen },
});
process.exit(result.status ?? 1);
