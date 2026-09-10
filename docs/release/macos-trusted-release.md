# macOS trusted release process

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
npm run desktop:dist
```

This produces, in `desktop/dist/`:

- `Kingfisher-<version>-arm64.dmg` — the first-install
  artifact
- `Kingfisher-<version>-arm64-mac.zip` — the auto-update
  payload
- `latest-mac.yml` — electron-builder's update feed

When `CSC_LINK` and `CSC_KEY_PASSWORD` are set, the produced
`.app` and `.zip` are signed with the Developer ID Application
identity. When the Apple notarization variables are also set,
electron-builder submits the artifacts to the notary service
as part of the build.

If you want a manual split (build unsigned, sign, notarize,
staple), use the staged pipeline instead:

```bash
# Build unsigned first
CSC_LINK= npm run desktop:dist

# Sign manually
npm run release:mac:sign

# Notarize + staple
npm run release:mac:notarize
```

## Verify the build

Three independent checks. Each is its own script; each prints
a verdict and exits non-zero on failure.

```bash
# 1. Code signature: Developer ID, secure timestamp,
#    Hardened Runtime, nested helpers, entitlements blob.
npm run desktop:sign:verify

# 2. Notarization: stapled ticket validates, Gatekeeper
#    accepts offline, ticket is readable.
npm run desktop:notary:verify

# 3. Combined trust gate: the above two plus DMG notarization.
npm run desktop:trust:verify
```

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
cp desktop/dist/Kingfisher-1.1.0-arm64-mac.zip desktop/dist/staging/
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

1. **Confirm the auto-update from a controlled old build.**
   A `1.0.0` packaged app pointed at the new `1.1.0` feed
   should detect the new release, offer **Install Update**,
   and relaunch into `1.1.0` on its own.

   ```bash
   open -a /Applications/Kingfisher.app
   ```

   (with a 1.0.0 build installed; the upgrade runs in place.)

2. **Confirm a fresh quarantined launch.** Download the
   notarized DMG from the GitHub release. Mount it. Drag the
   app to `/Applications`. Launch. The first double-click
   should succeed without a right-click → Open workaround
   and without an "unidentified developer" warning.

3. **Update the public claim.**

   The public security claim on the landing page can now
   read:

   > Developer ID signed and notarized by Apple.

   Not "Apple approved" or "Apple certified." The distinction
   is in `docs/legal/public-claims.md` and `SECURITY.md`.

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
