# Phase 48 — Handover

Desktop UX polish, full-screen macOS chrome, update certification, landing
refinement, command-palette polish and a real clean install of the public
1.1.0. Worked directly on `master`, 2026-09-12, on the maintainer's Mac
(macOS 26.6.2, Apple silicon, Electron 44.2.0, Node 24.14.0). Every number
below comes from a command run in this session; where something was not run,
it says so.

## 1. Verdict

**Phase complete. Kingfisher remains 1.1.0; nothing was released.** The
public DMG the landing links verified byte for byte (55/55); the same bytes
were downloaded through the production landing page's own button, installed
by a Finder drag, and answer _Check for Updates…_ with "You're up to date"
from the real GitHub feed. Full-screen chrome, the palette focus ring and the
landing hero are done and gated. **Critical: 0. High: 0.**

Two things were **not** done by a human in this session and are stated as
such: the Gatekeeper first-open sheet on the installed copy was not clicked
(§5), and the update check on that quarantined copy was therefore run on
the identical public bytes extracted from the release ZIP instead (§6).

## 2. Git

- Start: `07052ff` = `origin/master`, clean.
- Commits: `6728b48` full-screen chrome · `fc72f99` palette focus ring ·
  `8039afa` update-dialog copy · `4fd9172` landing hero and trust row ·
  `24fc85e` docs · this handover.
- `output/` is now git-ignored (harness evidence); `output/phase-48/` holds
  the screenshots named below.

## 3. Apple trust

`security find-identity -v -p codesigning`: three identities, including
`Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)`. Nothing was
created, recreated or touched in `~/.kingfisher-release/`.

Public DMG (downloaded through the landing, §4): `spctl --assess --type
open --context context:primary-signature` → `accepted, source=Notarized
Developer ID`; `stapler validate` → ticket valid. `desktop:public:verify --
--landing --full`: signature `Developer ID Application`, hardened runtime,
notarised and stapled, 23 code objects unchanged from Phase 47.

## 4. Landing DMG

`npm run deploy:status` cannot run here (no `VERCEL_TOKEN`); the check was
made against the live page instead. `npm run desktop:public:verify -- --landing
--full` → **55/55**: the production landing and install guide both link
`https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.1.0-arm64.dmg`,
name the file, and the asset is 160,503,993 bytes, SHA-256
`c4b21c2ebeb0a3fd7963d63eb38002e8f955fddf8fb015c3edcec20241ce6b27`, version
1.1.0, build 472, commit `a9d3b3e`, arm64. That closes Phase 47 §23.

Landing click: in the Browser pane on `https://kingfisher-chess.vercel.app/#macos`,
the card read "1.1.0 · build 472 · 161 MB"; **Download for macOS** was
clicked and `~/Downloads/Kingfisher-1.1.0-arm64.dmg` arrived with the same
SHA-256 and a real `com.apple.quarantine` (`0081;…;Claude;…`).

## 5. Clean reinstall

- `/Applications/Kingfisher.app` was **already absent** at the start (the
  Phase 47 launch had been from `/tmp`); no Kingfisher, Stockfish, Lc0 or
  companion processes were running. The profile in
  `~/Library/Application Support/kingfisher-desktop/` was not touched.
- DMG freshly downloaded: **yes** (§4). Opened in Finder: branded volume,
  Kingfisher icon → arrow → Applications, "Drag Kingfisher to Applications".
  (This Mac's Finder has `AppleShowAllFiles=1`, so `.background.tiff` and
  `.VolumeIcon.icns` were visible; a default Finder hides them.)
- Finder drag: **yes** — Finder's own copy dialog ran ("Copying Kingfisher to
  Applications"); the result is 1.1.0, build 472, quarantine `0381` (inherited,
  not yet approved). DMG ejected.
- First launch: **not performed by a human.** The double-click in Finder was
  declined by the owner, who then told me the step was finished. The
  quarantine flag is still `0381`, so macOS's first-open sheet has not been
  shown or read on this copy. The assessment that decides which sheet appears
  is `accepted, source=Notarized Developer ID` (§3) — the ordinary "downloaded
  from the Internet" confirmation, not "cannot be verified" — but nobody has
  clicked it yet.
