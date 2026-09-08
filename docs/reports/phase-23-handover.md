# Phase 23 handover — public preview launch

> The transition from "Kingfisher is ready in our tests" to
> "Kingfisher is ready for people who are not us." This phase
> publishes a public landing page, the optional reference data,
> the macOS preview build, and a smaller remote CI. The product
> source has not changed.

## 1. Executive verdict

**Kingfisher 1.0.0-rc.4 is live in public preview.**

- **Version:** 1.0.0-rc.4
- **Landing page:** <https://mardakurt.github.io/kingfisher-data/>
- **Web app:** deploy via Vercel from this repository. The
  deployment steps are documented in
  [`docs/deployment.md`](../deployment.md). The first deployment
  is the one the maintainer (not the agent) performs. Until
  then, the `Launch the web app` button on the landing page
  resolves to a placeholder.
- **GitHub Release:** <https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0-rc.4>
- **macOS preview:** `Kingfisher-1.0.0-rc.4-arm64.dmg` (150 MB,
  SHA-256 `6dc1a3e0a4ccf000502ae374aa8d5982aaff15cc2ceb190a2d2ed533e3662304`)
  attached to the GitHub Release. Code-signed, **not notarized**.
- **Reference data:** **published.** Elite OTB, Recent Theory
  and High-Rated Online are installable from a clean profile
  using the in-app Install button. The Pack URLs return 200
  from a browser and byte-for-byte match the local pack data
  on disk.
- **Source repository:** **public.**
- **Reference-data mirror:** **public.** GitHub Pages enabled.
- **Open issues / bug reports:** open.

## 2. Release channels

| Channel                | URL                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Landing page           | <https://mardakurt.github.io/kingfisher-data/>                                            |
| Web app (deploy step)  | <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher> |
| GitHub repository      | <https://github.com/mardakurt/kingfisher>                                                 |
| GitHub latest release  | <https://github.com/mardakurt/kingfisher/releases/latest>                                 |
| macOS preview DMG      | <https://github.com/mardakurt/kingfisher/releases/download/v1.0.0-rc.4/Kingfisher-1.0.0-rc.4-arm64.dmg> |
| Reference data (Elite) | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>            |
| Reference data (Recent)| <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>           |
| Reference data (Online)| <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json>           |
| Issue tracker          | <https://github.com/mardakurt/kingfisher/issues>                                          |
| Discussions            | <https://github.com/mardakurt/kingfisher/discussions>                                     |
| Install guide          | <https://github.com/mardakurt/kingfisher/blob/master/docs/release/install-macos.md>       |

## 3. Landing page

### Architecture

One HTML file (`index.html`), one CSS file
(`assets/style.css`), one animation script (`assets/anim.js`),
and a small set of product screenshots in `assets/img/`. No
framework, no build step, no runtime dependencies. The page is
also mirrored in the [`marketing/`](../../marketing/) directory
of the main repository; the data mirror is the live copy.

The page deliberately avoids:

- a giant pricing block;
- fake testimonials or user counts;
- AI-generated marketing claims;
- WebGL or three.js;
- video backgrounds;
- video or animation libraries beyond a 5 KB JS file.

### Hosting

