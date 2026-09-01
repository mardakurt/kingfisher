'use client';

import { useState } from 'react';

import { parseFen } from '@/chess/fen';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { importPgn } from '@/features/games/import-pgn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

type Detected = 'fen' | 'pgn' | 'empty' | 'unknown';

/**
 * One paste box for both formats.
 *
 * Asking the user whether they are pasting a FEN or a PGN is a question the
 * software can answer itself: a FEN is one line with six fields, a PGN has tag
 * pairs or move numbers. Getting this right removes a decision from a very
 * common action.
 */
function detect(text: string): Detected {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  if (!trimmed.includes('\n') && parseFen(trimmed).ok) return 'fen';
  if (/\[\s*\w+\s+"/.test(trimmed) || /\d+\s*\.\s*[A-Za-z]/.test(trimmed)) return 'pgn';
  if (parseFen(trimmed.split('\n')[0] ?? '').ok) return 'fen';
  return 'unknown';
}

export function ImportDialog() {
  const open = useUi((state) => state.importOpen);
  // Mounted only while open, so the paste box always starts empty.
  return open ? <ImportForm /> : null;
}

function ImportForm() {
  const setOpen = useUi((state) => state.setImportOpen);
  const notify = useUi((state) => state.notify);
  const loadFen = useAnalysis((state) => state.loadFen);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const kind = detect(text);

  const submit = () => {
    if (kind === 'fen') {
      const result = loadFen(text.trim());
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      notify({ tone: 'success', message: 'Position loaded.' });
      setOpen(false);
      return;
    }

    const result = importPgn(text);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { games, indexed, issues } = result.value;
    notify({
      tone: issues > 0 ? 'info' : 'success',
      message: games > 1 ? `Loaded the first of ${games} games.` : 'Game loaded.',
      detail: [
        `${indexed} game${indexed === 1 ? '' : 's'} added to your local database.`,
        issues > 0 ? `${issues} part(s) could not be read and were skipped.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
    setOpen(false);
  };

  return (
    <Dialog
      open
      onClose={() => setOpen(false)}
      title="Import a game or position"
      description="Paste a PGN or a FEN. The format is detected automatically."
      width="w-[620px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={submit}
            disabled={kind === 'empty' || kind === 'unknown'}
          >
            {kind === 'fen' ? 'Load position' : 'Load game'}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        autoFocus
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
        }}
        spellCheck={false}
        placeholder={
          '[Event "…"]\n\n1. e4 e5 2. Nf3 Nc6 …\n\nor\n\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        }
        className="h-56 w-full resize-none rounded-[4px] border border-line bg-surface-inset px-3 py-2 font-mono text-[11.5px] leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
      />

      <div className="mt-2 flex items-center justify-between gap-3 text-2xs">
        <span className="text-tertiary">
          {kind === 'fen' && 'Detected a FEN position.'}
          {kind === 'pgn' && 'Detected a PGN game.'}
          {kind === 'unknown' && 'This does not look like a PGN or a FEN.'}
          {kind === 'empty' && 'Paste a game or a position. ⌘↵ to load.'}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>
    </Dialog>
  );
}
