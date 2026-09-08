# Launch kit — Kingfisher 1.0.0-rc.4

The copy prepared for first channels. Replace placeholders before
publishing.

## One-sentence description

Kingfisher is a local-first chess research workstation for
serious players — opening research across separate evidence
sources, native engines, large personal databases, repertoire
and review.

## 50-word description

Kingfisher is a local-first chess workstation for serious
players. Opening research across separate evidence sources,
Stockfish in the browser, native engines on macOS, large
personal databases, repertoire and review. No account, no
telemetry, no subscription. Web and macOS. Open source under
the MIT licence.

## 150-word description

Kingfisher is a local-first chess research workstation for
serious players. The application brings together opening
research across separate evidence sources — Elite OTB, Recent
Theory, High-Rated Online and a bundled offline Starter —
native engines on macOS (Stockfish, Berserk, Halogen, Koivisto,
Lc0 and more, all digest-verified), large personal SQLite
databases with position, structure and player search, and the
everyday study workflow (Studies, Repertoire, Review,
Training). The web build runs Stockfish 18 as WebAssembly in
the browser. The macOS build is a native Electron shell
serving the same application. Nothing leaves your machine
that you did not put in the address bar — no account, no
telemetry, no upload. The reference data is published in the
open <https://github.com/mardakurt/kingfisher-data> mirror
under the original Lichess licences. The application source
is open source under the MIT licence.

## GitHub release announcement

> ## Kingfisher 1.0.0-rc.4 — public preview
>
> The first public release of Kingfisher. The web app is live,
> the macOS preview is downloadable, the optional reference
> data is published, and the source is open on GitHub.
>
> **What's in it**
>
> - **Web app** at <https://mardakurt.github.io/kingfisher-data/>
>   — Stockfish 18 in the page, no install.
> - **macOS preview** (`Kingfisher-1.0.0-rc.4-arm64.dmg`) — Apple
>   Silicon, code-signed. _Not notarized yet_ — right-click →
>   Open on the first launch.
> - **Optional reference data**, installable from a fresh
>   profile: Elite OTB (407,538 games), Recent Theory (44,200
>   games), High-Rated Online (305,169 games). The bundled
>   Kingfisher Starter is offline-ready out of the box.
> - **Source-comparison Explorer** — every source keeps its own
>   licence, provenance and counts. The Explorer never produces
>   a single "truth" score that quietly blends them.
> - **Diagnostics that are answerable** — Settings → Diagnostics
>   has a _Copy support information_ line and a _Copy full
>   diagnostic report_ button, both with credentials redacted.
> - **No account, no telemetry, no subscription.**
>
> **Known limitations**
>
> - macOS preview is not notarized.
> - No auto-update.
> - Windows and Linux build but are unsupported. The supported
>   desktop platform is Apple Silicon.
> - No games before 2020 in any first-party source.
>
> **Reporting problems** — open an issue, paste the support
> information line, and the maintainer will turn your report
> into a test.
>
> Source, releases and issues: <https://github.com/mardakurt/kingfisher>

## Reddit (r/chess, r/ComputerChess) post draft

> **Title:** Kingfisher 1.0.0-rc.4 — a local-first chess research
> workstation is now in public preview
>
> I've been building Kingfisher for the last couple of years: a
> local-first chess research workstation for serious players, with
> opening research across separate evidence sources (Elite OTB,
> Recent Theory, High-Rated Online), Stockfish in the browser,
> native engines on macOS, large personal databases with position
> and structure search, and a daily-study workflow (Studies,
> Repertoire, Review, Training).
>
> It is local-first: no account, no telemetry, no subscription. No
> data leaves your machine that you didn't put in the address bar.
>
> The 1.0.0-rc.4 public preview is now live:
>
> - Web app: <https://mardakurt.github.io/kingfisher-data/>
> - macOS preview: <https://github.com/mardakurt/kingfisher/releases/latest>
> - Source (MIT): <https://github.com/mardakurt/kingfisher>
>
> The macOS build is a preview, not a notarized release. The
> install guide is the right-click-Open dance for now. A
> Developer ID Application certificate is the missing piece.
>
> I am looking for real bug reports, real workflows, and real
> feedback from club players, coaches, and engine/database
> enthusiasts. Each reported defect is either reproducible (and
> becomes a test) or it is a question about what the product
> should do, and either is useful.

## Lichess forum post draft

> **Title:** Kingfisher 1.0.0-rc.4 — public preview (web + macOS)
>
> Kingfisher is a local-first chess research workstation for
> serious players, and the first public preview is now live.
>
> The web app is at <https://mardakurt.github.io/kingfisher-data/>.
> The macOS preview (`Kingfisher-1.0.0-rc.4-arm64.dmg`, Apple
> Silicon, code-signed but not notarized) is on the
> [GitHub releases page](https://github.com/mardakurt/kingfisher/releases/latest).
>
> Three optional reference packs are now published and
> installable from the catalogue:
>
> - **Elite OTB** — broadcast archive since 2020, 407,538 games.
> - **Recent Theory** — last two years at a low frequency
>   threshold, 44,200 games.
> - **High-Rated Online** — Lichess 2400+ classical, rapid and
>   blitz, one month, 305,169 games (overwhelmingly blitz).
>
> Each pack keeps its own licence, provenance, and counts. The
> Explorer never produces a single "truth" score that quietly
> blends them.
>
> The application is open source under the MIT licence. The
> reference data is published in the public
> [`mardakurt/kingfisher-data`](https://github.com/mardakurt/kingfisher-data)
> mirror under the original Lichess licences.
>
> Bug reports, ideas and discussions: <https://github.com/mardakurt/kingfisher>.

## Short social post

> Kingfisher 1.0.0-rc.4 is in public preview — a local-first
> chess research workstation for serious players, on the web
> and on macOS. No account. No telemetry. No subscription.
> Source on GitHub: <https://github.com/mardakurt/kingfisher>

## Technical / open-source post

> **Title:** Kingfisher 1.0.0-rc.4 — release notes
>
> Kingfisher is a local-first chess research workstation
> (Next.js + Electron). 1.0.0-rc.4 is the first public
> preview, with the public landing page live, the optional
> reference data published, the macOS preview build
> downloadable, and the source repository public.
>
> The reference data is in a separate data-only repository
> ([mardakurt/kingfisher-data](https://github.com/mardakurt/kingfisher-data))
> served as GitHub Pages — not GitHub Releases — because
> release-download redirects do not supply the browser CORS
> permission the application needs.
>
> The default remote CI is now a typecheck + lint + test +
> build with `paths-ignore` for documentation, brand assets
> and the landing page. The heavy gates (full Playwright
> suite, desktop packaging, engine fleet, long soak) are
> deliberately manual workflows. GitHub Actions minutes are
> scarce; the local suite is the gate.
>
> Source under the MIT licence:
> <https://github.com/mardakurt/kingfisher>.

## How to use this kit

Pick the channels that match the audience. The one-sentence
description is for places where 280 characters is the budget.
The 50-word and 150-word descriptions are for places with a
fixed-size summary (Reddit, LinkedIn, etc.). The release
announcement goes on the GitHub release page itself. The
post drafts are starting points — replace placeholders,
read them aloud, and check that the local news is honest.

Do not post anywhere automatically. The brief is real users,
real feedback, and the first weeks of public preview.