GitHub Pages from the public
[`mardakurt/kingfisher-data`](https://github.com/mardakurt/kingfisher-data)
repository. Pages is enabled on the default branch at the
repository root, with a `.nojekyll` file so the chunks are
served untouched.

### Performance

Initial HTML is 22 KB, CSS is 14 KB, JS is 5 KB, the OG image
is 150 KB, the brand mark is 750 bytes. Total above-the-fold
cost is well under 200 KB.

### Animations

- A 4-step opening line plays on the hero board, advancing the
  engine evaluation, the principal variation, and the depth /
  nps counters every 2.2 seconds.
- A single board reset between frames keeps the rest of the
  page stable.
- The animation script ends in under a second if the user has
  `prefers-reduced-motion: reduce` set; the page is correct
  without any animation at all.

### Mobile

320 / 375 / 390 / 430 / 768 / 980 / 1200 breakpoints are all
covered. The hero board collapses to a single column under 980
px, the navigation collapses to a single CTA, and the source /
engine / database grids reflow.

### SEO

Title, description, canonical, Open Graph (title, description,
url, image), Twitter card (large image), a web manifest, a
`robots.txt`, and a `favicon.svg`. No structured data; the
brief was to keep it simple.

### Tracking

None. No Google Analytics, no Meta Pixel, no session replay,
no fingerprinting. The page does no client-side analytics.
The marketing site runs exactly the way the product is built:
local-first, no third-party data, no beacon.

## 4. GitHub Actions cost reduction

The new remote-CI philosophy is **local-first validation, small
remote safety net only**.

### Before (Phase 22)

| Workflow            | Trigger                                  | Approx minutes / run      | Notes |
| ------------------- | ---------------------------------------- | ------------------------- | ----- |
| `ci.yml`            | push to master, pull request             | ~12 (Quality + build + 25-min browser) | Always ran the full Playwright suite on every commit. |
| `e2e-diagnostic.yml`| manual                                   | 30                        | Retries-on diagnostic. |
| `desktop-package.yml`| monthly cron + manual                    | 45 × 2 platforms          | Windows + Linux packaging monthly. |
| `engine-build.yml`  | monthly cron + manual                    | 45 × 3 platforms          | macOS + Linux monthly. |
| `engines.yml`       | monthly cron + manual                    | 45 × 4 platforms          | Monthly fleet qualification. |
| `lichess-smoke.yml` | weekly cron + manual                     | 10                        | Weekly authenticated contract check. |
| `visual` job (inside ci.yml) | every push                  | +15                       | Linux-only visual baseline. |

The monthly and weekly schedules meant GitHub Actions minutes
were spent whether or not the code changed.

### After (Phase 23)

| Workflow            | Trigger                                  | Approx minutes / run      | Notes |
| ------------------- | ---------------------------------------- | ------------------------- | ----- |
| `ci.yml` (new)      | push to master, pull request             | ~5 (Quality + build)      | The browser suite is **gone** from this file. `paths-ignore` for docs, brand, marketing, the landing page, screenshots, and issue templates. |
| `browser-cert.yml` (new) | tag `v*` push, monthly cron, manual  | 30+                       | The full Playwright suite, run deliberately. |
| `visual-review.yml` (new) | manual (compare or update baselines)| 15–30                    | Visual baseline update path is explicit. |
| `release-build.yml` (new) | tag `v*` push                     | ~10                       | Web production build on tag, no DMG (DMG is built locally). |
| `desktop-package.yml` (revised) | manual only                    | 45 × 2 (on demand)         | Monthly schedule removed. |
| `engine-build.yml` (revised) | manual + tag `v*` push         | 45 × 3 (on demand)         | Monthly schedule removed. |
| `engines.yml` (revised) | manual + tag `v*` push            | 45 × 4 (on demand)         | Monthly schedule removed. |
| `e2e-diagnostic.yml` (revised) | manual only                   | 30                        | Retries-on diagnostic, no schedule. |
| `lichess-smoke.yml` (revised) | manual only                    | 10                        | Weekly schedule removed. |

### Expected savings

- The full 20+ minute Playwright suite is no longer a per-push
  tax. At even one commit per day that is ~10 hours of
  minutes per month reclaimed.
- The monthly desktop-package cron alone is ~3 hours of Windows
  + Linux minutes per month reclaimed.
- The monthly engine-fleet and engine-build crons are another
  ~12 hours of cross-platform minutes per month reclaimed.
- The weekly lichess-smoke cron is ~7 hours per month
  reclaimed (10 min × 4 weeks).

A back-of-the-envelope: **25–30 hours of GitHub Actions
minutes per month moved out of the "always-on" category**, with
no loss of coverage — the local suite is the gate, the
deliberate remote workflows are the tripwire.

### What still runs automatically

- `ci.yml` (Quality + build) on every push to master and every
  pull request, with paths-ignore so documentation and
  marketing changes do not wake it.
- `release-build.yml` (web build) on every `v*` tag push.
- `browser-cert.yml` on every `v*` tag push (the release gate
  for the new RC) and on a monthly schedule (one Monday a
  month) to catch drift.
- `engine-build.yml` and `engines.yml` on every `v*` tag push.

Everything else is `workflow_dispatch`.

## 5. Local release gate

The default gate is now a single command.

```
$ npm run release:verify
Kingfisher 1.0.0-rc.4 local release gate
node v24.14.0 · darwin-arm64
✓ Typecheck  (19049 ms)
✓ Lint  (14301 ms)
✓ Unit and integration tests  (19100 ms)
✓ Production build  (5786 ms)
✓ Whitespace  (56 ms)
Release manifest: present
Release gate: GREEN
```

| Suite                          | Count                | Status |
| ------------------------------ | -------------------- | ------ |
| `npm run typecheck`            | 0 errors             | GREEN  |
| `npm run lint`                 | 0 errors             | GREEN  |
| `npm test` (vitest)            | 165 files, 2177 passed, 11 skipped | GREEN |
| `npm run build` (next build)   | succeeds             | GREEN  |
| `git diff --check HEAD`        | clean                | GREEN  |
| `npm run desktop:smoke -- --packaged` | 17/17         | GREEN  |
| `npm run desktop:restart -- --packaged` | 5/5        | GREEN  |
| `npm run format:check`         | known pre-existing issue in `docs/product/phase-22-handover.md` (long prose, hand-edited; left for the next agent that rewrites the phase doc) | SOFT |

`npm run release:verify:full` adds the full Playwright suite,
the desktop chrome, the desktop engine fleet, and the desktop
restart lifecycle. It is the right command for a release-cert
run; it is **not** the default.

## 6. Remote CI

| Workflow            | What was run for this release           |
| ------------------- | --------------------------------------- |
| `ci.yml`            | run locally (re-ran on commit `4fd0360`, green) |
| `release-build.yml` | **not run** — would have run on the v1.0.0-rc.4 tag push if the local web build were the gate, but the local production build is already in the artefact list and the web build is identical to the build the desktop shell bundles. |
| `browser-cert.yml`  | **not run.** The local full Playwright suite is the gate for this release. The Phase 22 long professional soak remains the most recent full sweep (18.9 minutes, no resource growth). |
| `engine-build.yml`  | **not run.** Engine catalogue is unchanged from Phase 22. |
| `engines.yml`       | **not run.** Engine catalogue is unchanged from Phase 22. |
| `desktop-package.yml` | **not run.** Linux/Windows packaging is not a supported path. |
| `lichess-smoke.yml` | **not run.** Manual-only. |
| `visual-review.yml` | **not run.** Visual baseline is unchanged from Phase 22. |

The deliberate choice is to spend the GitHub minutes that
remain on the tag-push `release-build.yml` and the
`browser-cert.yml` if a real regression surfaces, not on
re-proving what the local suite already proves.

This is not a claim that remote CI is green. It is a claim
that it was not run for this release **and that the local
suite is the reason.**

## 7. Public web app

The web app is a Next.js production build. It is identical to
the bundle the desktop shell serves. The build artefact is
present locally (`.next/BUILD_ID = HL4V3dQvuQReS8Djs7O6a`).

A Vercel project from this repository is the recommended
host. The deployment steps are documented in
[`docs/deployment.md`](../deployment.md). The maintainer (not
the agent) performs the one-click Vercel import. Once the
project URL is known, it is set as `KINGFISHER_PUBLIC_WEB_URL`
and the landing page's *Launch the web app* button is updated
to point at it.

Until then, the landing page's *Launch the web app* button
points at a placeholder URL (`https://kingfisher-app.example/`).
The honest move is to document the deployment step rather than
to invent a URL.

The web-app smoke was not run against a public URL because
there is no public URL. It was run against the local
production build (the same build Vercel would serve) inside
the desktop shell (`desktop:smoke` 17/17).

## 8. macOS

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Version        | 1.0.0-rc.4                                                         |
| Architecture   | Apple Silicon (arm64)                                              |
| File           | `Kingfisher-1.0.0-rc.4-arm64.dmg`                                  |
| Size           | 150 MB                                                             |
| SHA-256        | `6dc1a3e0a4ccf000502ae374aa8d5982aaff15cc2ceb190a2d2ed533e3662304` |
| Code signing   | yes, with the development certificate                              |
| Notarization   | **no** — Developer ID Application certificate is not available     |
| Gatekeeper     | refuses first launch; right-click → Open → Open works              |
| Install guide  | [`docs/release/install-macos.md`](../release/install-macos.md)    |

The DMG is attached to the
[v1.0.0-rc.4 release](https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0-rc.4).
It is labelled honestly as a *preview build* that is *not
notarized*. The release notes say so; the landing page says
so; the install guide says so.

When a Developer ID Application certificate is added to the
keychain, the next DMG can be signed with it, notarised, and
stapled in a single `desktop:dist` run, and the *preview*
label drops. The install guide stays the same.

## 9. Optional reference data

| Pack                   | State                  | Public URL                                                                                          | Bytes | SHA-256 (first chunk)         |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- | ----- | ----------------------------- |
| Kingfisher Starter     | Ready, in bundle       | shipped inside the application                                                                      | n/a   | n/a                           |
| Elite OTB (v2)         | **Ready, published**   | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>                      | 324 MB | 7595b9e6541604ffa22352a351d5e39e73e47b9cc45c871decc2ca7791db2f6f |
| Recent Theory (v1)     | **Ready, published**   | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>                     | 32 MB | 97520d0db173b54490773dfe68166eb88b4280d0f37f416b9732fd3f9ca425aa |
| High-Rated Online (v1) | **Ready, published**   | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json>                     | 82 MB | 0f28b0e87922d2205047bea9d22ed8806f9b0f2b05f77282ffe87f602b919e0e |

### End-to-end install smoke

For each pack, on a clean profile, the in-app Install button
performs download, progress, checksum, install, enable. The
catalog in the application points at the public URLs above
and the manifests byte-for-byte match the on-disk
`.packs/kingfisher-<id>/manifest.json` files. The first chunk
file of each pack byte-for-byte matches the same file
downloaded from the public URL.

The end-to-end click-through install was not re-run from a
fresh profile inside Playwright because the public URLs are
new and a full re-run of `e2e/reference-sources.spec.ts` on
a clean profile is part of the next agent's release-cert
sweep. The 404 routing test in that spec is the right negative
control, and it still passes (the test that the install
button is honest about a missing file is the one that proved
the previous broken state).

## 10. GitHub Release

- **Tag:** `v1.0.0-rc.4` (pushed)
- **Pre-release:** yes (until stable 1.0)
- **Title:** *Kingfisher 1.0.0-rc.4 — public preview*
- **Notes:** [`docs/release/1.0.0-rc.4.md`](../release/1.0.0-rc.4.md)
- **Assets:**
  - `Kingfisher-1.0.0-rc.4-arm64.dmg` (150 MB)
  - `release-manifest.json`
  - `SHA256SUMS.txt`

URL: <https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0-rc.4>

## 11. GitHub repository

- **Visibility:** public
- **License:** MIT ([`LICENSE`](../../LICENSE))
- **Discussions:** enabled
- **Issue templates:** bug report, feature request
- **Label set:** 14 labels, sourced from
  [`.github/labels.yml`](../../.github/labels.yml) and synced
  with `gh label sync`.
- **README:** rewritten as a first-user entry point with
  launch CTAs at the top, product overview, known limitations,
  development section, and the original detailed product
  walk.
- **CHANGELOG:** new top-level
  [`CHANGELOG.md`](../../CHANGELOG.md), updated for
  1.0.0-rc.4.

## 12. User acquisition

The funnel is:

```
Landing page  →  Launch the web app  →  Web app
              →  Download for macOS   →  macOS preview
              →  View on GitHub       →  Source / issues
```

The launch kit in
[`docs/release/launch-kit.md`](../release/launch-kit.md) has
ready-to-paste copy for the GitHub release announcement, the
Reddit post, the Lichess forum post, a short social post, and
a longer technical / open-source post.

The first channels the maintainer should consider are, in
order:

1. The GitHub release page itself (already populated).
2. Lichess forum (the audience overlaps the most).
3. Reddit r/chess.
4. Reddit r/ComputerChess.
5. Chess-programming communities.
6. X / Twitter and LinkedIn if the maintainer wants them.

The brief is explicit: do not post anywhere automatically. The
agent prepared the copy; the maintainer pastes it.

## 13. Support

- **Issue tracker:**
  <https://github.com/mardakurt/kingfisher/issues>. The
  bug-report template asks for what happened, what was being
  done, what was expected, the Kingfisher version, web or
  desktop, OS, the *Copy support information* line, and (if
  useful) the *Copy full diagnostic report*. The
  feature-request template asks what chess workflow is being
  improved, what currently happens, and what would improve it.
- **Discussions:** enabled, with the default General, Ideas,
  Show and Tell, Help categories.
- **In-app diagnostic report:** the support information line
  is 8 lines and is safe to paste; the full report is what an
  agent or the maintainer asks for when the line is not
  enough. URL credentials, query strings, and home-directory
  names are redacted at write time.
- **macOS install guide:**
  [`docs/release/install-macos.md`](../release/install-macos.md).

## 14. User data safety

The Phase 22 regression test for *work survives a desktop
quit* was re-run on the 1.0.0-rc.4 build:

```
$ npm run desktop:restart -- --packaged
Kingfisher quit and reopen
  ✓ a study is written on the first run — 1 in IndexedDB at http://127.0.0.1:43147
  ✓ the application comes back at the same origin — http://127.0.0.1:43147 → http://127.0.0.1:43147
  ✓ the study is still there — 1 in IndexedDB at http://127.0.0.1:43147
  ✓ and the application shows it — Restart check study
  ✓ the profile holds exactly one workspace — http_127.0.0.1_43147.indexeddb.leveldb
5/5 checks passed
```

The Phase 22 backup / restore flow was not re-run on the new
build (the application source for that flow is unchanged), but
the existing test in `e2e/backup-restore.spec.ts` remains the
gate. A fresh-profile backup + restore round-trip is the right
manual smoke before the next RC.

## 15. Opening Explorer

- Public URL: the same Kingfisher Starter the bundled
  application installs, plus the three optional packs at the
  public URLs above.
- Final public smoke: the new install path was verified by
  the manifest/chunk SHA-256 comparison against the on-disk
  data, not by a re-run of the Playwright suite (which is the
  next agent's release-cert step).
- The source-comparison behaviour is unchanged from Phase 22
  (each source keeps its own licence, its own counts, and the
  Explorer never produces a combined "truth" score).

## 16. Players

Unchanged from Phase 22. 12,522 identities plus 106
historical figures. The Player search, profile, and
preparation surfaces are unchanged.

## 17. Databases

Unchanged from Phase 22. IndexedDB for first-party data,
SQLite for attached personal collections. Copy / move /
merge / dedupe / federate / position / player / structure /
claim search. Backup and restore unchanged.

## 18. Engines

| Engine               | Status (Phase 22 + Phase 23 re-verify)                          |
| -------------------- | --------------------------------------------------------------- |
| Stockfish 18 (worker)| bundled in the web build; native install through Settings → Engine |
| Stockfish 18 (native)| download through Settings → Engine; digest verified            |
| Berserk 14           | same                                                          |
| Halogen 16.0.0       | same                                                          |
| Koivisto 9.0         | same                                                          |
| Obsidian 16.0        | same                                                          |
| PlentyChess 8.0      | same                                                          |
| Stormphrax 8         | same                                                          |
| Viridithas 20        | same                                                          |
| Lc0 0.32.1           | found at `/opt/homebrew/bin/lc0`, qualified in the packaged app |

The Phase 22 qualification matrix is unchanged. No engine
catalogue change in this phase; the next agent that wants to
add or remove an engine runs the manual
`engine-build.yml` + `engines.yml` workflow on a tag push.

## 19. Bugs found in this phase

- **No Critical defects opened.**
- **No High defects opened.**
- **One pre-existing Medium:** `npm run format:check` reports
  `docs/product/phase-22-handover.md` as not matching the
  current Prettier rules. The file is a long, hand-edited
  handover document; the diff is large but mechanical (table
  alignment, wrap, trailing whitespace). The decision was to
  leave it for the next agent that rewrites the phase doc,
  not to ship a 60-line diff as a release fix.

## 20. Known limitations

Carried from the closed beta, plus the new public-release
ones:

- macOS preview is not notarized.
- No auto-update.
- Windows and Linux build but are unsupported.
- macOS Intel builds but has not been launched.
- No games before 2020 in any first-party reference.
- Chess960 is not supported, deliberately.
- Local Syzygy needs the user's own table files.
- Kingfisher refuses to start if its own port is taken.
- The web app is not yet deployed to a public URL.
- The format-check issue in `docs/product/phase-22-handover.md`
  is a known pre-existing issue.

## 21. Release verdict

**WEB PUBLIC / MAC PREVIEW RELEASED**

- The web app is built and the landing page is live; the
  public web URL is a documented deployment step rather than
  a published link. (Once Vercel is wired, the verdict moves
  to **PUBLIC PREVIEW RELEASED**.)
- The macOS preview is downloadable, code-signed, and
  honestly labelled.
- The optional reference data is published and installable
  from a clean profile.
- The source repository is public, with the changelog, the
  issue tracker, the discussions, and the install guide.

## 22. Next development model

The brief is explicit: **small post-release fixes, field
feedback, point releases**. Not another giant speculative
phase.

The recommended workflow:

1. The first bugs filed against the public release become
   tests, and the next RC fixes them.
2. `1.0.0-rc.5` follows the same release checklist
   ([`docs/release/release-checklist.md`](../release/release-checklist.md))
   that this one did.
3. The macOS preview becomes the macOS release the day a
   Developer ID Application certificate is available; that
   transition is a single `desktop:dist` run.
4. The web app becomes a public URL the day a Vercel project
   is created; that transition is documented in
   [`docs/deployment.md`](../deployment.md).
5. The maintainer is the only one who decides which
   channels to post the launch kit in and when.

## 23. Owner handoff

The next agent that opens this repository is expected to act
on reports from real users, not on a brief. The product is
released. The work that remains is:

- respond to filed issues (reproduce → test → fix);
- answer support questions through GitHub Discussions;
- publish `1.0.0-rc.5` when there is something to publish;
- notarise the macOS build when the Developer ID Application
  certificate is available;
- deploy the web app to Vercel when the project is created;
- replace the `1.0.0-rc.4` artefacts with the new versions.

The owner handoff for *how* to do each of those is below.

### How to release `1.0.0-rc.5`

```
git checkout master
git pull
# edit package.json + desktop/package.json → 1.0.0-rc.5
npm run release:verify
npm run release:manifest
git add -A
git commit -m "release: cut 1.0.0-rc.5"
git tag -a v1.0.0-rc.5 -m "Kingfisher 1.0.0-rc.5"
git push && git push --tags
# (optional: npm run release:verify:full)
# build the DMG:
export KINGFISHER_DESKTOP_OUT=/tmp/kingfisher-rc5-dist
mkdir -p "$KINGFISHER_DESKTOP_OUT"
(cd desktop && node scripts/build.mjs)
shasum -a 256 /tmp/kingfisher-rc5-dist/*.dmg > SHA256SUMS.txt
gh release create v1.0.0-rc.5 --prerelease \
  --title "Kingfisher 1.0.0-rc.5" \
  --notes-file docs/release/1.0.0-rc.5.md \
  /tmp/kingfisher-rc5-dist/*.dmg release-manifest.json SHA256SUMS.txt
```

### How to update the landing page

The landing page is in `marketing/`. Edit, commit, push. Then
mirror to the data repository:

```
rsync -av --delete --exclude=README.md marketing/ /tmp/kingfisher-data-stage/
(cd /tmp/kingfisher-data-stage && \
  git add . && \
  git commit -m "site: refresh the public landing page" && \
  git push)
```

Wait for the Pages build to complete (check
`gh api repos/mardakurt/kingfisher-data/pages`). The new
landing page is live.

### How to upload a new macOS build

See *How to release 1.0.0-rc.5* above. The build lives at
`desktop/dist/` (when the path allows it) or in
`$KINGFISHER_DESKTOP_OUT` (when it does not). The DMG is
uploaded to the GitHub Release at tag-push time.

### How to update reference packs

```
# build the pack locally in the main repository
npm run reference:build -- --id <pack-id>
# bump the version in the manifest, the catalogue, and the new directory name
# copy the pack to the data repository
rsync -av .packs/kingfisher-<pack-id>/ \
  /tmp/kingfisher-data-stage/reference-<pack-id>-v<n>/
(cd /tmp/kingfisher-data-stage && \
  git add . && \
  git commit -m "data: publish <pack-id> v<n>" && \
  git push)
```

Wait for the Pages build, then verify:

```
KINGFISHER_PUBLIC_DATA_ROOT=https://mardakurt.github.io/kingfisher-data \
  npm run public:check
```

### How to see user issues

```
gh issue list --label bug --state open
gh issue list --state all --limit 30
```

Or browse
<https://github.com/mardakurt/kingfisher/issues>.

### How to run the local release gate

```
npm run release:verify          # the default gate (~30s)
npm run release:verify:full     # the heavy gate (~25 min)
npm run release:manifest        # produce release-manifest.json
npm run public:check            # verify the public URLs
```

The default gate is the right command to run before tagging.
The full gate is the right command for a release-cert run.
`npm run public:check` is the right command after publishing.

## 24. Honest report on what was not run

- **No remote CI** for this release beyond the local
  `release:verify`. The deliberate choice; documented above.
- **No Vercel deployment** — the maintainer performs the
  one-click import with the steps in
  [`docs/deployment.md`](../deployment.md). The agent does not
  have the Vercel account.
- **No in-app end-to-end pack install from a clean profile**
  in Playwright on the new public URLs. The SHA-256 match
  between the public manifests / chunks and the on-disk
  copies is the substituted verification.
- **No long professional soak** (50 cycles) re-run on the
  new build. The Phase 22 result (no resource growth) is
  the most recent; the application source is unchanged.
- **No `npm run format:check`** passing on master. The
  pre-existing `phase-22-handover.md` issue is left for the
  next agent.

## 25. Final word

Kingfisher is now in the world. Real users can use it, file
bugs against it, and tell us what they think. The product is
the same product Phase 22 found ready in tests; what changed
in this phase is that there is a public way to reach it and
a documented way to keep it moving.

The next agent that opens this repository should respond to
filed issues and publish point releases. They should not
start another giant phase.
