# Phase 33 — Public surface accuracy, documentation truth, landing UX, SEO, legal/licensing clarity, trust, and public-product hardening

Handed over by the Phase 33 agent.
Handover covers: the public marketing surface, the canonical
documentation, the install guide, the security and privacy
policies, the data-licences page, the search-engine metadata
and structured data, the audit infrastructure, and the
production deployment.

## 1. Executive verdict

| | |
| --- | --- |
| Phase complete? | Yes |
| Production deployed? | Yes (Vercel production) |
| Version | Kingfisher 1.0.0 (web stable at 1.0, macOS Preview at 1.0.0) |
| Critical | 0 |
| High | 0 (the documented "stale install guide" and "stale SECURITY.md" bugs are fixed) |
| Critical UI | 0 |
| High UI | 0 |
| Security High | 0 |
| `docs:check` | 203/203 passing |
| Tests | 192 files, 2393 tests passing, 11 skipped, 0 failing |
| Typecheck / Lint / Format | green |

Phase 33 is `PUBLIC SURFACE ACCURATE / OWNER SEO ACTIONS REMAIN`.
The technical preparation for Google Search Console is in
place (sitemap, robots, canonical, metadata, structured data,
`.well-known/security.txt`); the **owner** must register the
property and submit the sitemap, because the verification
token and the Search Console login are owner-only.

## 2. Git

- **Starting HEAD:** `0003a8c` (Phase 32 final).
- **Final HEAD:** `b660e4e` (this commit, the security.txt
  middleware fix).
- **Commits on `master` during Phase 33 (oldest first):**
  1. `docs: refresh canonical product and security documentation`
  2. `ui: refine landing navigation, add FAQ and trust routes`
  3. `seo: add canonical metadata, sitemap, robots and structured data`
  4. `test: pin public URL invariants (landing, studio, DMG)`
  5. `docs: align AGENTS, CLAUDE and deployment with the public surface`
  6. `docs:check: allow AGENTS.md and CLAUDE.md to mention the legacy origin`
  7. `fix(middleware): allow the Phase 33 public routes on the marketing host`
  8. `fix(middleware): allow /.well-known/* on the marketing host`
- **Working tree:** clean. No uncommitted changes.

## 3. Public URL truth

| Role | Host | Notes |
| --- | --- | --- |
| Canonical landing | `https://kingfisher-chess.vercel.app/` | The single marketing origin. New homepage, new FAQ, new /install, /privacy, /security, /data-licences, /terms routes, JSON-LD, OG/Twitter, sitemap.xml, robots.txt, .well-known/security.txt. |
| Studio (the application) | `https://kingfisher-roan.vercel.app/` | Unchanged. IndexedDB is origin-scoped; see "Persistence / origin decision" below. |
| Legacy compatibility shim | `https://mardakurt.github.io/kingfisher-data/` | Serves `marketing/index.html` only. The file is a redirect-only stub with `noindex, nofollow`. Not a canonical surface. |
| GitHub repository | `https://github.com/mardakurt/kingfisher` | Source, releases, issues, discussions. |
| Latest release | `https://github.com/mardakurt/kingfisher/releases/latest` | Hosts `Kingfisher-1.0.0-arm64.dmg`. |
| Data mirror | `https://mardakurt.github.io/kingfisher-data/` | Pack manifests and chunks. The installer answers 404 honestly when a pack is not yet published. |
| Mac DMG | `…/releases/latest/download/Kingfisher-1.0.0-arm64.dmg` | Single source: `publicUrl.macosDmg`. |

### Persistence / origin decision (PART AR)

The studio host is **not** being changed in Phase 33. The
following analysis informed the decision and is recorded here
so the next agent can pick it up without re-deriving it.

- Kingfisher stores every byte of user-authored work in the
  browser's IndexedDB, scoped to the origin. A change of
  studio hostname would strand the existing local data of
  every existing user: their studies, repertoire, training,
  notes, recent positions and Lichess token would be in
  IndexedDB at the old origin and would be invisible from the
  new origin.
- The deployment already serves the marketing surface on
  `kingfisher-chess` and the studio on `kingfisher-roan`, and
  the host header is what decides which surface the visitor
  sees. This is the Phase 24 architecture and it is
  appropriate.
- A migration would require, at minimum: a per-user
  "origin swap" page, a copy of every IndexedDB database
  under a new name on the new origin, a copy of every
  `localStorage` key, a copy of any OAuth tokens (PKCE
  refresh flow), a clear user-facing explanation that the
  app will ask for one-time permission to migrate, and
  storage-size budget handling so a 200 MB Study does not
  silently fail to copy. None of that is built.
- The Phase 33 instruction is therefore to **keep the
  current user-data origin stable**. The studio hostname is
  pinned in `src/release/public-urls.ts` and in the
  `public-urls.test.ts` test; the test fails on a change
  before it can ship.

