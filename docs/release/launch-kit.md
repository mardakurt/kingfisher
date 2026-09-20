# Launch kit — Kingfisher 1.2.6

The copy prepared for first channels, for the current public release:
**Kingfisher 1.2.6** on the web and **Kingfisher 1.2.6** for macOS
(Apple Silicon, macOS 13 or later, signed with a Developer ID
certificate and notarised by Apple). Every statement below is one that
[`../product/marketing-facts.md`](../product/marketing-facts.md) lists
as verified; if a sentence here is not there, cut the sentence, not the
list.

## One-sentence description

Kingfisher is a local-first chess research workstation for
serious players — opening research across separate evidence
sources, native engines, large personal databases, repertoire
and review.

## 50-word description

Kingfisher is a local-first chess workstation for serious
players. Opening research across separate evidence sources,
Stockfish in the browser, native engines on macOS, large
personal databases, repertoire, game review and training. No
account, no cookies, no subscription. Web and macOS. Open
source under the MIT licence.

## 150-word description

Kingfisher is a local-first chess research workstation for
serious players. The application brings together opening
research across separate evidence sources — Elite OTB, Recent
Theory, High-Rated Online and a bundled offline Starter, each
with its own game count and licence, never merged into one
number — native engines on macOS (Stockfish, Stormphrax,
Viridithas, Halogen, PlentyChess and Lc0, each digest-verified
on install), large personal SQLite databases with position,
structure and player search, and the everyday study workflow
(Studies, Repertoire, Game Review, Training). The web build
runs Stockfish 18 as WebAssembly in the browser. The macOS build
is a native shell serving the same application, signed with a
Developer ID certificate and notarised by Apple. Nothing leaves
your machine that you did not put in the address bar — no
account, no cookies, no upload. The reference data is
published in the open <https://github.com/mardakurt/kingfisher-data>
mirror under the original Lichess licences. The source is open
under the MIT licence.

## GitHub release announcement

> ## Kingfisher 1.2.6
>
> A maintenance release on 1.1.0, signed with a Developer ID certificate
> and notarised by Apple: the DMG opens and the application starts with a
> normal double-click, and an installed 1.1.0 is offered it through
> _Kingfisher → Check for Updates…_.
>
> **What's in it**
>
> - **Web app** at <https://kingfisherchess.app/analysis> —
>   Stockfish 18 in the page, no install.
> - **macOS** (`Kingfisher-1.2.6-arm64.dmg`) — Apple Silicon,
>   macOS 13 (Ventura) or later, Developer ID signed, notarised.
>   _Kingfisher → Check for Updates…_ installs the next release when
>   you ask; nothing is checked in the background.
> - **Bundled reference data** — Kingfisher Starter, 172,376
>   over-the-board games, ships in the app. Elite OTB, Recent
>   Theory and High-Rated Online are listed in the catalogue
>   and can be installed on demand.
> - **Source-comparison Explorer** — every source keeps its own
>   licence, provenance and counts. The Explorer never produces
>   a single "truth" score that quietly blends them.
> - **Game Review** — the critical moments of an imported game,
>   the candidates at each, the evidence behind them, and a
>   Calculation Training set made from what you got wrong.
> - **Diagnostics that are answerable** — Settings → Diagnostics
>   has a _Copy support information_ line and a _Copy full
>   diagnostic report_ button, both with credentials redacted.
> - **No account, no cookies, no subscription.**
>
> **Known limitations**
>
> - Windows, Linux and Intel Macs are not built. The web
>   application runs in any modern browser on them.
> - No cross-device Sync; the supported way to move work
>   between machines is the backup / restore flow.
> - No games before 2020 in any first-party source.
> - The 1.0.0 preview cannot update itself; replace it by hand
>   once. Your work is kept.
>
> **Reporting problems** — the Feedback button in the application,
> or an issue on GitHub with the support information line pasted
> in.
>
> Source, releases and issues: <https://github.com/mardakurt/kingfisher>

## Reddit (r/chess, r/ComputerChess) post draft

