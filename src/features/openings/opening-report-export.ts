import type { OpeningReport } from './opening-report';

/** Export exactly the report's evidence, including uncertainty and separate populations. */
export function openingReportMarkdown(report: OpeningReport): string {
  const lines = [
    '# Kingfisher opening report',
    '',
    `Snapshot: ${new Date(report.generatedAt).toISOString()}`,
    '',
    `Position: \`${report.fen}\``,
    '',
    'Each population is separate. Unavailable or loading evidence is not a zero count.',
    '',
  ];
  for (const section of report.sections) {
    lines.push(`## ${section.title}`, '');
    if (section.provenance) lines.push(`Source: ${section.provenance}`, '');
    if (section.emptyReason) lines.push(section.emptyReason, '');
    for (const entry of section.entries) {
      lines.push(`- ${entry.primary}`);
      if (entry.secondary) lines.push(`  ${entry.secondary}`);
      if (entry.criterion) lines.push(`  Criterion: ${entry.criterion}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