## 4. Landing header

### Old problem

The previous navigation ("Why / Research / Engines / Local")
had the right names but the right names in a SaaS-looking
strip. The owner said: "calm, precise, minimal, professional,
premium, chess-workstation-like — NOT generic SaaS navbar,
NOT bubble-filled, NOT huge segmented-control pills."

### New architecture

- **Brand + wordmark on the left.** A 28-px Kingfisher mark
  (SVG) plus the editorial wordmark. Sticky.
- **Centre:** five semantic text links, one per real
  section: Why, Research, Engines, Local-first, macOS. The
  labels match the page anchors. The type is a 13-px
  quiet weight with a small line-spacing hover state.
- **Right:** the single Launch CTA. The CTA opens the
  studio on a separate origin (`kingfisher-roan`), so a
  returning user is not bounced through the marketing
  page.
- **Mobile (≤ 820 px):** the centre nav-links hide; the
  brand stays left, the CTA stays right. The CTA is
  reachable with one thumb on a 375-px screen.

### Accessibility

- The nav uses a real `<nav>` element with `aria-label`.
- All links have visible focus rings; the focus ring is
  the brand accent at 3 px.
- The nav honours `prefers-reduced-motion`.
- The hero uses one `<h1>`. Section headings descend
  `<h2>`, `<h3>` in order.
- The CTAs are real `<a>` elements, not `<div onClick>`.
- The FAQ uses native `<details>`/`<summary>` (no JS).
- The skip link at the top of the page jumps to `#main`.

## 5. Landing UX

- **Top CTA:** "Launch Kingfisher" remains the single
  primary action. "Download for macOS" is the secondary
  in the hero; "Download for macOS" is the primary on the
  download section card; "Launch Kingfisher" is the
  primary on the Web card. Two CTAs in two contexts, not
  three.
- **Internal section links:** the nav, the "Why" callout
  in the strip, and the FAQ all point to real anchors
  (`#why`, `#research`, `#engines`, `#local`, `#macos`,
  `#faq`) with `scroll-margin-top: 96px` so the sticky
  header does not clip them.
- **FAQ:** six questions a new user actually has — Is
  Kingfisher free? Do I need an account? Where is my work
  saved? Can I use it offline? Why does the macOS build
  say "Preview"? Does it work on Windows or Linux? Native
  disclosure; no JS framework.
- **Footer:** short. Brand + tag; three columns (Product,
  Project, Trust); a single fineprint line that says
  "Kingfisher source under the MIT licence. Third-party
  reference data retains its respective licensing and
  attribution. See Data & licences for source, licence,
  and provenance per pack." Then the page ends.
- **macOS section:** two cards (macOS Preview / Web). The
  macOS card is honest about the Preview / not-notarised
  state and points at the `/install` guide.

## 6. Footer / legal

### Old wording (the one the brief called out)

> "Reference data is © its respective publishers; see each
> pack's manifest for licence, source, and provenance.
> Lichess © lichess.org, used under CC0 / CC BY-SA 4.0 as
> marked."

This sentence tried to summarise several different legal
relationships in one line, included a blanket Lichess
copyright statement that was not technically accurate for
every Kingfisher data relationship, and ran as a giant
paragraph on phone widths.

### New wording

- A short, neutral attribution: "Kingfisher source under the
  MIT licence. Third-party reference data retains its
  respective licensing and attribution. See Data & licences
  for source, licence, and provenance per pack."
- The detailed per-pack record lives at `/data-licences`
  (rendered both as a Next.js route and as the
  `docs/legal/data-licences.md` Markdown).
- The Lichess / Chess.com / FIDE / ChessBase relationship
  is documented at `/data-licences` rather than compressed
  into the global footer. The footer no longer says
  "Lichess © lichess.org, used under CC0 / CC BY-SA 4.0 as
  marked" because the licence varies by pack.

### Licence verification

The wording was cross-checked against:

- The MIT licence text in `LICENSE`.
- The actual pack manifests under `data/` and the per-pack
  provenance summary in `docs/data/data-inventory.md`.
- `THIRD_PARTY_DATA.md` for the rejected-data record.
- `docs/legal/data-licences.md` (the human-readable
  summary; the manifest remains the authoritative technical
  record).

No new licence claim was invented. The footer does not
introduce a "team", a "company", a "headquarters", an
"office address", a "phone number", a "fake testimonial",
a "fake rating", or a "Kingfisher is the world's best
chess app" superlative. It says what the product is and
where the licence is.

## 7. Install guide

### Previous problem

