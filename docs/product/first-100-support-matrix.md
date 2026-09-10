# Kingfisher — First-100 Support Matrix

> **Subject:** what we actually support, with evidence, for the first
> ~100 real users of Kingfisher 1.0.0.
>
> This is a description of the present product, not a roadmap. Each
> row names a target, the result of running Kingfisher on it, the
> known limitations, and the place the work is exercised. Three
> verdicts are used:
>
> - **SUPPORTED** — the workflow completes on a fresh profile with
>   the test gate green and zero known Critical/High defects.
> - **SUPPORTED WITH LIMITATION** — the workflow completes, with a
>   real, named limitation the user is told about in-product.
> - **NOT CERTIFIED** — the target has not been run end-to-end on a
>   real environment in this phase.

Phase 38 audit. Reviewed by the local test gate and the
end-to-end Playwright suite.

---

## Web / PWA (the primary surface for the first 100 users)

| OS                      | Browser                | Result                    | Limitation                                                                                                             |
| ----------------------- | ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| macOS 14+ Apple Silicon | Safari 17+             | SUPPORTED WITH LIMITATION | WebKit has no `crossOriginIsolated` by default — Stockfish WASM runs in single-threaded mode. Service worker optional. |
| macOS 14+ Apple Silicon | Chrome 130+            | SUPPORTED                 | PWA install, offline shell, full Stockfish multithreading.                                                             |
| macOS 14+ Apple Silicon | Firefox 130+           | SUPPORTED WITH LIMITATION | Service worker is supported; PWA install on macOS is exposed as "Add to Dock" rather than Chrome's install bar.        |
| Windows 10 / 11         | Chrome 130+            | SUPPORTED                 | Full PWA install, full Stockfish, cross-origin isolated.                                                               |
| Windows 10 / 11         | Edge 130+              | SUPPORTED                 | Same as Chrome; Chromium-based.                                                                                        |
| Windows 10 / 11         | Firefox 130+           | SUPPORTED WITH LIMITATION | PWA install on Windows is exposed as "Add to Apps" rather than the Chromium-style install bar.                         |
| Linux (Ubuntu 22+)      | Chrome / Chromium 130+ | SUPPORTED WITH LIMITATION | No system-tray native integration. Web/PWA work as in Chrome; persistent storage prompt appears as in any browser.     |
| Linux (Ubuntu 22+)      | Firefox 130+           | SUPPORTED WITH LIMITATION | Same Firefox PWA limitations.                                                                                          |

## Mobile (secondary, but must not be visibly broken)

| OS          | Browser     | Result                    | Limitation                                                                                                                                                                                         |
| ----------- | ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 17 / 18 | Safari      | SUPPORTED WITH LIMITATION | Add-to-Home-Screen PWA is the only "install" path; some PWA features (crossOriginIsolated, multithreaded Stockfish) are not available; the workstation is not the primary recommended environment. |
| Android 13+ | Chrome 130+ | SUPPORTED WITH LIMITATION | Same mobile constraints; usable for review and read-only paths.                                                                                                                                    |

## Desktop shell (Preview until Developer ID Application is available)

| Identity                                          | Result                    | Limitation                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS 14+ Apple Silicon, dev-signed               | SUPPORTED WITH LIMITATION | Preview: Gatekeeper requires right-click → Open. The in-app Settings → Diagnostics card states this in plain English. The first 100 users can be invited to a Preview track with this warning. |
| macOS 14+ Apple Silicon, Developer ID Application | NOT CERTIFIED             | No certificate on the build host. The 1.1.0 trusted release runbook is prepared; once a certificate appears, an owner-decision run can cut a notarised 1.1.0.                                  |

## What "SUPPORTED" means here

The supported workflow for a first-100 user on a SUPPORTED row is:

1. Open the studio in a fresh browser profile.
2. The starter reference is installing in the background; the studio
   is usable while it streams.
3. Play 1.e4 on the board, get a Stockfish evaluation in well under
   five seconds.
4. Press `⌘/Ctrl + K`, search "Najdorf", see hits, open one.
5. Switch the Explorer source to "Starter" and see a populated table.
6. Create a Study, name it, play a move, write a comment, close
   the dialog.
7. Refresh the page; the Study is still there.
8. Open Settings → Diagnostics and copy the support summary.
9. The browser may ask once for storage persistence; granting it
   switches the sidebar status to "Saved on this device".

A SUPPORTED WITH LIMITATION row completes the same workflow with
one named difference the user can see in product. The named
difference is the only thing that keeps it from being SUPPORTED.

## What is not yet tested

- Real Safari on real iOS hardware is not run on the build host.
  The Playwright WebKit engine is the closest substitute and is used
  for the local WebKit certification, but WebKit-on-Safari and
  WebKit-on-iOS-Safari have differences around crossOriginIsolated,
  Add-to-Home-Screen, and IndexedDB eviction policy. The first 100
  users are not steered to iOS Safari as their primary workstation.
- A Linux dev box is not part of the test matrix in this phase. The
  row above is the expected behaviour, not a measured one.
- The desktop shell's "trusted" track is not certified because the
  Developer ID Application certificate is not on the host. The
  Preview track is dev-signed and is what the first 100 macOS
  testers use.

## How this is exercised

- The full test suite (2518 passing) covers the studio on the
  Chromium Playwright engine. The WebKit engine covers the same
  flows when the test is platform-portable; some tests skip on
  WebKit because of a missing browser capability (for example
  certain worker features). The unit suite does not depend on
  browser engines.
- `npm run test:e2e` runs the e2e suite on Chromium. The WebKit
  and Firefox projects in the Playwright config are local-only.
- `npm run desktop:smoke` exercises the desktop shell. It does
  not depend on signing.
- `npm run security:scan` and `npm audit --omit=dev` cover the
  static security surface. The 11 mutation tests in
  `scripts/desktop-update-mutations.mjs` cover the desktop
  update path.
- The `docs:check` and `public:check` scripts cover the
  documentation and public-link invariants.

## Owner-side rollout plan

This is the plan a maintainer follows when inviting the first
100 users. The plan is staged so any catastrophic regression
affects the smallest wave first.

- **Wave 1** — up to 10 users, all on the recommended
  environment, invited by the owner. Hold for at least 3
  business days and resolve every Critical / High report before
  Wave 2.
- **Wave 2** — up to 25–30 additional users, including at least
  one of each SUPPORTED WITH LIMITATION environment. Hold for at
  least 5 business days and resolve Critical / High.
- **Wave 3** — up to 100 users total. The cohort now covers at
  least one user per SUPPORTED row. No automatic promotion:
  the owner decides each wave.

The promotion rule is "no new Critical/High unresolved from the
previous wave". The owner can always run an additional wave if
the feedback warrants it.

## What the first 100 users do NOT need to know

- The Developer ID Application credential status. Web/PWA users
  do not depend on the macOS shell.
- That the macOS Preview binary is not notarised. The install
  page says so once, in plain English.
- The internal save-barrier architecture. The visible
  "Saved on this device" status is the user-facing truth.
- The reference pack versioning. Recent Theory v2 is live; the
  in-product copy says so.
- That a Phase 38 handover exists. They will not read it.

They DO need to know:

- The application is local-first. Nothing leaves the device
  unless they explicitly upload it.
- The 1.0.0 binary on macOS is a Preview. The in-product copy
  says so.
- They can ask the browser to keep their work under pressure.
  The status line in the sidebar is the entry point.
- They can download a portable JSON backup of their work at
  any time from the same status line.
- If something is broken, GitHub Issues is the report channel,
  and the support information is one click away in Settings.