- Existing user data: not exercised on the installed copy for the same
  reason. The public bundle launched through the harness on a fresh profile
  (§6, §12); Phase 47 §24 covers the data-compatibility question.

## 6. Check for Updates

- **Production, public 1.1.0 bytes:** the release ZIP (same build, same
  signature, no browser quarantine) was extracted and launched through the
  shared harness launcher; the real _Kingfisher → Check for Updates…_ menu
  item was invoked, the dialog's **Check for Updates** button pressed, and
  the real GitHub feed answered: headline **"You're up to date"**, detail
  "You have the latest version available on this release channel.", version
  line "Kingfisher 1.1.0", one **Close** button. No "Unable to check", no
  raw HTTP, no path. Screenshot:
  `output/phase-48/check-for-updates-public-1.1.0.png`.
- **Feed:** `/releases/latest/download/latest-mac.yml` → version 1.1.0,
  `Kingfisher-1.1.0-arm64.zip` SHA-512 `VRPzPFyK…OkAQ==` (matches the release
  ZIP) and the DMG SHA-512 `Ntcmvs…U2hg==` (matches the downloaded DMG).
  Bundle `app-update.yml`: `owner: mardakurt`, `repo: kingfisher`,
  `provider: github`, `releaseType: release`. Not modified.
- **Staging install:** `desktop:update:real` with the signed 1.0.5 (build 472) as current and the 1.1.0 ZIP as next — **12/12**: dialog offers 1.1.0,
  download, quit, bundle replaced and Developer-ID signed, relaunched by the
  update engine, version reported, post-update notice, study preserved,
  nothing surviving the quit.

## 7. Update window

Inspected in `desktop:update:dialog` (15 states × light/dark, PASS, twice —
before and after the change). Native title bar, icon + version + headline +
one line + one default button, nothing under the traffic lights. No redesign.
Two copy defects fixed: a straight apostrophe in "You're running…" against
the typographic one elsewhere, and "…is available" followed by "A new macOS
build is available." — the fallback now says the download starts when you
choose Install Update. `update-protocol.test.mjs` 42/42.

## 8. Full-screen macOS chrome

- **Windowed:** unchanged — buttons at 14,20, mark at x = 84, 16 px gap,
  shared centre line (`desktop:chrome` composition checks).
- **Full screen:** the shell relays the window's own `enter-full-screen` /
  `leave-full-screen` as one boolean (`kingfisher:fullscreen`; the renderer
  asks once on attach). `useDesktop.ts` writes `data-fullscreen` on the root;
  `globals.css` collapses `--titlebar-safe-w/h` to `0px`; the sidebar header's
  inset, the corner marker and the focus band move together; the mark lands
  at the header's plain 14 px inset. The bootstrap now writes the shell's
  rectangle as `--mac-titlebar-safe-*` and the reservation is derived, because
  an inline value on the root could never have been overridden. The collapsed
  rail's mark returns in full screen. Padding transitions over 140 ms.
- Not inferred from the viewport; the bridge exposes a report, not a control
  (`fullscreen-ipc.test.mjs`).
- `npm run desktop:chrome` (checkout shell, after `desktop:build:web`):
  **109/109** — told, `0px × 0px`, mark at 14 (windowed 84), attribute
  cleared on exit, composition restored, buttons back at 14,20. The old
  "mark under the buttons" collision check is deliberately not run inside
  full screen (there are no buttons there).
- Evidence: `output/phase-48/titlebar-windowed.png`,
  `titlebar-fullscreen.png`, `titlebar-windowed-after.png` (renderer
  captures; the OS buttons were confirmed present/absent in live window
  captures — `screencapture` is blocked on this Mac). Not run `--packaged`:
  the public 1.1.0 bundle predates this code.

## 9. Command palette