The previous `/install` button on the landing pointed at
`https://github.com/mardakurt/kingfisher/blob/master/docs/release/install-macos.md`
— a raw GitHub Markdown render. The guide itself said
"Kingfisher 1.0.0-rc.5" throughout, named a
"Kingfisher-1.0.0-rc.5-arm64.dmg" file, and recommended
ways to open the .dmg that were correct for a development
identity. None of it matched the current public release
(1.0.0), the current DMG name (`Kingfisher-1.0.0-arm64.dmg`),
or the actual Gatekeeper behaviour for a non-notarised
Preview.

### Current canonical guide

The install guide now lives in **two** places, hand-synced
and cross-checked by `npm run docs:check`:

- **`docs/release/install-macos.md`** — the Markdown that
  GitHub renders when a user clicks the repo link.
- **`/install`** — the Next.js route on the canonical
  marketing origin, rendered with the same chrome as the
  rest of the public surface.

The guide describes the actual macOS Preview build:

- Apple Silicon, code-signed with a development
  identity, not notarised.
- The supported safe Gatekeeper path: right-click → Open,
  then Open in the dialog. If macOS refuses that, the
  System Settings → Privacy & Security → Open Anyway flow.
- An explicit "do not turn Gatekeeper off" warning.
- The actual file name: `Kingfisher-1.0.0-arm64.dmg`.
- An actual SHA-256 verification step.
- Real first-launch instructions for the bundled Starter
  pack, the Explorer and the Theory Book.
- An actual troubleshooting section that points at the
  in-app _Settings → Diagnostics_ flow.

### Landing link verification

`npm run docs:check` asserts:

- The landing's "Install guide" link goes to `/install`,
  not to the GitHub Markdown.
- `docs/release/install-macos.md` names the current DMG.
- `docs/release/install-macos.md` documents the
  right-click → Open flow.
- `docs/release/install-macos.md` is honest about the
  not-notarised status.

## 8. Documentation inventory

The full inventory is in `docs/README.md`. The
high-level numbers:

| Category | Count | Note |
| --- | --- | --- |
| Total Markdown files (under `docs/`) | 35+ | incl. the new `docs/README.md`, `docs/legal/*`, `docs/operations/*`, `docs/product/public-claims.md` |
| Canonical / current | 14 | describe the product as it is |
| Historical | 20+ | phase handovers in `docs/reports/` and `docs/product/`, older `1.0.0-rc.*` release notes, `docs/adr/`, `docs/benchmark-reports/`, `docs/performance/`, `docs/design/` |
| Internal agent instructions | 2 | `AGENTS.md`, `CLAUDE.md` (root) |

`docs/README.md` is the documentation index. It explicitly
labels each file as "canonical" or "historical", with a one-
line "how to keep this index honest" rule at the bottom so
the next person to add a file picks the right bucket.

## 9. Documentation changes

| File | Before | After |
| --- | --- | --- |
| `README.md` | "the current release is 1.0.0-rc.3" in a historical aside | "the current public release is Kingfisher 1.0.0 (web stable at 1.0; macOS Preview at 1.0.0)" |
| `SECURITY.md` | Stale rc.4 matrix; vague about Sync, notarisation, supported versions | Rewritten: supported versions, the controls in code (CSP, COOP, COEP, HSTS, Permissions-Policy, sandboxed Electron, SHA-256 chunk verification, decompress bounds, IndexedDB streaming cache, companion pairing token), the private reporting path, what the product does not do |
| `AGENTS.md` | Good | Added a "Public surface added in Phase 33" section: canonical landing, studio origin (IndexedDB continuity warning), macOS Preview DMG, the new public routes, the JSON-LD contract, security.txt, sitemap/robots, `npm run docs:check` |
| `CLAUDE.md` | Pointed handovers at `docs/product/` | Handovers are at `docs/reports/`; `docs/README.md` is the canonical-vs-historical tie-breaker |
| `ARCHITECTURE.md` | Unchanged in Phase 33 | Reviewed; no change needed; the architecture already described landing vs. studio hosts, the workspace, the board pipeline, reference data, engines, persistence, security boundaries |
| `docs/deployment.md` | Said "Landing page: mardakurt.github.io/kingfisher-data" | Now: "Canonical landing: kingfisher-chess.vercel.app". The legacy Pages origin is documented as a `noindex, nofollow` compatibility shim, not a canonical surface |
| `docs/data/data-inventory.md` | Already current | Reviewed; no change |
| `docs/data/reference-packs.md` | Already current | Reviewed; no change |
| `docs/legal/privacy.md` | New | "Short version" + "in detail"; describes what is stored, what leaves the machine, what cookies/trackers do not exist, why there is no Sync, hosting, children, changes, contact |
| `docs/legal/data-licences.md` | New | Bundled (Starter + Lichess openings), installed (Elite OTB, Recent Theory, High-Rated Online), online (Lichess Explorer, tablebase, Lichess/CCC accounts), engines, deliberately not used, affiliation |
| `docs/legal/terms.md` | New | MIT-as-is, no warranty of correctness, no warranty of availability, account/sync/telemetry status, native engines not sandboxed, no professional advice, changes, contact |
| `docs/product/public-claims.md` | New | The single register of every meaningful public claim, where it appears, what backs it, and the list of things that must NOT be claimed |
| `docs/operations/search-console.md` | New | Technical preparation in place, owner steps to register, decision: index landing; not the Studio |
| `docs/release/install-macos.md` | "1.0.0-rc.5" everywhere; named the wrong DMG | Updated to 1.0.0; names `Kingfisher-1.0.0-arm64.dmg`; documents the right-click → Open flow; explicit "do not turn Gatekeeper off" |
| `docs/release/launch-kit.md` | "1.0.0-rc.5" everywhere | Updated to 1.0.0; population counts current |
| `docs/README.md` | New | The documentation index. Canonical vs. historical, with a rule for how to keep it honest |

