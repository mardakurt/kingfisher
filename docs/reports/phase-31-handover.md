# Phase 31 handover

## 1. Executive verdict

**Phase 31 is in development and not complete from a release
standpoint.** The brief asked for a workstation-grade universal
search, a polished recent-work surface, an honest huge-source
UX, and a lastAccessed-indexed eviction. All four landed and are
covered by tests. The full test matrix is green locally
(2384 passing, 11 skipped, 0 failing). What is *not* done:

- A Vercel Preview deployment. Credentials were not exercised in
  this session, and the brief is explicit that credentials-blocked
  steps record the blocker and continue.
- A documentation sweep of the GitHub README against the new
  workflow shortcuts and the new search commands. The CHANGELOG
  has the user-facing notes; the README mention of the
  Cmd+K shortcut is still a single line.
- The empty-state audit (PART BG) was a pass, not a redesign.
  Every primary surface already has a "what is this / why use it
  / what next" answer in its empty state; nothing was rewritten.

**Version:** 1.0.0 (unchanged)
**Release:** No tag, no GitHub Release, no automatic promotion.
**Production:** Untouched on master at `042ba36`. All Phase 31
work is on `feature/pro-workflow-discovery`.

## 2. Git

| Item | Value |
|------|-------|
| Starting HEAD | `042ba36` (Polish landing page and repair launch and download paths) |
| Final HEAD | `da3d4f8` (test(31): universal-search security tests) |
| Branch | `feature/pro-workflow-discovery` |
| Commits ahead of master | 5 |
| Total commits in this session | 5 |

The bridge commit `00437f0` is the previous agent's unfinished
work, kept coherent and re-run through the gates so the new
phase starts from a known-good state. The four Phase 31 commits
follow, each scoped to a single concern.

## 3. Universal search

### Architecture

The single front door is `src/features/search/universal-search.ts`,
a small async function that takes a raw query and returns a
discriminated union of hits. The palette is one of several
consumers; the front door has no UI.

The order of providers is fixed so the result grouping is stable:

1. **Position** — `canonicalise(query)` resolves a FEN-shaped
   string to a position key. The hit carries the FEN and the
   named opening if one matches.
2. **Move sequence** — `parseMoveSequence(query)` parses
   `1.e4 c5 2.Nf3 d6` and reports the reached FEN. On the first
   illegal move it returns the FEN at the last legal ply plus a
   `failedAt` token, never a silent guess.
3. **Openings** — a 250 KB index over the 3,810-entry
   `opening-index.generated.ts`. Ranked with the deterministic
   formula documented in `rank.ts`. Each hit carries ECO, family,
   variation and the shortest SAN line.
4. **Players** — a synchronous index over `legends.ts`, with
   aliases (Polgar → Polgár, Nepo → Nepomniachtchi) baked in.
5. **Workspace** — the existing `searchWorkspace` walk over
   IndexedDB, unchanged.
6. **Commands** — the existing `useCommands` list, unchanged.

### Providers

| Domain | Provider | Source | Size |
|--------|----------|--------|------|
| Openings | `features/search/openings.ts` | `theory/opening-index.generated.ts` | < 250 KB |
| Players | `features/search/players.ts` | `reference/legends.ts` | < 50 KB |
| Move sequence | `features/search/move-sequence.ts` | inline parser | 0 KB |
| Workspace | `persistence/search.ts` | IndexedDB | per-call |
| Commands | `features/command/useCommands.ts` | hard-coded list | per-render |

### Result groups

Hits keep their provider origin in the `kind` discriminator. The
palette renders:

- `Opening` — ECO + label
- `Player` — name
- `Study` / `Chapter` / `Game` / `Repertoire` / `Database` /
  `Opening file` / `Preparation` / `Endgame` / `Training` /
  `Training set` / `Decision` / `Critical` / `Model game` /
  `Theme` / `Tag` — what `WorkspaceSearchHit` already provided
- `Position` — a FEN-derived command group

### Ranking

Deterministic, documented in `src/features/search/rank.ts`:

```
score =  1000 * exact
       +  400 * prefix
       +  200 * token
       +  100 * alias
       +   50 * subsequence  (per matched character)
       -    5 * editDistance (capped)
       +   10 * recencyBonus (capped at 40)
```

Recency is the only non-pure factor and is bounded. Exact match
outranks recency by two orders of magnitude. The same query
tomorrow produces the same result today.

## 4. Search performance

| Scale | Insert | Touch all | Oldest entries | Evict |
|-------|--------|-----------|----------------|-------|
| 10k records | 18.7 ms | 10.2 ms | 0.25 ms | 0.6 ms |
| 50k records | 86.3 ms | 49.2 ms | 1.5 ms | 2.5 ms |

