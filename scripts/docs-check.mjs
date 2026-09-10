#!/usr/bin/env node
/**
 * `npm run docs:check` — verify the canonical documentation
 * for Phase 33 public-surface accuracy.
 *
 * This script does not crawl the network. It inspects the
 * canonical Markdown and TypeScript files in this repository
 * and asserts a small set of invariants that, if violated,
 * indicate a public-facing claim is out of date with the
 * actual product. The intent is a fast local gate.
 *
 * It exits non-zero on the first violation unless `--lenient`
 * is passed, in which case it prints a summary at the end.
 *
 * Categories of check:
 *   - No `1.0.0-rc.*` mentions in canonical docs
 *   - No references to `kingfisher-roan` / `mardakurt.github.io/kingfisher-data` in
 *     canonical user-facing text (canonical landing is `kingfisher-chess`)
 *   - The install guide matches the current public DMG filename
 *   - The launch kit matches the current public version
 *   - The security policy does not claim Sync, notarisation,
 *     or Windows / Linux desktop support it does not have
 *   - The privacy page exists and describes the no-cookie,
 *     no-telemetry, no-account product
 *   - The data-licences page exists and names the four packs
 *   - The public claims register exists and forbids invented
 *     testimonials, ratings, or team
 *   - The search-console document exists
 *   - The `.well-known/security.txt` file exists and contains
 *     a Contact and a Policy line
 *
 * Pass `--json` for a machine-readable summary.
 */

import { argv, exit, stdout } from 'node:process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const args = new Set(argv.slice(2));
const asJson = args.has('--json');
const lenient = args.has('--lenient');

/** Files that are current / canonical product documentation. */
const CANONICAL = [
  'README.md',
  'SECURITY.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'ARCHITECTURE.md',
  'LICENSE',
  'THIRD_PARTY_DATA.md',
  'THIRD_PARTY_ASSETS.md',
  'docs/README.md',
  'docs/deployment.md',
  'docs/legal/privacy.md',
  'docs/legal/data-licences.md',
  'docs/legal/terms.md',
  'docs/product/public-claims.md',
  'docs/operations/search-console.md',
  'docs/release/install-macos.md',
  'docs/release/launch-kit.md',
  'docs/release/1.0.0.md',
  'docs/release/release-checklist.md',
  'docs/user/getting-started.md',
  'docs/user/diagnostics.md',
  'docs/data/data-inventory.md',
  'docs/data/reference-packs.md',
  'docs/ENGINES.md',
  'src/app/install/page.tsx',
  'src/app/install/InstallPage.tsx',
  'src/app/privacy/page.tsx',
  'src/app/privacy/PrivacyPage.tsx',
  'src/app/security/page.tsx',
  'src/app/security/SecurityPage.tsx',
  'src/app/data-licences/page.tsx',
  'src/app/data-licences/DataLicencesPage.tsx',
  'src/app/terms/page.tsx',
  'src/app/terms/TermsPage.tsx',
  'src/app/landing/LandingPage.tsx',
  'src/app/sitemap.ts',
  'src/app/robots.ts',
  'src/app/layout.tsx',
  'src/app/manifest.ts',
  'src/release/public-urls.ts',
];

/**
 * Files whose content is intentionally historical and may
 * reference `1.0.0-rc.*` or older phase URLs. They are NOT
 * checked against the canonical claim set.
 */
const HISTORICAL_PATTERNS = [
  /^docs\/reports\/phase-/,
  /^docs\/release\/1\.0\.0-rc\./,
  /^docs\/product\/phase-/,
  /^docs\/security\/phase-/,
  /^docs\/benchmark-reports\//,
  /^docs\/performance\//,
  /^docs\/adr\//,
  /^docs\/design\//,
  /^docs\/product\/work-continuity\.md$/,
  /^docs\/product\/phase-verification\.md$/,
  /^docs\/product\/pro-workstation-gap-analysis\.md$/,
  /^docs\/product\/web-desktop-parity\.md$/,
  /^docs\/product\/competitors\.md$/,
];

const isHistorical = (rel) => HISTORICAL_PATTERNS.some((re) => re.test(rel));

const checks = [];
let failures = 0;

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures += 1;
}

function mustExist(rel) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    record(`exists:${rel}`, false, 'file not found');
    return null;
  }
  if (!statSync(abs).isFile()) {
    record(`exists:${rel}`, false, 'not a file');
    return null;
  }
  record(`exists:${rel}`, true, `${statSync(abs).size} bytes`);
  return readFileSync(abs, 'utf8');
}