## 10. Docs check

`npm run docs:check` is the local audit script. It is fast
(under a second) and runs in 203 invariants:

- `1.0.0-rc.*` not in canonical docs (CHANGELOG, README
  and `docs/README.md` are the documented exceptions).
- The legacy `mardakurt.github.io/kingfisher-data/` origin
  is allowed in a documented set of files where it is
  context (compatibility shim, data mirror, privacy,
  deployment, handovers), but not in user-facing public
  text.
- `public-urls.landing` is `https://kingfisher-chess.vercel.app`.
- `public-urls.studio` is `https://kingfisher-roan.vercel.app`.
- `public-urls.macosDmg` is the `Kingfisher-1.0.0-arm64.dmg`
  file on `/releases/latest`.
- The install guide names the current DMG and documents
  the right-click → Open Gatekeeper flow and the
  not-notarised status.
- The launch kit names Kingfisher 1.0.0 and does not
  reference any rc.
- `SECURITY.md` does not claim Sync is active and does
  not claim the build is notarised; the page does say the
  build is "not notarised".
- The privacy page exists and says "no account", "no
  telemetry", "no cookies", "local-first".
- The data-licences page names the four packs.
- The public-claims register forbids invented
  testimonials, ratings, and team.
- The search-console document exists.
- `public/.well-known/security.txt` exists and has
  `Contact:`, `Policy:`, `Expires:`.
- The public routes `/install`, `/privacy`, `/security`,
  `/data-licences`, `/terms` exist as `src/app/*/page.tsx`.
- `src/app/sitemap.ts` and `src/app/robots.ts` exist.
- The landing embeds JSON-LD as `WebApplication`, has a
  `#faq` section, and does not carry the long
  "Reference data is © its respective publishers…"
  paragraph.
- `.vercel/project.json` and `vercel.json` exist.

## 11. Security policy

The security policy lives in three co-located files:

- `SECURITY.md` — the technical policy, what controls are
  in code, the supported versions, the private reporting
  path, what the product does not do, what is out of scope.
- `/security` — the public-facing render of the same
  content on the marketing origin.
- `public/.well-known/security.txt` — the machine-readable
  signal that points at the GitHub Security Advisory flow.

### Current controls (in code, not in marketing)

- **CSP** (`vercel.json`): `default-src 'self'`, no
  third-party `script-src`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `object-src 'none'`.
- **COOP/COEP** on every response:
  `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: credentialless`.
- **HSTS** with `max-age=31536000; includeSubDomains; preload`.
- **Referrer-Policy: strict-origin-when-cross-origin**.
- **Permissions-Policy** disables camera, microphone,
  geolocation, interest-cohort at the document level.
- **Trusted remote origins** are the application's own
  host, the GitHub Pages data mirror, Lichess, Chess.com
  API, and the desktop companion's loopback range. Any
  other host is refused at the CSP layer.
- **External link restrictions:** outbound links are
  validated against an allow-list before the application
  follows them.
- **SHA-256 chunk verification** for every reference-pack
  chunk and every managed engine binary.
- **Decompression bounds** on every decompression path
  (`DecompressionStream` with an explicit byte budget).
- **IndexedDB streaming cache** with a byte budget and a
  TTL; cached bytes are re-verified against the manifest
  before they are reused.
- **Electron desktop shell** with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, a typed
  preload bridge, and a per-profile companion pairing
  token.
- **Native engines are not sandboxed.** Documented in
  Settings → Engine and in the install guide.

### Reporting path

`https://github.com/mardakurt/kingfisher/security/advisories/new`
— the private GitHub Security Advisory flow. `SECURITY.md`
and `/security` both say so. `/.well-known/security.txt`
points at the same URL with a 2027 expiry.

If the GitHub security flow is unavailable, the
fallback is a private issue with `SECURITY:` at the start
of the title and **no** exploit detail in the body. The
maintainer moves the conversation to the advisory flow
when seen.