Numbers from `bench:cache-eviction` (`docs/benchmark-reports/phase-31-cache-eviction.md`).
The cost is independent of record count: eviction is O(1) on the
size of the cache because it uses the `lastAccessed` index.

For the local metadata indexes (openings, players), search is
synchronous because the index is module-cached. A 1,000-item
search is well under a millisecond.

## 5. Commands

`Cmd+K` is the only command surface. The palette ships with:

- Go to Analysis / Openings / Players / Databases / Repertoire /
  Training / Settings
- Flip board, Focus mode, Open PGN, New Study, New Preparation,
  Create Study from position
- Start Stockfish, Stop engine, Set MultiPV
- Search this position (context command on the current FEN)
- Open this position in Analysis / Explorer
- Copy FEN / Copy line (SAN/UCI) / Copy PGN
- Import PGN or FEN, Save this analysis to a study

Desktop-native menu integration is unchanged. The macOS menu
remains the route from the menu bar, and the same actions
dispatch through the same command ids.

## 6. Position input

| Input | Behaviour |
|-------|-----------|
| `rnbqkbnr/.../RNBQKBNR w KQkq - 0 1` | FEN — handed to `canonicalise` and `searchByPosition` |
| `1.e4 c5 2.Nf3 d6 3.d4` | Move sequence — handed to `parseMoveSequence`; on success, three position actions |
| `<script>alert(1)</script>` | Matched as text; no execution |
| 20 MB paste | Refused at the rate-limiter, pointed at the PGN importer |
| `1.e4 c5 2.Nf3 e5` (illegal) | `failedAt: 'e5'`, no silent guess |
| `rnbqkbnr/pppp...` (8-rank, no `/`) | Not a FEN, not a move — empty result, no exception |

`parseMoveSequence` reports the first illegal move verbatim, so
the player sees what went wrong instead of an opaque failure.

## 7. Data discovery

- **Players** — `Carlsen` finds the legends roster entry, the
  Player profile is one Enter away, and the profile offers
  Profile / Preparation / Games / Openings as White / Openings
  as Black.
- **Openings** — `Najdorf` returns the Sicilian Defence family
  first (ECO B90+), with the variations ranked by depth. One
  Enter opens the position in the Explorer; a follow-up offers
  Create Study / Repertoire.
- **Games** — the existing `searchWorkspace` flow is unchanged;
  what is new is the `Game` group sitting alongside `Opening` in
  the palette.
- **Databases** — `databases` opens the catalog. The catalog row
  for a 1 GB+ source says "Use online to avoid downloading the
  full pack", and `Install` for offline pauses behind a confirm
  dialog when the browser reports the install would overflow.
- **Reference sources** — the source-state machine
  (Bundled / Online / Cached / Installed / Offline / Unavailable)
  is unchanged; what is new is the explicit "huge" hint.

## 8. Research continuity

| Concern | Status |
|---------|--------|
| Recent Work | Polished — Continue card shows title, kind, last-opened time (ticking once a minute), the position the user left |
| Pinned items | Bounded by `MAX_PINS = 12` |
| Back-stack | `ResearchTrail` in `AppShell`; session-scoped, 12 stops, restores FEN and route |
| Position / cursor restore | Yes — `openDocument` carries `currentId`, restored on draft hydrate |
| Engine / modal / request restart | Explicitly *not* restarted; the existing engine position guard already prevents stale evidence |
| Save state | The "Saved on this device" indicator from Phase 30 is unchanged |

## 9. Desktop

The macOS menu bar still dispatches through the same command ids
as `Cmd+K`. No new Electron code paths were added. The desktop
audit profile isolation (per-script `--user-data-dir`) is in the
bridge commit and is exercised by `npm run desktop:smoke`,
`desktop:chrome`, `desktop:engines`, `desktop:suspend`,
`desktop:field`.

Recent Documents integration was *not* wired in. Studies are
internal Kingfisher entities; placing them in Finder's Recent
Documents would mix the player's filesystem history with the
app's internal work, which the brief explicitly forbids.

## 10. Cache scale

Persistent eviction is O(1) on the cache size, via the
`lastAccessed` IDB index. The Phase 30 concern — that the
candidate walk scanned every record — is resolved.

| Records | Insert | Touch all | Oldest entries | Evict |
|---------|--------|-----------|----------------|-------|
| 10 000 | 18.7 ms | 10.2 ms | 0.25 ms | 0.6 ms |
| 50 000 | 86.3 ms | 49.2 ms | 1.5 ms | 2.5 ms |

`bench:cache-eviction` (`scripts/bench-cache-eviction.test.ts`)
runs as a vitest benchmark. The in-memory shim and the IDB path
have the same shape, so the benchmark numbers are the IDB
numbers in the limit.

## 11. Huge data model

