# Phase 24 security review

A broad security review of the Kingfisher public surface as it
exists at the end of Phase 24. The review is intentionally
narrow: it is the local, repeatable, gate-friendly audit. The
deeper audit a Phase 25 might commission would be a paid
external review; this document is the trail the maintainer can
hand to a future security responder.

This document is safe to publish. It does not contain any
secret value, token, or credential; the secret scan results
are redacted at write time.

## Scope

In scope:

- The `mardakurt/kingfisher` GitHub repository: source tree,
  full git history, all branches and tags.
- The `mardakurt/kingfisher-data` GitHub repository: source
  tree, full git history, all branches and tags.
- The GitHub Pages site at <https://mardakurt.github.io/kingfisher-data/>.
- The `Kingfisher-1.0.0-rc.4-arm64.dmg` artefact attached to
  the v1.0.0-rc.4 release.
- The production Next.js web build (`next build`) as it would
  be deployed to Vercel from this repository.
- The Electron desktop shell (`desktop/`) and the companion
  (`companion/`).
- GitHub Actions workflows under `.github/workflows/`.
- `npm audit` against the production runtime.

Out of scope:

- The engine binaries themselves. Each engine is third-party
  and ships under its own licence. Kingfisher verifies the
  SHA-256 of every engine against the digest recorded in the
  repository's engine catalogue.
- The Lichess broadcast and standard-rated archives. These are
  not the application's data; the application reads from them
  at build time only.
- The user's machine. The product is local-first; the user is
  responsible for their own machine.

## Tools

- `gitleaks 8.30.1` (Homebrew). JSON report output. `--redact`
  flag — secret values are replaced with the literal string
  `REDACTED` before they leave the scanner.
- `npm audit` 11.x. The Node.js 24.14.0 toolchain shipped with
  the maintainer's machine.
- A custom scan script: `scripts/security-scan.mjs` (run with
  `npm run security:scan`). The script's output is
  `security-scan-report.json`; the script never records a
  secret value, even when one is found.
- A regex sweep for the personal-filesystem patterns the
  data-safety brief lists: `/Users/<name>/` paths, private
  PGNs, etc. The sweep is in `scripts/security-scan.mjs`.
- `git grep` for known-bad URL schemes (`javascript:`, `file:`,
  `data:`) in any user-rendered field.
- A manual review of every workflow in `.github/workflows/`
  for `pull_request_target`, secret-bearing steps, and broad
  permissions.

## Results

### Secrets in current source tree

`gitleaks detect --source . --no-banner --redact
--report-format json` reported 4 findings. All four are
**intentional test fixtures** in unit tests, with low entropy
and well-known test prefixes:

| File                                           | Line | What it is                                                                                   |
| ---------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `src/reference/pack.test.ts`                   | 29   | A literal PGN castling-rights key (`'... w KQkq c6'`). Falsely flagged as a generic API key. |
| `e2e/phase10.spec.ts`                          | 387  | A literal `companionToken` used to test the redaction path.                                  |
| `src/features/shell/diagnostic-report.test.ts` | 11   | A literal `LICHESS_TOKEN` fixture used to test the diagnostic-report redaction.              |
| `src/features/shell/diagnostic-report.test.ts` | 13   | A literal `COMPANION_TOKEN` fixture used to test the diagnostic-report redaction.            |

**Severity:** INFORMATIONAL. None of these are real
credentials. The `LICHESS_TOKEN` is a deterministic string
prefixed with `lip_` (the same prefix Lichess uses) to test
that the redaction layer in `src/features/shell/diagnostic-report.ts`
removes it from the exported report. Removing the fixtures
would mean removing the redaction test.

The maintainer should keep the redaction tests and add a
`gitleaks:allow` directive at the top of each fixture to
prevent future scanners from re-raising the same finding.

### Secrets in git history

`gitleaks detect --source . --log-opts --all` reported the
same 4 findings, in the same files, in commits already on
master. No additional historical exposure was found. No
real-world credential was ever committed.

**Severity:** INFORMATIONAL. Same fixtures, same
recommendation.

### Secrets in the data mirror

`gitleaks detect --source /tmp/kingfisher-data-stage`
reported **0 findings**. The data mirror contains only the
landing page, the assets, the manifests, and the published
chunks.

**Severity:** NONE.

### Personal filesystem paths

The custom regex sweep in `scripts/security-scan.mjs` reported
**0 hits** in tracked files. The previous "leak" the maintainer
saw in `.engine-fleet/engines.json`, `.engine-build/build-provenance.json`,
`public/engine/manifest.json`, and `companion/data/managed-engines.json`
were all in directories that are `.gitignore`d at the
repository root (`.engine-fleet/`, `.engine-build/`,
`/public/engine/`, `companion/data/`) and are not part of the
public repository.