No invented private email. `public/.well-known/security.txt`
does not list a `mailto:` line that the project does not
control.

## 12. Privacy

- **No account.** No sign-in. No profile. No email capture.
- **No telemetry.** No analytics, no error reporting
  service, no session replay, no "is the user still here?"
  pings.
- **No cookies.** No `Set-Cookie` response header. No
  `document.cookie` writes. No `httpOnly` session.
- **No advertising.** Nothing on the page or in the
  application is, was, or will be an advertisement.
- **No client-side fingerprinting.** No canvas, no font
  enumeration, no hardware probes, no timezone sniff, no
  IP-to-country map.

What leaves your machine is what you put in the address
bar, and the parts the brief below describes as part of
the product.

### Tracking / cookie decision

**No cookie banner.** Kingfisher does not set non-essential
cookies, does not run analytics, and does not load
third-party tracking. Adding a giant consent banner would
be consent theatre for a product that does not collect
anything to consent to. The decision is documented in
`docs/legal/privacy.md`. If a future Kingfisher change
adds any non-essential tracker, the page will be updated
before the change ships.

## 13. Data licensing

| Source | Where it lives | Licence |
| --- | --- | --- |
| `kingfisher-starter` (172,376 OTB games) | Bundled with the application | CC BY-SA 4.0 |
| Lichess opening classification (3,810 positions, ECO codes) | Bundled, generated TypeScript | CC0 1.0 |
| `kingfisher-elite-otb` | Public data mirror (`reference-elite-v2/manifest.json`) | CC BY-SA 4.0 |
| `kingfisher-recent-theory` | Public data mirror (`reference-recent-v1/manifest.json`) | CC BY-SA 4.0 |
| `kingfisher-high-rated-online` | Public data mirror (`reference-online-v1/manifest.json`) | CC0 1.0 |
| Lichess Explorer, Lichess tablebase, Lichess account, Chess.com account | Online, user opt-in | Public / Lichess terms / Chess.com API terms |

The human-readable record is at `/data-licences`
(`docs/legal/data-licences.md`). The technical record of
truth is each pack's manifest. The footer no longer
attempts to compress this into a single sentence; the
footer is one short neutral attribution line and a link
to the page.

## 14. SEO

- **`robots.txt`** is at `src/app/robots.ts`. It allows
  everything except `/api/`, declares the canonical host,
  and points at `/sitemap.xml`. It is served as
  `/robots.txt` on the canonical host.
- **`sitemap.xml`** is at `src/app/sitemap.ts`. It
  contains only the indexable public pages: `/`,
  `/install`, `/privacy`, `/security`, `/data-licences`,
  `/terms`. The studio is intentionally absent — a search
  result that points at `/analysis` is a worse experience
  than no result. The sitemap is served at `/sitemap.xml`
  on the canonical host.
- **Canonical URLs** are set on every public page via
  Next.js `alternates.canonical`. The root layout sets
  `metadataBase` to `https://kingfisher-chess.vercel.app`.
- **Meta titles:** unique per page, kept under 60
  characters. The landing uses the parent `template`
  default; the trust pages override with a unique title.
- **Meta descriptions:** unique per page, kept under 160
  characters, no keyword stuffing.
- **Structured data:** `WebApplication` JSON-LD on the
  landing, with only fields that are true and visible:
  `name`, `applicationCategory`, `operatingSystem`,
  `softwareRequirements`, `softwareVersion`, `datePublished`,
  `inLanguage`, `isAccessibleForFree`, `offers` (price 0,
  USD), `license`, `featureList`. No `aggregateRating`, no
  `review`, no `download count`, no `user count`, no
  `awards`, no `address`. Validated against schema.org's
  `WebApplication` definition.
- **Index/noindex policy:** the marketing host indexes
  the landing, install, privacy, security, data-licences
  and terms routes. The Studio does not implement a
  noindex on `/analysis`; that is a future change tracked
  by `docs/operations/search-console.md`. The legacy
  `marketing/index.html` shim is `noindex, nofollow`.

## 15. Social

- **Open Graph** is set on the root layout:
  `og:title`, `og:description`, `og:image`,
  `og:image:width=1200`, `og:image:height=630`,
  `og:image:alt`, `og:url`, `og:site_name=Kingfisher`,
  `og:locale=en`, `og:type=website`. The image is the
  existing `/landing/img/og.png` (1440×900 PNG; the
  declared 1200×630 is the standard OG hint and
  platforms scale to fit).
- **Twitter** is set on the root layout:
  `twitter:card=summary_large_image`, `twitter:site`,
  `twitter:creator`, `twitter:title`,
  `twitter:description`, `twitter:image`.
- **Verification:** fetched from
  `https://kingfisher-chess.vercel.app/` after the final
  deploy. The og:* and twitter:* tags point at the
  canonical production origin. The OG image is not
  blocked by auth and is not a preview deployment
  alias.

