# Phase 88 — second pass: the shell bugs an audit could name but not close

A bug-fix and desktop-native UX pass over the shared shell and workspace
layout, run against `master` at `49969ec` on a tree that already carried the
first pass's five commits. Ten commits, all on `shell-bugfix-pass`.

`docs/README.md:10-16` is explicit that handovers are Historical and are never
read as the current state. This file records what this pass did and why; the
current claims live in `docs/design/visual-system.md`, `ARCHITECTURE.md` and
`CHANGELOG.md`, and this file is the record of the working.

## 1. What the pass was for

An audit had produced a list of findings with file-and-line evidence. Three of
them could not be closed end to end, and the instruction was to confirm or
refute them first rather than "fix" them anyway.

**Refuted.** Twenty-three e2e call sites do not reference a button that does
not exist. `getByRole('button', { name: 'Settings ⌘,' })` resolves to exactly
one element, in the navigation landmark. The sidebar row's _text_ is
`Settings⌘,` with no space, but the accessible-name algorithm joins an
element's text children with a space, and Playwright's substring matching
resolves it. Measured in Chromium; the suite was never red.

The finding that survived was smaller and real: two controls doing one job
announced themselves as "Settings comma" and "Settings, comma". Both now name
what they do and let the system announce ⌘, through `aria-keyshortcuts`, and
twenty-eight call sites across fifteen specs collapsed onto one helper.

**Confirmed.** The unlayered `:focus-visible` rule did carry
`border-radius: 3px`, outranking every radius utility — measured, a
`rounded-[6px]` control computed 6px blurred and 3px focused. And
`useAutoBackupState.status` really could say `'failed'` with nothing to draw
it, so a failed backup rendered as "Backup 3d ago" with a green dot.

## 2. The settings contract, and the guard that missed it

The strongest result of the pass, and it was not in the audit.

"Every preference is declared, its control writes it, its consumer reads it" is
the contract's central claim. The second half was `source.includes(entry.key)`,
which is true for three things that are not a read: a **function of the same
name**, a **string literal naming the key in a file that only writes it**, and a
**module-local variable of the same name**. All three were in the tree.

Three of the four rows the strengthened check found had been reported by the
audit. `animationSpeed` had not, by anyone — its declared consumer is the store
that _defines_ `resolveAnimationMs` but takes the speed as an argument, and it
passed for the same reason the others did, because the store spells the key in
its own defaults and reset path. A guard that misses four for the same reason
was not three separate mistakes.

Demonstrated as a triangle rather than asserted:

|                      | result                        |
| -------------------- | ----------------------------- |
| old check + old rows | **9 passed** — the bug, green |
| new check + old rows | **1 failed**, naming all four |
| new check + new rows | 9 passed                      |

## 3. The mistake made three times

Tailwind finds utilities by scanning source _text_ for complete class names. It
does not evaluate TypeScript. A class assembled by interpolation contains no
complete class, nothing is emitted, and the rule does not exist — while the
TypeScript referencing it is perfectly valid.

This pass did that three times, in three files, and every ordinary gate stayed
green each time:

| what broke                            | symptom                                                                      | caught by                   |
| ------------------------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| the titlebar band class               | header measured **36px** where 56 was contracted                             | `e2e/window-chrome.spec.ts` |
| one board square's size               | every piece lost its constraint; the board rendered as a few enormous pieces | 13 failing visual baselines |
| the workspace's tall-viewport padding | lost `sm:px-5` / `sm:py-4` at every tall viewport                            | 11 failing visual baselines |

The third was committed before the second was found, with the lesson written
into its own commit message. `src/ui/tailwind-literal-classes.test.ts` now
refuses an unclosed Tailwind arbitrary-value bracket at the point an
interpolation arrives. It is deliberately narrow — composition at a token
boundary is correct and common, and a gate that cried wolf on every template
would not be run — and it carries a self-check, which immediately caught that
its own helper used `String.match` with a `/g` flag and was reading the second
match instead of a capture group. Green because broken, in the guard written to
stop green-because-broken.

## 4. Layout constants

Eight literals that could decide differently from the stylesheet: `1100` in
three modules against `--breakpoint-board`, `860` in two more, `1399` and
`1599` in a fourth. They now live in `breakpoints.ts`, and a test reads
`globals.css` and asserts each still equals its token.

The `860`/`859` pair was a real hole rather than a style complaint:
`min-height: 860px` and `max-height: 859px` partition the range for integer
viewport heights and not for any other. At 859.5 — browser zoom, fractional
device pixel ratios — neither matches, so the board takes the tight padding and
loses the loose one. The test parses both queries and checks every height
around the boundary lands in exactly one bucket, because a hole that exists
between two integers is invisible to a test that only tries the integers.

**3.4 was smaller than it looked.** Six files were listed as the window-drag
surface; two are not the band. `MobileNavigation`'s `h-14` is the mobile
_bottom_ tab bar and has no drag region, and `RecentWorkspace`'s drag header is
a panel sized by padding with no fixed height. Four are the band.

## 5. Radii

Eleven hard-coded radii collapsed to three, by kind rather than by value
(policy in `docs/design/visual-system.md`). Ninety-five lines across the twelve
files with the most internal divergence; those files now contain zero literals.

**Not one of the 43 visual baselines moved.** That is the right outcome — it
means nothing unintended changed — and it is also a caveat: a 1px corner change
on a 28px control is a few dozen pixels in a full-page shot, well inside the 2%
tolerance. The screenshots can confirm this broke nothing; they cannot confirm
it looks better. The remaining ~300 call sites are a mechanical follow-up now
that the mapping is written down.

## 6. Gates

`npm test` **3,876 / 3,876** across 362 files (this pass adds 13) · typecheck
clean · lint 0 problems · `format:check` clean · `test:no-skips` OK ·
`docs:check` **357 / 357** · `npm run test:e2e:visual` **43 / 43**, exit 0, no
baseline regenerated · `test:e2e` unfiltered, recorded in the session report.

Visual baselines changed across this pass: **none**. Every one of the four
pixel-moving changes in the eleven-file radius sweep sat inside the 2%
tolerance, and the two genuine board changes — the position-setup frame and the
library's empty state — are the only ones that could have moved one, and neither
does at rest.

## 7. Not done

- The ~300 remaining radius call sites, and the other nine of twelve declared
  elevation values. The mapping is written down; the sweep is mechanical.
- `WorkspaceFrame.tsx`'s six hard floor heights, and the four divergent content
  measures in `CanonicalBoardSurface`/`WorkspaceDocument`. The audit marked the
  floor-height consequence "likely, not rendered"; it was not rendered here
  either, so it is left alone rather than changed on a guess.
- 3.6 and 3.7 need a decision about intent before they are a mechanical change:
  which of four content measures is the right one is a design call, and the
  floor heights need a rendered check first.
- The audit's weaker-test findings outside these blocks: the `.first()`
  selector class, `docs-check.mjs` not scanning `desktop/`, the two
  zero-assertion bench files, the env-overridable `retries`.
- No release, publish, notarisation, version or DMG-descriptor change. The
  public Mac is still 1.3.3 build 932 and contains none of this.