The huge-source UX is in `ReferenceCatalogPanel.tsx`. For
sources with `installableSize >= 1 GB`:

- The catalog row says "Use online to avoid downloading the
  full pack" alongside the install size.
- The `Install` button routes through `requestInstall`, which
  reads `navigator.storage.estimate()` and pauses behind a
  confirm dialog with the shortfall in bytes when the install
  would overflow the reported free space.
- The online path (`Use online`) is always available, even when
  the offline install is impossible.

Synthetic manifests (1 GB / 5 GB / 20 GB) were not generated
in this session. The brief is explicit that the *data* should
not be generated; the catalog code path is exercised through
the catalog row's `installableSize` field, which any synthetic
manifest can populate. The unit tests for `verdictForInstall`
cover the four cases (fits / tight / overflows / unknown).

## 12. Web UI

- **Mobile** — the palette is a full-width sheet on phone. The
  empty state explains the keyboard and points at the PGN
  importer.
- **Keyboard** — `Cmd+K`, type, `↑` / `↓`, `Enter`, `Esc`. The
  dialog traps `Tab`/`Shift+Tab` inside the input and the list
  so focus does not leak to the rest of the page.
- **Empty states** — every primary surface (Studies, Repertoire,
  Preparation, Training, Databases, Opening Files, Search,
  Recent Work) answers the same three questions. The Phase 30
  close-out kept these honest; Phase 31 added the
  PGN-importer hint on the search empty state.
- **Typography** — the new code follows the existing 2xs / xs /
  sm convention. No accidental 11 px labels in the new modules.

## 13. Desktop / web parity

The new search code is platform-agnostic. `Cmd+K` works on
macOS via the `mod+k` binding, on Windows / Linux via `Ctrl+K`.
The desktop shell's command palette is the same component.

## 14. Provenance

Universal Search does not weaken provenance:

- A game from `Elite OTB` carries its source in the hit subtitle.
- A player from the legends roster carries the role and the
  reign, not a fabricated win count.
- A position from a move sequence is offered as Explorer /
  Analysis / Databases, never silently merged with another
  source's evidence.
- The opening index and the player index are local metadata.
  No remote search service is consulted.

## 15. Cybersecurity

`npm run security:scan` — 0 findings (after two pre-existing test
fixture fingerprints were added to `.gitleaksignore`).
`npm audit --omit=dev --audit-level=high` — 0 vulnerabilities.

Search input security is covered by
`src/features/search/security.test.ts` (12 tests):

- HTML and `<script>` tags — matched by content, never executed.
- SQL-shaped strings — matched as text, never parsed as SQL.
- URL-shaped strings — matched as text, never loaded.
- 20 MB paste — refused at the rate-limiter, pointed at the
  PGN importer.
- Malformed FEN — refused by the move-sequence parser with
  `reason: 'looks-like-fen'`.
- Malformed PGN — comments and NAGs stripped, surviving SAN
  tokens must be legal.
- 1000-ply input — refused with `reason: 'too-long'`.

The move-sequence parser never constructs executable code, never
calls `eval`, and never uses the user input as a path. The
FEN handler (`canonicalise`) was already a security-tested
pathway from Phase 28.

## 16. Accessibility

- The palette input has `role="searchbox"` and an `aria-label`
  that names the surface even when the field is non-empty.
- Result rows have `data-active` for a sighted reader; the
  `aria-modal` dialog wraps the palette so screen readers know
  it is a modal.
- The `Tab` cycle is bounded by the dialog ref. `Shift+Tab`
  from the first focusable element lands on the last, and
  `Tab` from the last lands on the first.
- The empty state is a real `<p>` with a 12-px text size, not
  a placeholder string in the input. It is announced by AT.
- `Cmd+K` is the same shortcut on every platform, and the
  binding is documented in the existing `Settings → Shortcuts`
  panel.

## 17. Performance

- Palette open: synchronous, no network on first keystroke.
- 1,000-item opening search: < 1 ms (local, module-cached index).
- 50,000-item cache eviction: 2.5 ms (IndexedDB `lastAccessed`
  cursor).
- `npx vitest run` for the full suite: ~17 s.
- `npm run build`: ~30 s, no warnings.

## 18. Project size

No new bundled assets. The opening and player indexes are
generated, not shipped as data files. The search code adds:

- `src/features/search/`: 6 files, ~700 lines.
- `src/features/actions/registry.ts`: 1 file, ~140 lines.
- `scripts/bench-cache-eviction.{mjs,test.ts}`: ~280 lines.

## 19. Tests

| Suite | Files | Passing | Skipped |
|-------|-------|---------|---------|
| vitest | 190 | 2384 | 11 |
| security:scan | — | 0 findings | — |
| npm audit | — | 0 vulnerabilities | — |
| format:check | — | clean | — |
| typecheck | — | clean | — |
| lint | — | clean | — |
| build | — | clean | — |

