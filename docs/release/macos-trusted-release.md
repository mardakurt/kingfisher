# macOS trusted release process

> **Status: the process a trusted build goes through.** A
> `Developer ID Application` certificate for team `3B5CYF9DQ4` has been in
> the login keychain since 2026-09-12, an App Store Connect API key feeds
> `notarytool`, and this runbook was executed end to end in Phase 47. Which
> build the public currently downloads, and whether it is notarised, is
> stated by `src/release/macos-download.json` and nowhere else.

This document is the **maintainer's day-of-release runbook**.
It is also the place to look when a release candidate goes
red on a gate and you need to know which step is the
suspect.

The process is the same locally and in CI. The local run is
the source of truth — it is the one the maintainer can debug
with their own eyes and a Terminal — and the CI workflow is
the same script in a different runner.

## Pre-flight

The preflight refuses to start the build when the inputs are
wrong. Run it first; do not start a build without it.

```bash
npm run desktop:release:preflight:mac
```

It checks:

- a `Developer ID Application` certificate is in the login
  keychain
- notarization credentials are present (App Store Connect API
  key, or a notarytool keychain profile)
- the working tree is clean, on `master`, and in sync with
  `origin/master`
- `package.json` and `desktop/package.json` agree on the
  version (and that version matches the release manifest, if
  one is present)
- the build host has ≥ 2 GB of free disk space
- the required tools (`codesign`, `xcrun`, `git`, `node`,
  `npm`) are on `PATH`

A red preflight is a release blocker. Resolve the failing
checks before doing anything else. The preflight never prints
the credentials themselves, only their presence.

## Build the web app

The desktop shell ships the same Next application the browser
does. Build it first.

```bash
npm run build
```

A green `next build` is the cheap check that nothing about
the application has regressed; if it fails here, it is not
worth notarizing.

## Build the desktop bundle

```bash
git status --porcelain                              # must print nothing: a stable build refuses a dirty tree
KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist
```

This produces, in `desktop/dist/` (or `KINGFISHER_DESKTOP_OUT`):

- `Kingfisher-<version>-arm64.dmg` — the first-install
  artifact
- `Kingfisher-<version>-arm64.zip` — the auto-update
  payload
- `latest-mac.yml` — electron-builder's update feed, which
  must be uploaded to the release for _Check for Updates…_ in
  installed builds to find it

The bundle records its build number, commit and `stable`
channel; `node desktop/scripts/verify-dmg.mjs <dmg> --version
<version> --commit $(git rev-parse HEAD)` checks them.

Signing and notarisation happen inside `desktop:dist`, in this order:

1. electron-builder packages the directory and the `afterPack` hook
   (`desktop/scripts/verify-package.mjs`) refuses to continue unless every
   entry of `desktop/src/required-resources.mjs` is present and non-empty.
2. The `.app` is signed with the `Developer ID Application` identity from
   the login keychain (`CSC_NAME="Metin Arda Kurt (3B5CYF9DQ4)"` pins it;
   electron-builder rejects the `Developer ID Application:` prefix), with
   Hardened Runtime and `desktop/build/entitlements.mac.plist`.
3. When `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set,
   electron-builder submits the signed `.app` to the notary service and
   staples the ticket (`notarize: true` in `electron-builder.yml`). A
   `stable` or `preview` build without those variables is refused by
   `build.mjs`; a `dev` build without them is signed and not notarised.
4. `build.mjs` launches the stapled `.app` through the shared harness
   launcher and checks the bridge, the web server, the companion and the
   managed-engine catalogue. A boot failure means no archive.
5. The DMG and the update ZIP are archived from those exact bytes. The DMG
   is signed with the same identity (`dmg.sign: true`).

The credentials come from `~/.kingfisher-release/env.sh` on the release
machine (`source` it first); the file is outside the repository and is
never printed. Do **not** set `CSC_IDENTITY_AUTO_DISCOVERY=false` without a
`CSC_LINK` p12 — it disables the keychain lookup and the build comes out
unsigned.

Then give the disk image its own ticket:

```bash
npm run release:mac:notarize            # notarytool submit --wait, staple, validate; rewrites the DMG row of latest-mac.yml
```

`notarytool` accepts a zip, a dmg or a pkg, never a bare `.app`, which is
why the DMG is what this step submits; the application inside it is
already stapled.

## Verify the build

Three independent checks. Each is its own script; each prints
a verdict and exits non-zero on failure.

```bash
# 1. Code signature: Developer ID, secure timestamp,
#    Hardened Runtime, nested helpers, entitlements blob.
npm run desktop:sign:verify