Root cause: the unlayered global `:focus-visible` rule beat Tailwind's
`outline-none` (in `@layer utilities`), so the **input** drew a 2 px accent
outline that started after the icon and was clipped by the dialog's rounded
top into a gold U. Now the icon and input share a `[data-palette-search]`
field; the ring is on the field via `:focus-within` (accent border + 1 px
shadow); the input's outline is off by a specific unlayered rule; the result
list takes the same 8 px inset so the group column aligns with the icon; the
selected row is a rounded fill. Verified in both themes; computed styles:
field border/shadow = accent, icon and input inside the field, zero stray
outlines in the dialog; ⌘K, typing, ↓ ↑ Enter Escape unchanged.
`accessibility.spec.ts` "one focus ring" test — **fails on the old CSS**
(`outline-style: solid`), passes on the fix.

## 10. Landing

- Hero: a product frame under the CTAs with a **current** capture — the
  analysis workspace, real Stockfish search, arrow on the board — made by
  the new `scripts/landing-hero-capture.mjs` from the running build
  (`public/landing/img/workspace-2026-09.webp`, 2240 × 1400, 137 KB;
  recorded in THIRD_PARTY_ASSETS.md). `kf-arrive` entrance, reduced motion
  honoured. Five unreferenced images deleted from `public/landing/img`.
- macOS card: new spec row "Signed with Apple Developer ID · Notarised by
  Apple", from the descriptor; a non-notarised preview says so instead.
- Responsive: 390×844, 430×932, 1280×720, 1440×900, 1920×1080 — horizontal
  overflow 0 at each, download CTA above the fold. Nav unchanged (compact;
  links hide under 820 px and the Launch CTA remains). No new animation
  library. `docs:check` 299/299, `public:check` 22/22.
- Evidence: `output/phase-48/landing-desktop.png`, `landing-mobile.png`
  (captured with reduced motion; a non-scrolling capture otherwise shows the
  scroll-driven sections and lazy images before they appear — a capture
  artefact, checked live).

## 11. Bugs found

Only real ones: (1) the palette's clipped input outline (§9); (2) the
full-screen reservation held for buttons that were not there (§8); (3) the
update-dialog apostrophe and repeated "available" (§7); (4) the
`desktop:chrome` harness asserted a collision against an empty rectangle in
full screen (fixed with the feature). No data loss, startup, updater,
Gatekeeper or chess-correctness defects found.

## 12. Tests

- `npm test`: **234 files, 2888 tests, 0 skipped, 0 failed**;
  `test:no-skips` OK.
- typecheck, lint, format:check, build, docs:check 299/299, public:check
  22/22, size:check, security:scan 0 findings, `npm audit --omit=dev
--audit-level=high` 0, `git diff --check` — all exit 0.
- Playwright: targeted — `accessibility.spec.ts` palette (4/4),
  `window-chrome.spec.ts` (3/3), both on the changed code. **The full
  matrix was not completed in this phase.** One run reached 189/264 with
  no failure before the desktop app was quit underneath it; a second start
  was refused by the web server because the restarted shell resolved
  Node 20 (`node:sqlite` is Node 24), and the owner then ended testing for
  the phase. Phase 47's 263/263 stands as the last complete run; Phase 49
  opens with the full matrix on Node 24.
- Desktop: `desktop:chrome` 109/109 (checkout); `desktop:update:dialog`
  PASS; `desktop:update:real` 12/12; `desktop:smoke -- --packaged` on the
  public 1.1.0 bundle **17/17**; `desktop:public:verify -- --landing --full`
  55/55. Chaos/soak suites not rerun — no change to their subsystems.

## 13. Version

**Kingfisher remains 1.1.0.** No 1.1.1, no 1.2.0. The CHANGELOG carries the
work under _Unreleased_. The full-screen behaviour, palette fix and dialog
copy reach users with the next release; the landing changes reach them when
Vercel redeploys from `master`.

## 14. Next mode

**USER-FEEDBACK MODE**, with the owner's stated intent that the next phase
tests aggressively. First items for it: the full Playwright matrix on Node
24 (§12); `desktop:chrome -- --packaged` on the first build that carries
the full-screen code; and two human steps — double-click
`/Applications/Kingfisher.app` once and read macOS's first-open sheet, and
run _Check for Updates…_ on that copy (the same bytes answered "You're up
to date" here).