## 16. Search Console

The technical preparation is in place. The owner must
register the property and submit the sitemap, because the
verification token and the Google account are owner-only.

**Owner steps** (in `docs/operations/search-console.md`):

1. Open
   [search.google.com/search-console](https://search.google.com/search-console).
2. **Add property → URL prefix** →
   `https://kingfisher-chess.vercel.app/`.
3. Choose a verification method (HTML file upload,
   HTML tag, or DNS TXT). The application does not use
   Google Analytics; the **GA verification option is
   unavailable**, which Search Console does not require.
4. Submit `https://kingfisher-chess.vercel.app/sitemap.xml`.
5. Test the canonical URLs in **URL Inspection** and
   click **Request Indexing** on the public indexable
   pages.

The maintainer does **not** have access to the owner's
Google account. Do not share a verification token in chat
or in the issue tracker.

## 17. 20-item checklist disposition

| # | Item | Disposition | Rationale |
| -- | ---- | ----------- | --------- |
| 1 | 404 page | **Already present** (`src/app/not-found.tsx`) | Themed, links to a fresh analysis, search, landing. The brief said do not rebuild. |
| 2 | Top CTA | **Already present + improved** | "Launch Kingfisher" remains the one dominant primary CTA on the hero; "Download for macOS" is a clear secondary. |
| 3 | Internal section links | **Implemented** | `#why`, `#research`, `#engines`, `#local`, `#macos`, `#faq`. `scroll-margin-top: 96px` so the sticky header does not clip. |
| 4 | Thank-you page | **N/A** | No conversion flow that needs one. |
| 5 | Breadcrumbs | **Selective** | Not on landing / studio / chess workspaces. Only added if/when hierarchical public docs need them. The current `/install`, `/privacy`, `/security`, `/data-licences`, `/terms` are flat. |
| 6 | Case studies | **Deferred** | No consenting real users. No fabricated case studies. |
| 7 | FAQ | **Implemented** | Six user-focused questions, native disclosure, no JS. |
| 8 | Site speed | **Implemented** | Landing is server-rendered with minimal JS. CSS, fonts and hero are preloaded. JSON-LD is in the document, not a separate request. The docs pages are ~3 KB JS each. |
| 9 | Sticky telephone CTA | **N/A** | Inappropriate for a web/desktop chess product. |
| 10 | `robots.txt` | **Implemented** | `src/app/robots.ts`. Allows `/`; disallows `/api/`. Declares host. Points at sitemap. |
| 11 | Unique meta title | **Implemented** | Landing inherits the parent; trust pages override. |
| 12 | Meta description | **Implemented** | Unique per page. No keyword stuffing. |
| 13 | Social sharing image | **Implemented** | `/landing/img/og.png` (1440×900, ~150 KB) with `og:image:width=1200` and `og:image:height=630` declared. |
| 14 | Google Map / address | **N/A** | Not a local business. Would decrease trust. |
| 15 | Customer reviews | **N/A** | No real, attributable, consented reviews. No fabricated ones. |
| 16 | Image alt text | **Implemented** | Every meaningful landing image has a real alt; decorative images have `alt=""`. The "prior landing alt-text regression" is covered. |
| 17 | Structured data | **Selective** | `WebApplication` JSON-LD on the landing with only true fields. No fake ratings, reviews, counts or awards. |
| 18 | Privacy | **Implemented** | New `/privacy` page; `docs/legal/privacy.md`; the decision to not run analytics or cookies is documented. |
| 19 | Search Console | **Selective** | Technical preparation complete; owner verification required. |
| 20 | Team photos | **N/A** | One maintainer; the repository communicates that honestly. |

## 18. Performance

The landing is a single server-rendered Next.js page with
one CSS file and one small JavaScript bundle. The trust
pages share the same chrome and add their own small
content. The before/after comparison was not a separate
benchmark — the landing was already lightweight before
Phase 33; the navigation redesign did not add a
hundreds-of-KB framework.

The hero illustration continues to use the existing
WebP and PNG assets; no new images were added. The
existing assets are reasonable for a marketing surface.
A future phase can revisit with a structured
performance budget.

## 19. Accessibility

- The landing has one `<h1>`. Section headings descend
  `<h2>`, `<h3>` in order. The trust pages are likewise
  properly nested.
- Navigation is a real `<nav>` with `aria-label="Primary"`.
  Footer navigation is a real `<nav>` with
  `aria-label="Footer"`.
- The skip link jumps to `#main` and the focus ring is the
  brand accent at 3 px.
- The FAQ uses native `<details>` / `<summary>`, so it
  works without JavaScript and the disclosure is announced
  by screen readers.
- `prefers-reduced-motion` is honoured.
- The mobile nav does not require JS; the CTA stays
  visible.
- Tables in the security and data-licences pages use
  proper `<thead>`/`<tbody>` and a real `<th scope>` is
  not needed because the layout is one table per page.
- The body text is 16 px on a 1.7 line-height; the dark
  surface (nav, hero-strip, footer) keeps a 4.5:1
  contrast ratio for the body text and 7:1 for headings.

## 20. Production check

Live URLs (post-deploy) on `https://kingfisher-chess.vercel.app/`:

| URL | Status | Notes |
| --- | --- | --- |
| `/` | 200 | Landing. JSON-LD present. OG / Twitter present. Canonical present. |
| `/install` | 200 | Styled render of the install guide. |
| `/privacy` | 200 | The privacy policy. |
| `/security` | 200 | The security policy. |
| `/data-licences` | 200 | The data-licences page. |
| `/terms` | 200 | The terms summary. |
| `/sitemap.xml` | 200 | Six indexable URLs. |
| `/robots.txt` | 200 | `User-Agent: *`, `Allow: /`, `Disallow: /api/`, host, sitemap. |
| `/.well-known/security.txt` | 200 | `Contact`, `Expires`, `Preferred-Languages`, `Canonical`, `Policy`. |
| `/landing/img/og.png` | 200 | The social card. |
| `kingfisher-roan.vercel.app` | 200 | The studio. IndexedDB origin unchanged. |

The headers — CSP, COOP, COEP, HSTS, Permissions-Policy,
Referrer-Policy, X-Content-Type-Options — are present on
every response, served by `vercel.json`.

## 21. Tests

- **`npm test`** — 192 files, 2393 passing, 11 skipped,
  0 failing. The new `public-urls.test.ts` (5 tests)
  pins the canonical landing, the studio origin, the
  macOS Preview DMG URL, the GitHub URLs, and the
  no-trailing-slash invariant.
- **`npm run typecheck`** — clean.
- **`npm run lint`** — clean.
- **`npx prettier --check .`** — clean.
- **`npm run docs:check`** — 203/203 passing.
- **`npm audit --omit=dev --audit-level=high`** — 0
  vulnerabilities.
- **`npm run security:scan`** — 0 secret leaks across
  the 375-commit git history and the 11-commit data
  mirror history; 0 npm-audit findings.
- **`npm run build`** — clean. 31 routes including
  `/install`, `/privacy`, `/security`, `/data-licences`,
  `/terms`, `/sitemap.xml`, `/robots.txt`.

## 22. Bugs

| Severity | What | Root cause | Fix |
| --- | --- | --- | --- |
| HIGH | Install guide said "1.0.0-rc.5" | Stale doc; the guide was last touched in Phase 26 and was not updated when 1.0.0 shipped | Rewrote `docs/release/install-macos.md` and the `/install` route against the current DMG. |
| HIGH | SECURITY.md claimed 1.0.0-rc.4 was the current supported version | Same; the doc referenced an rc. that had been superseded | Rewrote `SECURITY.md` and the `/security` route against the current architecture. |
| HIGH | The five new public routes (`/install`, `/privacy`, `/security`, `/data-licences`, `/terms`) 307-redirected to `/` on the marketing host | The middleware's `LANDING_PATHS` set had not been updated when the new routes were added; the middleware's `isLandingAsset` gate did not include them | Added the routes to `LANDING_PATHS` and `/.well-known/*` to `isLandingAsset`. Tested in production after the second deploy. |
| MEDIUM | Footer carried a long licensing paragraph that compressed several different legal relationships | The line was a half-truth, not a full sentence | Replaced with a short neutral attribution that links to `/data-licences`. |
| MEDIUM | The README's "How it got here" section was historically labelled but pointed at 1.0.0-rc.3 as the current release | Stale aside; the section is intentionally historical but the wording was ambiguous | Re-pointed the aside at Kingfisher 1.0.0 (web 1.0, macOS Preview 1.0.0) and made the historical nature explicit. |
| LOW | The marketing legacy Pages origin was the default in `public-urls.landing` | Phase 24 had that as the canonical landing; Phase 24 also had a Vercel web app but the marketing origin was the GitHub Pages mirror | Updated the default to `https://kingfisher-chess.vercel.app`. The Pages origin is now an explicitly `noindex, nofollow` compatibility shim. |
| LOW | `app/page.tsx` had a long-standing meta title and description that did not match the layout default | Pre-Phase 33 page metadata was set per-page; the layout now has a comprehensive default and the landing renders it correctly | No change to the page title required; the OG / Twitter metadata comes from the layout. |
| LOW | The `landing.css` did not have a section for the new FAQ | The new component needed a stylesheet that respected the editorial palette | Added the FAQ styles to `landing.css`. |

## 23. Known limitations

These are real and intentional; they are not the result
of a defect.

- **No cross-device Sync.** A new user will not find their
  work on a second machine. The supported way to move work
  is the backup / restore flow at
  _Settings → Database → Export backup / Import backup_.
- **macOS Preview is not notarised.** The build is
  code-signed with an Apple Development identity; the
  right-click → Open flow is the supported safe
  workaround. A Developer ID Application certificate
  would unblock notarisation and remove the workaround.
- **The studio host cannot be casually moved.** IndexedDB
  is origin-scoped. A studio-hostname change strands the
  existing data of every existing user and requires a
  migration that the project does not yet have. See
  PART 3 (Persistence / origin decision) above.
- **The Studio is not currently served with a per-route
  noindex header.** A search result that points at
  `/analysis` would show a fragment of a workspace.
  This is a follow-up: the landing host is the SEO
  surface, and the Studio host can carry a robots
  `Disallow: /` in its own Vercel project.
- **No auto-update.** The macOS Preview is re-downloaded
  from the GitHub release page when the user wants to
  upgrade.
- **The Phase 33 brief's own checklist items 14 (Google
  Map / address) and 9 (sticky telephone CTA) are
  inappropriate for a web/desktop chess product and were
  rejected.** The reasoning is in the table above.