The new `npm run publish:site` script only ever writes to the
allow-list (`index.html`, `assets/`, `manifest.webmanifest`,
`robots.txt`, `README.md`, `.nojekyll`) on the data mirror.
It refuses to delete any `reference-*` directory and refuses
to delete any path it did not create. The Phase 23 `rsync
--delete` is replaced.

**Severity:** NONE.

### npm audit (production runtime)

`npm audit --omit=dev --audit-level=high` reported **0 High
or Critical** advisories on the production runtime. The
production dependency set is 26 packages (peer/optional
excluded). All known advisories apply only to devDependencies
and do not reach the production bundle or the desktop shell.

**Severity:** NONE.

### Electron security baseline

`desktop/src/main.mjs` (the desktop shell) is reviewed against
the brief's expected security baseline:

| Setting              | Value                       | Status  |
| -------------------- | --------------------------- | ------- |
| `contextIsolation`   | `true`                      | CORRECT |
| `nodeIntegration`    | `false`                     | CORRECT |
| `sandbox`            | `true`                      | CORRECT |
| `webSecurity`        | `true`                      | CORRECT |
| `preload`            | `desktop/src/preload.cjs`   | CORRECT |
| `navigate` lock      | pinned to local origin      | CORRECT |
| `openExternal` allow | `https:` and `mailto:` only | CORRECT |

External links are routed through `shell.openExternal` with a
URL scheme allow-list (`https:`, `mailto:`). `javascript:`,
`file:`, and `data:` are never allowed from untrusted
content. `target="_blank"` is paired with
`rel="noopener noreferrer"` on every external link in the
landing page, the web app, and the help/About surfaces.

The renderer is loaded from a fixed origin (the shell's
loopback server) and never navigates to a remote URL. A
malformed `javascript:` URL in a PGN comment cannot replace
the window.

**Severity:** NONE.

### Companion security

`companion/src/server.mjs` binds to `127.0.0.1` (IPv4 loopback)
and `::1` (IPv6 loopback) by default. It does not bind to
`0.0.0.0`. Every request is authenticated with a fresh
pairing token generated on the first launch. The renderer
speaks to the companion only through `window.kingfisher.companion`
on a narrow IPC surface; the companion has no arbitrary
file-read or shell-exec bridge.

Path-traversal, oversized-body, and wrong-token requests
return a clean error response and do not crash the
companion. The companion's tests in `companion/src/*.test.mjs`
exercise the failure paths.

**Severity:** NONE.

### Engine download security

`scripts/engines/install-engines.mjs` downloads every engine
over HTTPS, from a fixed allow-list of upstream hosts, into
a single named file, and verifies the SHA-256 of the
downloaded archive against the digest recorded in
`scripts/engine-digests.json` before extracting a single
named member. The archive extraction refuses archives with
absolute paths, `../` traversal, or symlink members.

**Severity:** NONE.

### Reference-pack download security

`src/reference/install.ts` is the application-side downloader.
The pack manifest is parsed and validated against the schema
in `src/reference/install.ts`; every chunk's `sha256` is
checked before it is committed to the local store. The
store refuses to install a pack with a chunk whose digest
does not match the manifest, and the application refuses to
serve data from a half-installed pack.

The data mirror is a public GitHub Pages site. There is no
write surface exposed to a web visitor. A web visitor cannot
write a malicious manifest that the application will then
install, because the manifest URL is fixed in
`src/reference/catalog.ts` and verified by SHA-256 against
the committed catalogue.

**Severity:** NONE.

### OAuth

Lichess and Chess.com tokens are stored in Settings and are
redacted at write time from:

- the diagnostic report (`src/features/shell/diagnostic-report.ts`);
- the local log file (`desktop/src/log.mjs`);
- the GitHub issue template (the bug-report template asks
  the user to paste the _Copy support information_ line and
  not the raw token).

Lichess OAuth uses PKCE (`src/database/providers/lichess-pkce.ts`).
The token never appears in URL query parameters after the
callback. The state parameter is checked.

**Severity:** NONE.

### Web security headers

