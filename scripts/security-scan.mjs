#!/usr/bin/env node
/**
 * `npm run security:scan` — local Phase 24 security sweep.
 *
 * This is the script the brief calls "a broad cybersecurity audit"
 * narrowed to the parts that can be checked without uploading the
 * repository anywhere. It runs:
 *
 *   1. gitleaks on the source tree (current + history), in JSON
 *      mode so the output is machine-readable.
 *   2. gitleaks on the data mirror, the same way.
 *   3. A regex sweep for the personal filesystem patterns the
 *      data-safety brief lists.
 *   4. `npm audit --omit=dev` for the production runtime.
 *
 * The output is a JSON report at `security-scan-report.json`
 * (and a human-readable summary on stdout) — no secret values
 * are ever written to the report.
 *
 * The script is intentionally narrow. It is the local tripwire
 * the maintainer runs before tagging; the deeper audit lives in
 * `docs/security/phase-24-security-review.md`.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = join(ROOT, 'security-scan-report.json');
const STAGE = process.env.KINGFISHER_DATA_STAGE || '/tmp/kingfisher-data-stage';

const log = (msg) => console.log(msg);
const findings = [];
const warnings = [];

const hasGitleaks = (() => {
  try {
    return spawnSync('gitleaks', ['version']).status === 0;
  } catch {
    return false;
  }
})();

if (!hasGitleaks) {
  warnings.push(
    'gitleaks is not installed; the secret scan was skipped. Install with: brew install gitleaks',
  );
  log('gitleaks is not installed. Skipping the secret scan.');
} else {
  const scan = (label, args) => {
    log(`\n--- ${label} ---`);
    const tmp = `/tmp/kingfisher-gitleaks-${Math.random().toString(36).slice(2)}.json`;
    const result = spawnSync(
      'gitleaks',
      [
        ...args,
        '--no-banner',
        '--redact',
        '--report-format',
        'json',
        '--report-path',
        tmp,
        '--exit-code',
        '0',
      ],
      { encoding: 'utf8', cwd: ROOT },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    let parsed = [];
    try {
      const text = readFileSync(tmp, 'utf8');
      if (text.trim()) {
        parsed = JSON.parse(text).map((f) => ({
          rule: f.RuleID,
          file: f.File,
          line: f.StartLine,
          description: f.Description,
          // Do NOT include f.Secret, f.Match or any value the
          // scanner redacted for us. The redacted marker is the
          // value, but we discard it anyway.
        }));
      }
    } catch (e) {
      warnings.push(`gitleaks JSON for ${label} could not be parsed: ${e.message}`);
    }
    return parsed;
  };

  const sourceFindings = scan('Secret scan (current source tree)', ['detect', '--source', ROOT]);
  if (sourceFindings.length > 0) {
    findings.push({ scope: 'source-tree', findings: sourceFindings });
  }

  const historyFindings = scan('Secret scan (git history)', [
    'detect',
    '--source',
    ROOT,
    '--log-opts',
    '--all',
  ]);
  if (historyFindings.length > 0) {
    findings.push({ scope: 'git-history', findings: historyFindings });
  }

  if (existsSync(STAGE)) {
    const dataFindings = scan('Secret scan (data mirror)', ['detect', '--source', STAGE]);
    if (dataFindings.length > 0) {
      findings.push({ scope: 'data-mirror', findings: dataFindings });
    }
  } else {
    log(`\nSkipping data mirror scan — stage ${STAGE} not present.`);
  }
}

// 3) Personal filesystem path sweep. Search tracked files only so generated
// build output cannot create noise, then retain documented synthetic fixtures
// and human-readable placeholders while rejecting real home-directory names.
const personalGrep = spawnSync(
  'git',
  [
    'grep',
    '-n',
    '-I',
    '-E',
    String.raw`/Users/[^/<]+/|/home/[^/<]+/|[A-Za-z]:\\Users\\[^\\<]+\\`,
    '--',
    '.',
    ':(exclude)scripts/security-scan.mjs',
    ':(exclude)security-scan-report.json',
  ],
  { encoding: 'utf8', cwd: ROOT },
);
const syntheticPaths =
  /\/Users\/(?:you|alice)\/|\/home\/(?:player|bob)\/|[A-Za-z]:\\Users\\Carol\\/;
const personalHits = (personalGrep.stdout || '')
  .split('\n')
  .filter((l) => l.trim() && !/^Binary file/.test(l))
  .filter((l) => !syntheticPaths.test(l))
  .slice(0, 25);
if (personalHits.length > 0) {
  findings.push({ scope: 'personal-paths', findings: personalHits });
}

// 4) npm audit for the production runtime.
log('\n--- npm audit (production runtime) ---');
const npmAudit = spawnSync('npm', ['audit', '--omit=dev', '--json', '--audit-level=high'], {
  encoding: 'utf8',
  cwd: ROOT,
});
if (npmAudit.stdout) {
  try {
    const data = JSON.parse(npmAudit.stdout);
    const advisories = Object.values(data.vulnerabilities || {});
    if (advisories.length > 0) {
      findings.push({
        scope: 'npm-audit',
        findings: advisories.map((a) => ({
          name: a.name,
          severity: a.severity,
          via: (a.via || []).map((v) => v.title || v.name).slice(0, 3),
        })),
      });
    }
  } catch (e) {
    warnings.push(`npm audit JSON could not be parsed: ${e.message}`);
  }
}

const report = {
  schema: 'kingfisher-security-scan/1',
  generatedAt: new Date().toISOString(),
  // This report is committed as release evidence. Never publish the build
  // machine's username or checkout location with it.
  root: '<repository-root>',
  findings,
  warnings,
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

const totalFindings = findings.reduce((sum, f) => sum + (f.findings?.length || 0), 0);
log(`\nScan complete. ${totalFindings} finding(s) across ${findings.length} scope(s).`);
log(`Report: ${REPORT_PATH}`);

if (totalFindings > 0) {
  log('\nOpen the report and the deeper audit at docs/security/phase-24-security-review.md.');
}
exit(0);