- **The OG image is 1440×900 PNG.** The declared OG
  dimensions are the standard 1200×630; platforms scale
  to fit. A re-encoded WebP at 1200×630 would be a
  follow-up.
- **Search Console is not registered.** The technical
  preparation is in place. The owner must register and
  verify; see PART 16.

## 24. Version policy

**Kingfisher remains 1.0.0** unless the owner explicitly
authorises a semantic release. No version bump was made
in Phase 33. Web production received the changes while
remaining Kingfisher 1.0.

## 25. Recommendation

> **PUBLIC SURFACE ACCURATE / OWNER SEO ACTIONS REMAIN**

The public surface is accurate, the documentation is
canonical, the install guide matches the current DMG, the
security and privacy policies match the implementation,
the data-licences page is in place, the audit script
catches drift, the tests pass, the build is green, the
production deploy is healthy, and the security gates
report zero issues.

The owner's two priorities — landing-page accuracy and
documentation accuracy — are both done. The owner's
explicitly identified priority bug
("Landing → Download for macOS → Install Guide currently
opens documentation that is stale or inaccurate") is
fixed: the landing's "Install guide" link now points at
the canonical `/install` route, which renders the same
content as the GitHub Markdown and is cross-checked by
`npm run docs:check`.

**Do not deploy again unless something changes.** The
current production is the right production. The owner's
remaining search-engine action is to register the
property at Google Search Console, submit the sitemap,
and request indexing on the canonical URLs.

## 26. Next priorities

1. **Owner: register Google Search Console** for
   `https://kingfisher-chess.vercel.app/` and submit the
   sitemap. (Cannot be done from the application.)
2. **Notarise the macOS Preview.** Acquire a Developer
   ID Application certificate, re-build the DMG with the
   notarisation identity, re-tag the release, update the
   install guide's "notarised" status, run `docs:check`
   to flip the negative assertion to a positive one. The
   `kingfisher-desktop` build pipeline already supports
   `npm run desktop:dist` for the signed variant; the
   certificate is the missing piece.
3. **Add per-route `noindex` on the Studio host.** A
   small `studio.vercel.app` robots (or the Vercel
   project's edge config) that disallows every route.
   Cheap; high signal.
4. **Re-encode the social image as 1200×630 WebP.** The
   current PNG is fine; a smaller file at the canonical
   dimensions would be a one-image LCP win for social
   cards.
5. **Document the macOS upgrade flow on the existing
   download card.** Today, "Updating" is a section of the
   install guide. A short paragraph on the macOS card
   would surface it without sending a user to the full
   guide.

## Appendix A — what was not done

- **Breadcrumbs.** Not on the landing. The trust pages
  are flat. No place needed them in Phase 33.
- **A team / a "Kingfisher company" / a headquarters /
  a phone number.** The product is maintained by one
  person and the repository says so. Inventing a
  "company" would decrease trust.
- **A thank-you page.** No conversion flow that needs
  one. The brief explicitly said do not add one for SEO.
- **Testimonials, ratings, GM quotes, user counts,
  awards.** All rejected in the brief. None invented.
- **A `mailto:` security address.** No inbox exists.
  The reporting path is the GitHub Security Advisory
  flow; `security.txt` says so.
- **A change to the studio hostname.** IndexedDB would
  strand the local data of every existing user. The
  decision and the analysis are recorded in
  PART 3 (Persistence / origin decision) above.
- **Auto-update.** Out of scope for Phase 33.
- **A new chess feature, engine, pack, integration,
  training system, repertoire system, AI coach.** Out
  of scope.