The production Next.js build sets, on every response:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp` (or
  `credentialless` when `KINGFISHER_CROSS_ORIGIN_ISOLATION` is
  empty; the threaded Stockfish build still works in both
  modes)
- A `Content-Security-Policy` that disallows remote scripts,
  remote eval, frame embedding, and `<object>`; allows
  same-origin scripts, WebAssembly with `wasm-unsafe-eval`,
  Lichess, Chess.com, the public data mirror, and WebSockets
  for the desktop companion.

The landing page has a `Content-Security-Policy` meta element
in `marketing/index.html` that allows only same-origin
scripts, same-origin styles, same-origin images, and same-origin
fonts. The landing page is a static site and never loads
remote content.

**Severity:** NONE.

### XSS, SQL injection, path injection

User-controlled content (PGN tags, comments, Study notes,
player names, event names, opening text) is rendered as
text in the application. `dangerouslySetInnerHTML` is
searched for and not found in the user-content render path.
A malicious PGN with `<script>alert(1)</script>` as the Event,
Player, or Comment renders as the literal text and is not
executed.

SQLite queries in `src/database/*` are parameterised. No
string-concatenated SQL is found in player search, position
search, structure search, claim search, or collection
operations.

File path inputs (PGN filename, database filename, engine
filename, study export filename) are passed to the Electron
file dialog or the SQLite open API; no shell command is
constructed from them.

**Severity:** NONE.

### SSRF

The Next.js application exposes no public route that takes a
URL parameter and fetches it. The companion binds to
loopback only. There is no public SSRF surface.

**Severity:** NONE.

### Public data repository

`mardakurt/kingfisher-data` is a public repository serving
the landing page and the optional reference packs. Its
contents are limited to:

- `index.html`, `assets/`, `manifest.webmanifest`,
  `robots.txt`, `README.md`, `.nojekyll`;
- `reference-elite-v2/` (324 MB);
- `reference-recent-v1/` (32 MB);
- `reference-online-v1/` (82 MB).

There is no `node_modules`, no `.env*`, no logs, no
editor metadata, no private PGNs, no private databases, no
source archives. The only `.gitignore`d artefacts ever
written to the mirror are the ones the maintainer explicitly
publishes.

**Severity:** NONE.

### Release artefact

`Kingfisher-1.0.0-rc.4-arm64.dmg` is a 150 MB Apple Disk
Image. The artefact was built locally on Apple Silicon, code-
signed with the developer's existing development
certificate, and the SHA-256 is recorded in `SHA256SUMS.txt`
and `release-manifest.json`. A `strings` pass on the
extracted application bundle did not find any real
credential, token, or private key. The bundle does contain
the expected Electron framework strings, the expected Node
runtime strings, and the development signing identity; none
of these are secrets.

**Severity:** NONE.

## Findings

| #   | Severity      | Title                                                                         | Status                                                                                            |
| --- | ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | INFORMATIONAL | 4 gitleaks false positives in test fixtures                                   | Documented                                                                                        |
| 2   | NONE          | 0 personal filesystem paths in tracked files                                  | Resolved                                                                                          |
| 3   | NONE          | 0 npm-audit advisories in production runtime                                  | Resolved                                                                                          |
| 4   | NONE          | 0 secrets in the data mirror                                                  | Resolved                                                                                          |
| 5   | NONE          | Electron contextIsolation, sandbox, webSecurity all correct                   | Resolved                                                                                          |
| 6   | NONE          | Companion loopback-only, token-authenticated                                  | Resolved                                                                                          |
| 7   | NONE          | Engine download digest-verified, single-member extraction                     | Resolved                                                                                          |
| 8   | NONE          | Reference-pack download digest-verified, transactional install                | Resolved                                                                                          |
| 9   | NONE          | OAuth tokens redacted from diagnostic, log, and issue template                | Resolved                                                                                          |
| 10  | NONE          | Production CSP, COOP, COEP, HSTS, Referrer-Policy, Permissions-Policy all set | Resolved                                                                                          |
| 11  | MEDIUM        | Phase 23 used `rsync --delete` on the data mirror, which is unsafe            | **Resolved (Phase 24)** — `npm run publish:site` is the new path; refuses to delete `reference-*` |
| 12  | INFORMATIONAL | Landing page has no remote web-app URL; the web app is not yet deployed       | **Open**                                                                                          |
| 13  | INFORMATIONAL | macOS preview is not notarized                                                | **Open**                                                                                          |

## Open items

The two INFORMATIONAL items are tracked in the Phase 24
handover. They are not security findings; they are
operational gaps.

The MEDIUM item (11) is a deployment-safety improvement. The
new `npm run publish:site` and `npm run publish:data` scripts
make the previous `rsync --delete` workflow impossible to
accidentally execute against the data mirror.

## Recommendations

1. Add `gitleaks:allow` directives to the four test fixtures
   to silence future scans and make the redaction tests
   explicit.
2. Set up a GitHub Actions secret-scanning + push-protection
   rule on the repository so the next agent that tries to
   commit a real secret is blocked at the push step.
3. Add a Dependabot config (`.github/dependabot.yml`) so the
   next time a production advisory lands, the maintainer
   sees it in the Dependabot tab and not in the wild.
4. When the Vercel project is created, set
   `KINGFISHER_PUBLIC_WEB_URL` and re-run
   `npm run public:check` so the link validator stops
   reporting the web app as a 404.
5. When a Developer ID Application certificate is available,
   sign and notarise the macOS build; the _preview_ label
   drops.
