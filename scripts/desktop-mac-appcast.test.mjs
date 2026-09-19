import { describe, expect, it } from 'vitest';

import {
  changelogEntryUrl,
  releaseNotesHtml,
  releaseNotesSummaryHtml,
} from './desktop-mac-appcast.mjs';

const CHANGELOG = `# Changelog

## Unreleased (web)

- Something in progress.

## 1.2.1 — 2026-09-19

Kingfisher 1.2.1 carries every change below to the Mac application; the
web has shipped each one as it landed.

- **The Training icon is a knight you can recognise.** The sidebar, the
  Recent page and the tour all draw it from one icon, at 16, 21, 24 and
  32 px in both themes. (Phase 71)
- **The tour opens again — from Settings, and only from there.** Phase 61
  unmounted it; \`tourShowOnLaunch\` is retired. (Phase 71)
- A bullet without a bold lead. It still says one sentence. And more.

### A subheading nobody needs in a summary

- **Backups record installed packs.** So a restore can say which to reinstall.

## 1.2.0 — 2026-09-17

- Older.
`;

describe('the notes Sparkle shows', () => {
  it('summarise the entry: the opening paragraph, one line per change, and a link', () => {
    const html = releaseNotesSummaryHtml(CHANGELOG, '1.2.1', 'https://example.test');
    expect(html).toBe(
      [
        '<h2>1.2.1 — 2026-09-19</h2>',
        '<p>Kingfisher 1.2.1 carries every change below to the Mac application; the web has shipped each one as it landed.</p>',
        '<ul>',
        '  <li>The Training icon is a knight you can recognise</li>',
        '  <li>The tour opens again — from Settings, and only from there</li>',
        '  <li>A bullet without a bold lead</li>',
        '  <li>Backups record installed packs</li>',
        '</ul>',
        '<p><a href="https://example.test/blob/master/CHANGELOG.md#121--2026-09-19">Full changelog for 1.2.1</a></p>',
        '',
      ].join('\n'),
    );
  });

  it('are a fraction of the full rendering they replace', () => {
    const full = releaseNotesHtml(CHANGELOG, '1.2.1');
    const summary = releaseNotesSummaryHtml(CHANGELOG, '1.2.1', 'https://example.test');
    expect(full).toContain('Phase 71');
    expect(summary).not.toContain('Phase 71');
    expect(summary.length).toBeLessThan(full.length);
  });

  it('is null for a version the changelog does not name', () => {
    expect(releaseNotesSummaryHtml(CHANGELOG, '9.9.9', 'https://example.test')).toBeNull();
  });

  it('escapes text and refuses a non-https link', () => {
    const html = releaseNotesSummaryHtml(
      '## 2.0.0 — 2027-01-01\n\nA <b>bold</b> claim & more.\n\n- **Less <em>markup</em>.** Detail.\n',
      '2.0.0',
      'javascript:alert(1)',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; claim &amp; more.');
    expect(html).toContain('<li>Less &lt;em&gt;markup&lt;/em&gt;</li>');
    expect(html).not.toContain('javascript:');
  });

  it('links the version anchor GitHub generates for the heading', () => {
    expect(changelogEntryUrl('https://github.com/mardakurt/kingfisher', '1.2.1 — 2026-09-19')).toBe(
      'https://github.com/mardakurt/kingfisher/blob/master/CHANGELOG.md#121--2026-09-19',
    );
  });
});