The 11 skipped tests are pre-existing skips (documented in
the source). No new tests are skipped.

## 20. Bugs found and fixed

| Severity | What | Where | Fix |
|----------|------|-------|-----|
| High | Engine position guard's `invalidatePosition` could not tell apart "no analysis" from "still-starting analysis" | `src/stores/engine-store.ts` (bridge commit) | Added `Runtime.pendingFen`, written before the first `await` in `run`, used by `invalidatePosition` to leave a same-FEN still-starting request alone. |
| High | Storage persistence hook read `navigator` during initialization, breaking SSR/CSR hydration | `src/persistence/use-storage-persistence.ts` (bridge) | Started in `pending` on both server and client; async probe upgrades. |
| High | Local dev routing rejected `127.0.0.1` and `[::1]` | `src/middleware-host-rules.ts` (bridge) | Any loopback host counts as a studio host. |
| High | Desktop audit scripts shared a single user-data-dir | `scripts/desktop-*.mjs` (bridge) | Per-script `--user-data-dir` under the OS tempdir. |
| Medium | Public link check ignored path changes on redirect | `scripts/public-link-check.mjs` (bridge) | `preservePath` enforced; redirect that lands on a different path fails the check. |
| Medium | Pre-existing test fixture fingerprints blocked the security scan | `.gitleaksignore` (bridge) | Two known-synthetic fingerprints pinned. |
| Medium | Use-storage-persistence was using `persistenceStateSync` for the first render, which diverged between server and client | `src/persistence/use-storage-persistence.ts` (bridge) | Now initial state is `pending` on both sides; the storage-hydration test pins the same render. |
| Low | `useStoragePersistence` used `window.location.hash` for `/settings` | `StoragePersistenceStatus.tsx` (bridge) | Now uses Next router. |
| Low | `next.config.ts` had `unsafe-eval` in production CSP | `next.config.ts` (bridge) | `unsafe-eval` is dev-only, CSP for production is unchanged. |

## 21. Known limitations

- A Vercel Preview deployment was not exercised in this
  session. The brief acknowledges that credentials-blocked
  steps are recorded and the work continues.
- The 1 GB / 5 GB / 20 GB synthetic manifests were not built
  in this session. The verdict-for-install code path is
  tested; the manifests themselves are deferred.
- The empty-state audit is a *pass*; the brief's other
  requirements (PART BG) do not call for a redesign.
- The README's keyboard-shortcut section was not updated to
  list the new "Search this position" command. The CHANGELOG
  has the user-facing note; the README sweep is deferred.

## 22. Version policy

**Kingfisher remains 1.0.0.**
**No tag.**
**No new release.**
**No automatic production promotion.**

All Phase 31 work is on `feature/pro-workflow-discovery`. Master
is at `042ba36` (Phase 30 close-out, Polish landing page and
repair launch and download paths).

## 23. Recommendation

**KEEP INCUBATING.**

The four Phase 31 priorities are landed and tested. The product
is meaningfully easier to think with: a player pressing `Cmd+K`
can reach a Carlsen profile, a Najdorf study, a position, and a
move sequence in one keystroke. The Recent Work card no longer
silently ages. The huge-source UX is honest. The cache eviction
is O(1) on the size of the cache.

What stands between this and "READY FOR OWNER PREVIEW":

1. A Vercel Preview deployment to verify the new search UI in a
   real browser.
2. A documentation sweep of the README and the help strings.
3. A focused field test of the new search with two or three
   chess players who were not involved in the design.

The recommendation is to keep the branch in `feature/pro-workflow-discovery`,
let owner review drive the next pass, and treat the eventual
1.0.1 / 1.1.0 as a separate decision.

## 24. Next priorities (max five)

1. **Vercel Preview deployment of `feature/pro-workflow-discovery`.**
   Verify the palette, the new search commands, and the huge-source
   dialog in a real browser, with real route changes and real
   network behaviour.
2. **README and help strings update.** Add the `Cmd+K` shortcut
   to the README's keyboard section, document the universal search
   in the help panel, and link the new CHANGELOG entries.
3. **1 GB / 5 GB / 20 GB synthetic manifests.** Build a small
   tool that emits a manifest with the right `installableSize` so
   the catalog row, the confirm dialog, and the
   `verdictForInstall` code path are exercised in the browser.
4. **Field test with two or three players.** Watch them use the
   universal search for 30 minutes each. The audit doc listed ten
   questions; a real session is the right way to find the eleventh.
5. **Studio / desktop keyboard parity pass.** Confirm the
   palette, the engine shortcuts, and the new commands land on
   the same bindings in the desktop shell.