function mustNotMatch(rel, regex, reason) {
  const content = mustExist(rel);
  if (content === null) return;
  const match = regex.exec(content);
  if (match) {
    const lineNumber = content.slice(0, match.index).split('\n').length;
    record(`no-stale:${rel}`, false, `${reason} (line ${lineNumber}: "${match[0]}")`);
  } else {
    record(`no-stale:${rel}`, true, 'no matching stale reference');
  }
}

function mustMatch(rel, regex, reason) {
  const content = mustExist(rel);
  if (content === null) return;
  const match = regex.exec(content);
  if (match) {
    record(`has-required:${rel}`, true, reason);
  } else {
    record(`has-required:${rel}`, false, `${reason} — pattern not found`);
  }
}

// 1. The current canonical landing.
{
  const content = mustExist('src/release/public-urls.ts');
  if (content !== null) {
    const ok = /KINGFISHER_PUBLIC_LANDING_URL',\s*'https:\/\/kingfisher-chess\.vercel\.app'\)/.test(
      content,
    );
    record(
      'public-urls.landing',
      ok,
      ok
        ? 'canonical landing is https://kingfisher-chess.vercel.app'
        : 'canonical landing is not the Vercel production host',
    );
  }
}

// 2. No `1.0.0-rc.*` references in canonical files.
// CHANGELOG.md and README.md are the explicit exception: the
// changelog records what shipped in each version, and the
// historical "How it got here" section of README.md is dated
// and labelled as such.
const staleRcRe = /\b1\.0\.0-rc\.[0-9]+/g;
const allowStaleRc = new Set(['CHANGELOG.md', 'README.md', 'docs/README.md']);
for (const rel of CANONICAL) {
  if (isHistorical(rel)) continue;
  if (allowStaleRc.has(rel)) continue;
  mustNotMatch(rel, staleRcRe, 'stale release-candidate version reference');
}

// 3. No references to the legacy GitHub Pages landing in canonical user-facing text.
// The legacy origin is allowed in files that document the
// continuity story or are themselves the compatibility record.
const legacyPagesRe = /mardakurt\.github\.io\/kingfisher-data\b/g;
const allowLegacyPages = new Set([
  'src/middleware-host-rules.ts',
  'src/release/public-urls.ts',
  'docs/data/data-inventory.md',
  'docs/operations/search-console.md',
  'docs/product/public-claims.md',
  'docs/legal/data-licences.md',
  'docs/legal/privacy.md',
  'README.md',
  'docs/README.md',
  'docs/deployment.md',
  'docs/release/1.0.0.md',
  'docs/release/release-checklist.md',
  'docs/data/reference-packs.md',
  'src/app/privacy/PrivacyPage.tsx',
  'CHANGELOG.md',
]);
for (const rel of CANONICAL) {
  if (allowLegacyPages.has(rel)) continue;
  mustNotMatch(
    rel,
    legacyPagesRe,
    'legacy GitHub Pages origin should not appear in canonical user-facing text',
  );
}

// 4. Install guide matches the current DMG filename.
{
  const content = mustExist('docs/release/install-macos.md');
  if (content !== null) {
    mustMatch(
      'docs/release/install-macos.md',
      /Kingfisher-1\.0\.0-arm64\.dmg/,
      'install guide names the current DMG',
    );
    mustMatch(
      'docs/release/install-macos.md',
      /right-click.+Open/,
      'install guide documents the right-click → Open Gatekeeper flow',
    );
    mustMatch(
      'docs/release/install-macos.md',
      /notar/i,
      'install guide is honest about the not-notarised status',
    );
  }
}

// 5. Launch kit matches the current public release.
{
  const content = mustExist('docs/release/launch-kit.md');
  if (content !== null) {
    mustMatch('docs/release/launch-kit.md', /1\.0\.0/, 'launch kit names Kingfisher 1.0.0');
    mustNotMatch(
      'docs/release/launch-kit.md',
      /1\.0\.0-rc\./,
      'launch kit still references a release candidate',
    );
  }
}

// 6. SECURITY.md forbids inventing things that don't exist.
{
  const content = mustExist('SECURITY.md');
  if (content !== null) {
    mustNotMatch(
      'SECURITY.md',
      /1\.0\.0-rc\./,
      'SECURITY.md still names a release candidate as current',
    );
    mustNotMatch(
      'SECURITY.md',
      /Sync is active|cloud sync|cross-device sync is enabled|sync across/i,
      'SECURITY.md must not claim cross-device Sync is active',
    );
    // Notarisation is fine to *mention* (e.g. "not notarised") but
    // SECURITY.md must not claim the build *is* notarised.
    mustNotMatch(
      'SECURITY.md',
      /is notarised|are notarised|has been notarised|notarisation (passes|succeeded|is complete)/i,
      'SECURITY.md must not claim the build is notarised',
    );
    // The page should explicitly state the build is not notarised.
    mustMatch(
      'SECURITY.md',
      /not\s+notarised|not\s+notarized|not\s+yet\s+notarised|not\s+yet\s+notarized/i,
      'SECURITY.md says the macOS build is not notarised',
    );
  }
}