# 2. Notarization: the stapled ticket validates and Gatekeeper answers
#    "accepted, source=Notarized Developer ID" for the .app (--type execute)
#    and for the .dmg (--type open).
npm run desktop:notary:verify
npm run desktop:notary:verify -- /path/to/Kingfisher-<version>-arm64.dmg
# 3. Combined trust gate: both of the above, and the DMG, failing closed
#    when either artifact is missing.
npm run desktop:trust:verify
```

Then the launch a user actually performs. Put the quarantine flag a
browser would set on a copy of the DMG, mount it, copy the application
out (the flag is inherited), and assess and open the copy:

```bash
cp Kingfisher-<version>-arm64.dmg /tmp/download.dmg
xattr -w com.apple.quarantine "0083;$(printf '%x' $(date +%s));Safari;$(uuidgen)" /tmp/download.dmg
hdiutil attach /tmp/download.dmg -nobrowse -readonly -mountpoint /tmp/kf-dmg
cp -R /tmp/kf-dmg/Kingfisher.app /tmp/Kingfisher.app && hdiutil detach /tmp/kf-dmg
spctl --assess --verbose=4 --type execute /tmp/Kingfisher.app   # accepted, source=Notarized Developer ID
open /tmp/Kingfisher.app
```

macOS shows its standard first-open sheet ("downloaded from the Internet —
are you sure?") and starts the application on **Open**. What must not
appear is "cannot be opened" or "the developer cannot be verified". Do not
remove the quarantine attribute to make this pass.

A red verdict on any of these is a release blocker. A
yellow verdict (a warning rather than a hard error) means
re-read the script output and confirm by hand before
proceeding.

## Test the auto-update path

The auto-update path is not a thing the build verifies for
you. The maintainer certifies it on the release day by
running the local staging harness.

```bash
# In one terminal: the staging feed, served from a directory
# holding the candidate ZIP + latest-mac.yml.
mkdir -p desktop/dist/staging
cp desktop/dist/Kingfisher-1.1.0-arm64.zip desktop/dist/staging/
# Generate a matching latest-mac.yml here (the e2e script
# does this automatically when run).

# In another terminal: the staged e2e test.
npm run desktop:update:e2e
```

The e2e test starts the staging server, runs the wire-level
certification of the staging protocol, and (with `--packaged`)
launches the actual `.app` to exercise the install path.

The mutation suite is the cheap second check:

```bash
npm run desktop:update:mutations
```

Eleven guard-rail mutations run in well under a second. A
red mutation is a release blocker; a green one is a
necessary but not sufficient check.

## Publish

When every gate is green, publish.

```bash
npm run release:mac:publish v1.1.0 "Kingfisher 1.1.0"
```

The publish script uploads every artifact to the GitHub
release, generates `SHA256SUMS`, and (when the file does not
yet exist) generates a `kingfisher-release-manifest.json` in
the same format the renderer-side preflight parser expects.
The script uses `gh release upload`, so the only credential
required is the one already in your shell for `gh` CLI.

After upload, sanity-check the public side:

```bash
# Confirm the latest URL resolves to the new tag.
gh release view --json tagName --jq '.tagName'

# Download the public artifacts and verify the digests.
gh release download v1.1.0 --dir /tmp/kingfisher-verify
shasum -a 256 -c /tmp/kingfisher-verify/SHA256SUMS
```

A `latest` URL that does not resolve to `v1.1.0` is a
release blocker. The `/releases/latest` redirect must point
to the new tag.

## After publication

1. **Confirm the auto-update from a controlled old build — and
   know which old builds cannot.** A previous _stable_ build,
   signed with the same Developer ID identity and pointed at
   the new feed, should detect the release, offer **Install
   Update**, and relaunch into the new version on its own.
   Two builds that exist today cannot take that path, and the
   release notes must say so:

   - the public **1.0.0** (commit `509eb94`) predates the
     updater entirely — it has no _Check for Updates…_ that
     reaches a feed;
   - every **preview** is signed with an `Apple Development`
     identity, and macOS's update engine refuses an update
     whose signature does not match the running application.
     A preview also never consults the feed by design.

   Both replace themselves the same way: download the DMG,
   drag it over the old application. Their work lives in
   `~/Library/Application Support/kingfisher-desktop/` and
   survives the replacement (`npm run desktop:upgrade`
   checks that a previous build's profile is read by this
   one).

2. **Confirm a fresh quarantined launch.** Download the
   notarized DMG from the GitHub release. Mount it. Drag the
   app to `/Applications`. Launch. The first double-click
   should succeed without a right-click → Open workaround
   and without an "unidentified developer" warning.

3. **Point the landing at it, and update the public claim.**

   Write `src/release/macos-download.json` for the stable
   build — `channel: stable`, the real SHA-256 and byte count,
   `signature.identity: "Developer ID Application"`,
   `notarized: true` — run `npm run docs:check`, update
   `docs/release/install-macos.md`, commit and push. The
   landing deploys from master; then
   `npm run desktop:public:verify -- --landing --full`
   downloads the public bytes and confirms the stapled ticket.

   The public security claim on the landing page can then
   read:

   > Developer ID signed and notarized by Apple.

   Not "Apple approved" or "Apple certified." The distinction
   is in `docs/product/public-claims.md` and `SECURITY.md`.

## Recovering from a red gate

A red gate is not a fire — it is a known case.

- **Preflight red**: the credentials are wrong, the working
  tree is dirty, or the build host is missing a tool. The
  output names the specific failure. Resolve and re-run.
- **Code signature red**: the `.app` was not signed with a
  Developer ID Application identity, or the nested helpers
  are unsigned, or the entitlements blob diverged. Re-run
  `release:mac:sign` and read the `codesign` output.
- **Notarization red**: the submission was rejected. The
  release script prints the notary log on failure. The most
  common cause is a hardened-runtime violation; the second
  is a private API the linker referenced. Fix the cause,
  rebuild, re-submit.
- **Gatekeeper red**: the ticket was not stapled, or the
  ticket was stapled but the binary is still unsigned.
  Re-run `release:mac:notarize` and confirm `stapler
validate` passes.
- **E2E red**: the staging server or the staging ZIP has a
  problem. The wire-level checks usually point to the URL,
  the SHA-512, or the host allow-list. The mutation suite
  guards against the maintainable side of these regressions.
- **Mutation red**: a guard in the source has been weakened.
  Read the failing mutation; the fix is almost always
  re-tightening the source.

When the gate is red, the release does not happen. The
process is designed so that a red gate is cheap, a red
release is expensive. Cost-asymmetry is the point.
