'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { invalidateModelGames, useRepertoires } from '@/features/persistence/queries';
import { MODEL_GAME_TAGS, type ModelGameTag } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function ModelGameDialog() {
  const open = useUi((state) => state.modelGameOpen);
  return open ? <ModelGameForm /> : null;
}

function ModelGameForm() {
  const queryClient = useQueryClient();
  const setOpen = useUi((state) => state.setModelGameOpen);
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const { node } = useAnalysisPosition();
  const repertoires = useRepertoires().data ?? [];
  const [kinds, setKinds] = useState<ReadonlySet<ModelGameTag>>(new Set(['model']));
  const [linkPosition, setLinkPosition] = useState(true);
  const [repertoireId, setRepertoireId] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (document.kind !== 'database-game') return;
    if (kinds.size === 0) {
      setError('Choose at least one model-game tag.');
      return;
    }
    setBusy(true);
    try {
      await (
        await getRepositories()
      ).modelGames.create({
        gameId: document.gameId,
        kinds: [...kinds],
        ...(linkPosition ? { positionKey: positionKey(node.fen) } : {}),
        ...(repertoireId ? { repertoireId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      invalidateModelGames(queryClient);
      notify({ tone: 'success', message: 'Model-game link saved.' });
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'The model-game link could not be saved.',
      );
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : setOpen(false))}
      title="Mark as model game"
      description="This stores a reference to the imported game, never a duplicate copy."
      width="w-[520px]"
      footer={
        <>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => void submit()}
            disabled={busy || document.kind !== 'database-game'}
          >
            {busy ? 'Saving…' : 'Save link'}
          </Button>
        </>
      }
    >
      {document.kind !== 'database-game' ? (
        <p className="text-2xs leading-relaxed text-tertiary">
          Open an imported database game first. Studies and untitled analyses are authored
          documents, not model-game sources.
        </p>
      ) : (
        <>
          <p className="text-xs text-primary">{document.title}</p>
          <fieldset className="mt-3">
            <legend className="text-2xs text-tertiary">Tags</legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {MODEL_GAME_TAGS.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 rounded-[4px] border border-line px-2 py-1.5 text-2xs text-secondary"
                >
                  <input
                    type="checkbox"
                    checked={kinds.has(tag.id)}
                    onChange={() => {
                      setKinds((current) => {
                        const next = new Set(current);
                        if (next.has(tag.id)) next.delete(tag.id);
                        else next.add(tag.id);
                        return next;
                      });
                    }}
                  />
                  {tag.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 flex items-center gap-2 text-2xs text-secondary">
            <input
              type="checkbox"
              checked={linkPosition}
              onChange={(event) => setLinkPosition(event.target.checked)}
            />
            Link the current canonical position
          </label>
          <label className="mt-3 block text-2xs text-tertiary">
            Repertoire (optional)
            <select
              value={repertoireId}
              onChange={(event) => setRepertoireId(event.target.value)}
              className={FIELD}
            >
              <option value="">None</option>
              {repertoires.map((repertoire) => (
                <option key={repertoire.id} value={repertoire.id}>
                  {repertoire.title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-2xs text-tertiary">
            Context note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={AREA}
              placeholder="Classic minority-attack plan from this structure."
            />
          </label>
          <label className="mt-3 block text-2xs text-tertiary">
            Additional tags (comma separated)
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className={FIELD}
            />
          </label>
        </>
      )}
      {error ? <p className="mt-2 text-2xs text-negative">{error}</p> : null}
    </Dialog>
  );
}

const FIELD =
  'mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none focus:border-accent/60';
const AREA =
  'mt-1 min-h-20 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-xs leading-relaxed text-primary outline-none focus:border-accent/60';