> **Title:** Kingfisher 1.2.6 — a local-first chess research
> workstation, on the web and as a notarised Mac app
>
> I've been building Kingfisher for the last couple of years: a
> local-first chess research workstation for serious players, with
> opening research across separate evidence sources (Elite OTB,
> Recent Theory, High-Rated Online), Stockfish in the browser,
> native engines on macOS, large personal databases with position
> and structure search, and a daily-study workflow (Studies,
> Repertoire, Game Review, Training).
>
> It is local-first: no account, no cookies, no subscription. No
> data leaves your machine that you didn't put in the address bar.
>
> - Web app: <https://kingfisherchess.app/analysis>
> - macOS (Apple Silicon, macOS 13+, Developer ID signed and
>   notarised): <https://kingfisherchess.app/#macos>
> - Source (MIT): <https://github.com/mardakurt/kingfisher>
>
> I am looking for real bug reports, real workflows, and real
> feedback from club players, coaches, and engine/database
> enthusiasts. Each reported defect is either reproducible (and
> becomes a test) or it is a question about what the product
> should do, and either is useful.

## Lichess forum post draft

> **Title:** Kingfisher 1.2.6 — a local-first chess research
> workstation (web + macOS)
>
> Kingfisher is a local-first chess research workstation for
> serious players. The web app is at
> <https://kingfisherchess.app/>; the macOS build
> (`Kingfisher-1.2.6-arm64.dmg`, Apple Silicon, macOS 13 or later,
> Developer ID signed and notarised by Apple) is linked from the same
> page.
>
> Three optional reference packs are published and installable
> from the catalogue:
>
> - **Elite OTB** — the Lichess broadcast archive since 2020,
>   407,538 games, rating- and title-filtered.
> - **Recent Theory** — the last six broadcast months at a
>   2400+ threshold, 11,277 games.
> - **High-Rated Online** — Lichess 2400+ classical, rapid and
>   blitz, a rolling three months, 305,169 games.
>
> Each pack keeps its own licence, provenance and counts. The
> Explorer never produces a single "truth" score that quietly
> blends them. The Lichess masters explorer is available as a
> further source with your own Lichess API token.
>
> The application is open source under the MIT licence. The
> reference data is published in the public
> [`mardakurt/kingfisher-data`](https://github.com/mardakurt/kingfisher-data)
> mirror under the original Lichess licences.
>
> Bug reports, ideas and discussions: <https://github.com/mardakurt/kingfisher>.

## Short social post

> Kingfisher 1.2.6 — a local-first chess research workstation for
> serious players, on the web and as a notarised Mac app. No
> account. No cookies. No subscription. Source on GitHub:
> <https://github.com/mardakurt/kingfisher>

## Technical / open-source post

> **Title:** Kingfisher 1.2.6 — release notes
>
> Kingfisher is a local-first chess research workstation
> (Next.js + Electron). The web app and the Mac app are one
> application: the shell serves the same Next.js build, and the
> whole surface between them is one preload file and one bridge
> module that returns null in a browser.
>
> The reference data is in a separate data-only repository
> ([mardakurt/kingfisher-data](https://github.com/mardakurt/kingfisher-data))
> served as GitHub Pages — not GitHub Releases — because
> release-download redirects do not supply the browser CORS
> permission the application needs.
>
> The macOS build is signed with a Developer ID certificate with
> the Hardened Runtime and five audited entitlements, notarised,
> and stapled; the build refuses to sign a bundle that is missing
> any required runtime file, and launches the signed application
> before archiving it. The default remote CI is typecheck + lint
>
> - test + build; the browser matrix and the packaged desktop
>   gates run on the maintainer's Mac and are recorded in
>   `docs/product/final-certification.md`.
>
> Source under the MIT licence:
> <https://github.com/mardakurt/kingfisher>.

## How to use this kit

Pick the channels that match the audience. The one-sentence
description is for places where 280 characters is the budget.
The 50-word and 150-word descriptions are for places with a
fixed-size summary (Reddit, LinkedIn, etc.). The release
announcement goes on the GitHub release page itself. The
post drafts are starting points — read them aloud, and check
each claim against
[`../product/marketing-facts.md`](../product/marketing-facts.md)
before posting.

Do not post anywhere automatically. The brief is real users
and real feedback from the public release.
