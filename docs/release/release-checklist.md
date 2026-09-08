# Kingfisher release checklist

The operational list. Tick before tagging; tick after publishing;
tick again when the public link validator passes.

## Before tagging

- [ ] Version bumped in `package.json` and `desktop/package.json`,
      and the two match.
- [ ] `npm run release:verify` is green.
- [ ] `npm run release:manifest` written `release-manifest.json`
      with the version, commit, and the SHA-256 of every desktop
      artefact.
- [ ] `git status` is clean.
- [ ] `git diff --check HEAD` is clean.

## macOS

- [ ] `npm run desktop:pack` (or `desktop:dist` for the
      signed/notarised variant) produced a DMG in
      `desktop/dist/` or `KINGFISHER_DESKTOP_OUT`.
- [ ] The DMG filename is `Kingfisher-<version>-arm64.dmg`.
- [ ] `npm run desktop:smoke -- --packaged` against the new
      build is green.
- [ ] If a Developer ID Application certificate is available,
      the build is signed with it, notarised, and the ticket
      is stapled. If not, the build is honestly labelled
      "preview build — not notarized" in the release notes.
- [ ] `docs/release/install-macos.md` matches the artefact
      filename.

## Public surfaces

- [ ] Landing page is live at
      <https://mardakurt.github.io/kingfisher-data/> and
      returns 200.
- [ ] Each pack manifest returns 200.
- [ ] A sample chunk file from each pack returns 200.
- [ ] The web app URL is configured (Vercel or another host)
      and returns 200.

## GitHub Release

- [ ] Tag `v<version>` pushed to origin.
- [ ] `gh release create v<version> --prerelease` created with
      the release notes from `docs/release/<version>.md`.
- [ ] DMG, `release-manifest.json`, and `SHA256SUMS.txt`
      attached.
- [ ] Discussion categories enabled (optional, see
      <https://github.com/mardakurt/kingfisher/discussions>).
- [ ] Issue templates for *Bug report* and *Feature request*
      are present under `.github/ISSUE_TEMPLATE/`.

## Reference data

- [ ] If a pack version changed, the new directory is pushed
      to `mardakurt/kingfisher-data` and the Pages build
      succeeded.
- [ ] The Install button on a clean profile works for every
      pack that is listed as "Ready, in bundle" or
      installable.
- [ ] A clean-profile install of one of the new packs
      round-trips: download, progress, checksum, install,
      enable, Explorer query, restart app, source still
      ready, offline.

## After publishing

- [ ] `npm run public:check` is green.
- [ ] README's *Public preview* banner points at the right
      version.
- [ ] CHANGELOG.md has a new top entry.
- [ ] `docs/release/<version>.md` exists.
- [ ] The launch-kit draft is in `docs/release/launch-kit.md`
      and is ready to copy-paste into channels.
- [ ] `docs/reports/phase-23-handover.md` is written.

## Diagnostics smoke (recommended)

- [ ] Fresh profile.
- [ ] Create a Study. Create a Repertoire. Change a setting.
- [ ] Quit the desktop application.
- [ ] Launch again. Confirm the Study, the Repertoire, and the
      setting are still there.
- [ ] Quit and relaunch once more. Confirm again.

## Announcing

- [ ] The maintainer (not the agent) pastes the GitHub release
      announcement into the chosen channels.
- [ ] The first channels are the ones in the launch kit, in
      the order: GitHub release page (already done by `gh`),
      then Lichess forum, then Reddit r/chess, then the
      chess-programming communities. Wider only after a
      week of signal.