// 7. Privacy page describes the product's actual behaviour.
{
  const content = mustExist('docs/legal/privacy.md');
  if (content !== null) {
    mustMatch('docs/legal/privacy.md', /No account/, 'privacy page says "no account"');
    mustMatch('docs/legal/privacy.md', /No telemetry/, 'privacy page says "no telemetry"');
    mustMatch('docs/legal/privacy.md', /No cookies/, 'privacy page says "no cookies"');
    mustMatch('docs/legal/privacy.md', /local-first/i, 'privacy page is local-first');
  }
}

// 8. Data licences page names the packs.
{
  const content = mustExist('docs/legal/data-licences.md');
  if (content !== null) {
    mustMatch(
      'docs/legal/data-licences.md',
      /kingfisher-starter/,
      'data licences page names the bundled pack',
    );
    mustMatch(
      'docs/legal/data-licences.md',
      /kingfisher-elite-otb/,
      'data licences page names the Elite OTB pack',
    );
    mustMatch(
      'docs/legal/data-licences.md',
      /kingfisher-recent-theory/,
      'data licences page names the Recent Theory pack',
    );
    mustMatch(
      'docs/legal/data-licences.md',
      /kingfisher-high-rated-online/,
      'data licences page names the High-Rated Online pack',
    );
  }
}

// 9. Public claims register forbids invented testimonials.
{
  const content = mustExist('docs/product/public-claims.md');
  if (content !== null) {
    mustMatch(
      'docs/product/public-claims.md',
      /testimonials/i,
      'public-claims forbids testimonials',
    );
    mustMatch('docs/product/public-claims.md', /team/i, 'public-claims forbids a fabricated team');
  }
}

// 10. Search Console document exists.
mustExist('docs/operations/search-console.md');

// 11. .well-known/security.txt exists, has Contact and Policy.
{
  const content = mustExist('public/.well-known/security.txt');
  if (content !== null) {
    mustMatch('public/.well-known/security.txt', /^Contact:/m, 'security.txt has a Contact line');
    mustMatch('public/.well-known/security.txt', /^Policy:/m, 'security.txt has a Policy line');
    mustMatch('public/.well-known/security.txt', /^Expires:/m, 'security.txt has an Expires line');
  }
}

// 12. Public routes exist.
for (const rel of [
  'src/app/install/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/security/page.tsx',
  'src/app/data-licences/page.tsx',
  'src/app/terms/page.tsx',
]) {
  mustExist(rel);
}

// 13. Sitemap and robots are present.
mustExist('src/app/sitemap.ts');
mustExist('src/app/robots.ts');

// 14. Landing has structured data and a FAQ.
{
  const content = mustExist('src/app/landing/LandingPage.tsx');
  if (content !== null) {
    mustMatch('src/app/landing/LandingPage.tsx', /application\/ld\+json/, 'landing embeds JSON-LD');
    mustMatch(
      'src/app/landing/LandingPage.tsx',
      /WebApplication/,
      'landing JSON-LD types as WebApplication',
    );
    mustMatch('src/app/landing/LandingPage.tsx', /id="faq"/, 'landing has a FAQ section');
  }
}

// 15. Footer is concise — no more giant Lichess copyright line.
{
  const content = mustExist('src/app/landing/LandingPage.tsx');
  if (content !== null) {
    mustNotMatch(
      'src/app/landing/LandingPage.tsx',
      /Reference data is \(c\) its respective publishers; see each pack.*manifest/,
      'landing footer still carries the long licensing paragraph',
    );
    mustMatch(
      'src/app/landing/LandingPage.tsx',
      /Data &amp; licences/,
      'landing footer links to the data-licences page',
    );
  }
}

// 16. .vercel/project.json and the production deploy script are present.
mustExist('.vercel/project.json');
mustExist('vercel.json');

// 17. The CHANGELOG and ARCHITECTURE are still in the repo and non-empty.
mustExist('CHANGELOG.md');
mustExist('ARCHITECTURE.md');

// Reporting ----------------------------------------------------------------

if (asJson) {
  stdout.write(JSON.stringify({ failures, checks }, null, 2) + '\n');
} else {
  const pad = (s, n) => (s.length < n ? s + ' '.repeat(n - s.length) : s);
  for (const c of checks) {
    const mark = c.ok ? 'OK ' : 'XX ';
    stdout.write(`${mark}${pad(c.name, 56)}${c.detail}\n`);
  }
  stdout.write('\n');
  stdout.write(`${checks.length - failures}/${checks.length} checks passed.\n`);
  if (failures > 0 && !lenient) exit(1);
}
