# Phase 85 — the Firefox and WebKit matrix, filed

_2026-09-26, on the maintainer's Mac. `npm run test:e2e:matrix`
(`KF_E2E_MATRIX=1`), four projects: Chrome, Playwright's Chromium, Firefox,
WebKit. The brief (Part B.4): run it once, fix or file every failure._

## The run

**1,419 of 1,492 passed; Chrome passed everything.** An earlier attempt was
void: the project's Playwright wanted Chromium build 1243 and the cache held
1228, so every Chromium test failed to launch; the browsers were installed
and the run repeated. It ran beside the 10M import, so the 22 functional
failures were re-run alone on a quiet machine (`--last-failed`): 19 remained.

## Fixed

| Failures                                         | Cause                                                                                                                                    | Fix                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 51 visual, Chromium/Firefox/WebKit               | Baselines from before the Studio redesign, never regenerated                                                                             | Regenerated; each within 0.4–4.7% of the inspected Chrome image (`0ca4c59`)               |
| Firefox: team, study chapter, reload (hydration) | **Application defect.** Firefox restores a button's `disabled` across a reload before React hydrates; React does not patch the attribute | `autocomplete="off"` on `Button` and `IconButton` (`bb7419b`)                             |
| WebKit: 7 specs ("due to access control checks") | The specs collected page errors without `isNavigationAbortNoise`; WebKit reports a fetch cancelled by navigation that way                | The specs use the filter; phase7's own reload handler knows the pack manifest (`bb7419b`) |
| Firefox + WebKit: window-chrome drag region (4)  | The test read `-webkit-app-region`, which only Chromium implements                                                                       | Asserted absent where `CSS.supports` says so; geometry still asserted; not skipped        |
| Firefox + WebKit: team clipboard (2)             | Chromium-only clipboard permissions                                                                                                      | A recording clipboard where the engine has none; the copied PGN is still asserted         |
| Firefox: font download `status=2152398850`       | 0x804B0002 is `NS_BINDING_ABORTED`, spelled as a number                                                                                  | Recognised by the same filter                                                             |

After the fixes the nine affected specs pass on all four engines, and the
team spec passes on each.

## Filed — resolved in Phase 86 (2026-09-26)

The five were each reproduced, fixed, repeated on Chrome, Firefox and WebKit,
and the fix shown to matter by putting the old behaviour back and watching
the spec fail. Only one was an application defect.

| Engine  | Spec                                                                             | What it was                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebKit  | `accessibility.spec.ts` database screen by keyboard                              | Safari's Tab reaches only text fields and menus; Option-Tab is how its keyboard users reach links and buttons. The spec's check also passed vacuously whenever Tab landed on `<body>`, whose text contains every name                                                                  | Option-Tab on WebKit, and the focused element must be a control. With plain Tab on WebKit it fails again                                                                          |
| WebKit  | `coverage.spec.ts`                                                               | A reload started inside `page.evaluate()`; `ready()` answered from the old document, still marked ready, and read the move-1 panel                                                                                                                                                     | `page.goto()` to the deep position, a navigation Playwright waits for                                                                                                             |
| WebKit  | `library-databases.spec.ts` (and the same wait in `phase8` and `opening-report`) | **The wait for the import was vacuous.** `getByText(/2 games/).first()` matched any earlier collection listing "2 games"; the dialog closed and the page navigated while the page-driven import was still running, so the collection held 0 games (the failure screenshot shows "· 0") | Wait for this import's own completion: the paste cleared and its "N games imported" notice. With the wrong count it fails                                                         |
| Firefox | `workspace-tabs.spec.ts`                                                         | Entering a tab shows its fields at once, then pushes the address and writes the drafts; the reload came in between, and Firefox (per the HTML standard) aborts a pending reload when the router's `pushState` lands. WebKit also clicked a link before New tab's own navigation        | `enterTab()` waits until the page's draft was written after the click and only the left tab keeps a copy; the spec waits for the new board's address. 60/60 on Firefox and WebKit |
| Firefox | `reliability.spec.ts` (intermittent)                                             | **Application defect.** Next preloaded Inter and JetBrains Mono on every page; since the Mac redesign (`8737815`) the UI stack puts the system face first, so on macOS and Windows Inter is never drawn, and the mono face appears seconds later if at all                             | `preload: false` on both faces (`src/app/layout.tsx`); the page now references no preloaded font. `reliability.spec.ts` 18/18 on Firefox                                          |

Evidence (this Mac, Node 24.14.0, dev server): the five specs plus the three
sharing the import wait, `--repeat-each=4` on Chrome, Firefox and WebKit —
**72/72**; `workspace-tabs.spec.ts` `--repeat-each=5` on all three — 75/75.
A tried application change (skipping a tab's push to the address already
shown) was reverted: with it removed the spec still passed, so it was not
the cause and its test could not fail.

## Filed — as originally written

Each was reproduced alone on a quiet machine; none fails in Chrome.

| Engine  | Spec                                                    | What happens                                                                       | Suspected cause                                                                                           |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WebKit  | `accessibility.spec.ts:307` database screen by keyboard | The "My games" heading is not visible after the keyboard route                     | WebKit's Tab order skips links by default (Safari's "Press Tab to highlight")                             |
| WebKit  | `coverage.spec.ts:14`                                   | The dock's Coverage text is not what the spec expects                              | Not yet investigated                                                                                      |
| WebKit  | `library-databases.spec.ts:18`                          | The Library shows "No games imported" instead of the companion database's games    | The database picker's selection not applied in WebKit; also once in Chromium under load — possibly a race |
| Firefox | `workspace-tabs.spec.ts:68`                             | `page.reload: NS_BINDING_ABORTED`                                                  | Firefox aborts a reload issued while a navigation is settling; a harness habit                            |
| Firefox | `reliability.spec.ts:319` (intermittent)                | Two console warnings: a font preloaded by Next was "not used within a few seconds" | A Firefox performance advisory; passed in the full matrix, failed once alone                              |

None of these is known to affect a user of the application in Chrome or in
the Mac application (Electron, Chromium); the WebKit keyboard case would
affect a Safari user who relies on Tab to reach links, and is the one to
look at first.
