'use client';

/**
 * Publishing a study: which chapters, whether to draw the diagrams, and then
 * either the printer (whose Save as PDF is the PDF) or one HTML file to send.
 * The preview is the document itself, so what is checked is what is sent.
 */

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { publishHtml } from '@/publish/chapter-html';
import { downloadHtml, printHtml, publishFilename } from '@/publish/publish';
import type { StudyWithChapters } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function PublishDialog({
  study,
  onClose,
}: {
  readonly study: StudyWithChapters;
  readonly onClose: () => void;
}) {
  const notify = useUi((state) => state.notify);
  const [chosen, setChosen] = useState<readonly string[]>(() =>
    study.chapters.map((chapter) => chapter.id),
  );
  const [diagrams, setDiagrams] = useState(true);
  const [byline, setByline] = useState('');

  const chapters = useMemo(
    () => study.chapters.filter((chapter) => chosen.includes(chapter.id)),
    [chosen, study.chapters],
  );
  const html = useMemo(
    () =>
      publishHtml({
        study: study.study,
        chapters,
        options: { diagrams, ...(byline.trim() ? { byline: byline.trim() } : {}) },
      }),
    [byline, chapters, diagrams, study.study],
  );

  /*
    Publishing reads the stored chapters, because a study is many chapters and
    only one of them is on the board. That makes an unsaved edit invisible in
    the file — the moves are on screen and not in the document — so the dialog
    says so rather than letting somebody send a chapter without its last line.
  */
  const document_ = useAnalysis((state) => state.document);
  const unsaved = useAnalysis((state) => state.revision !== state.savedRevision || state.saving);
  const openChapter =
    document_.kind === 'study-chapter' && chosen.includes(document_.chapterId) ? document_ : null;
  const pending = Boolean(openChapter && unsaved);

  const marked = chapters.reduce(
    (sum, chapter) =>
      sum + Object.values(chapter.tree.nodes).filter((node) => node.meta.critical).length,
    0,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Publish study"
      description="One file, with the boards drawn inside it: it opens on a machine that has never run Kingfisher, with no network."
      width="w-[560px]"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            disabled={chapters.length === 0}
            onClick={() => {
              downloadHtml(html, publishFilename(study.study.title));
              notify({
                tone: 'success',
                message: `${chapters.length} chapter${chapters.length === 1 ? '' : 's'} saved as one HTML file.`,
                detail: 'Everything is inside it: no stylesheet, no script, no network.',
              });
            }}
          >
            Save as HTML
          </Button>
          <Button variant="accent" disabled={chapters.length === 0} onClick={() => printHtml(html)}>
            Print… (or save as PDF)
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-4 text-xs text-secondary" data-testid="publish">
        <fieldset>
          <legend className="text-[10px] text-tertiary">Chapters</legend>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {study.chapters.map((chapter) => (
              <li key={chapter.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chosen.includes(chapter.id)}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked
                          ? [...current, chapter.id]
                          : current.filter((id) => id !== chapter.id),
                      )
                    }
                  />
                  <span className="truncate text-primary">{chapter.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={diagrams}
            onChange={(event) => setDiagrams(event.target.checked)}
          />
          Draw a diagram at every position marked critical
          <span className="text-tertiary">
            ({marked} marked in {chapters.length === 1 ? 'this chapter' : 'these chapters'})
          </span>
        </label>
        <label className="block">
          Byline (optional)
          <input
            aria-label="Byline"
            value={byline}
            onChange={(event) => setByline(event.target.value)}
            placeholder="Prepared by …"
            className="mt-1 block w-full rounded border border-line bg-surface-2 p-2 text-primary"
          />
        </label>
        {pending ? (
          <p
            role="status"
            className="rounded-[6px] border border-caution/50 bg-caution/10 p-2 text-caution"
            data-testid="publish-unsaved"
          >
            “{openChapter?.title}” has edits that are still being saved. The file is made from what
            is stored, so they are not in it yet — wait for the chapter to say Saved.
          </p>
        ) : null}
        <p className="text-tertiary">
          {(html.length / 1024).toFixed(0)} kB. The diagrams are drawn as SVG inside the file and
          the figurines are Unicode, so it needs no font, no image and no connection to be read.
        </p>
      </div>
    </Dialog>
  );
}
