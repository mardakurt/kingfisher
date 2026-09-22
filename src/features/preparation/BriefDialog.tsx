'use client';

/**
 * The round brief, before it is printed or saved.
 *
 * The same two destinations as a published study, from the same bytes: the
 * print dialog (whose Save as PDF is the PDF) and one HTML file. A brief is
 * read in a playing hall, so the file has to open with nothing else present.
 */

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { briefToHtml } from '@/preparation/brief-html';
import type { RoundBrief } from '@/preparation/brief';
import { downloadHtml, printHtml, publishFilename } from '@/publish/publish';
import { useUi } from '@/stores/ui-store';

export function BriefDialog({
  brief,
  orientation,
  onClose,
}: {
  readonly brief: RoundBrief;
  readonly orientation: 'w' | 'b';
  readonly onClose: () => void;
}) {
  const notify = useUi((state) => state.notify);
  const html = briefToHtml(brief, orientation);
  const reported = brief.sections.filter((section) => section.lines.length > 0).length;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Round brief"
      description="One page for the round, from what is already on this machine. Every section names the population it came from."
      width="w-[560px]"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            onClick={() => {
              downloadHtml(html, publishFilename(brief.heading || 'round-brief'));
              notify({
                tone: 'success',
                message: 'Brief saved as one HTML file.',
                detail: 'Boards inside it; no stylesheet, no script, no network.',
              });
            }}
          >
            Save as HTML
          </Button>
          <Button variant="accent" onClick={() => printHtml(html)}>
            Print… (or save as PDF)
          </Button>
        </>
      }
    >
      <div className="space-y-2 p-4 text-xs text-secondary" data-testid="brief">
        <p className="font-medium text-primary">{brief.heading}</p>
        <p>
          Playing {brief.playing}
          {brief.date ? ` · ${brief.date}` : ''} · {brief.cards.length} position
          {brief.cards.length === 1 ? '' : 's'} on your sheet
        </p>
        <ul className="space-y-1">
          {brief.sections.map((section) => (
            <li key={section.title}>
              <span className="text-primary">{section.title}</span>
              <span className="text-tertiary">
                {' '}
                — {section.lines.length ? `${section.lines.length} line(s)` : section.missing}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-tertiary">
          {reported} of {brief.sections.length} sections have something to say. A section with
          nothing says which input was missing rather than disappearing.
        </p>
      </div>
    </Dialog>
  );
}
