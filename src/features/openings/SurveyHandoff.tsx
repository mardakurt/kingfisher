'use client';

import { useState } from 'react';
import { positionKey } from '@/chess/fen';
import { nodePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { invalidateStudies, useRepositoryMutation } from '@/features/persistence/queries';
import { surveyHandoff } from '@/theory/survey-handoff';

export function SurveyHandoff({ tree }: { readonly tree: GameTree }) {
  const [answers, setAnswers] = useState<readonly string[]>([]);
  const [title, setTitle] = useState('Opening preparation');
  const [saved, setSaved] = useState(false);
  const save = useRepositoryMutation(
    async (repositories, selected: readonly string[]) => {
      // Validate and build before creating anything. A failed chapter save leaves a recoverable study.
      const prepared = surveyHandoff(tree, selected);
      const study = await repositories.studies.create({
        title: title.trim() || 'Opening preparation',
      });
      return repositories.studies.createChapter({
        studyId: study.id,
        title: 'Selected survey moves',
        tree: prepared,
      });
    },
    (client) => invalidateStudies(client),
  );
  return (
    <fieldset
      className="space-y-2 rounded border border-line p-2"
      disabled={save.isPending || saved}
    >
      <legend>Prepare selected moves</legend>
      <p className="text-secondary">
        Choose one intended answer at each position. Their paths and dated source counts become a
        study chapter with training questions. Open Studies to rehearse or print it; portable
        backups include the chapter.
      </p>
      <label>
        Study title
        <input
          aria-label="Survey study title"
          className="block w-full bg-surface-inset p-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="max-h-44 overflow-y-auto">
        {Object.values(tree.nodes)
          .filter((node) => node.move)
          .map((node) => (
            <label
              key={node.id}
              className="block"
              style={{
                paddingLeft: `${Math.min(node.ply - tree.nodes[tree.rootId]!.ply, 8) * 8}px`,
              }}
            >
              <input
                type="checkbox"
                checked={answers.includes(node.id)}
                onChange={(event) =>
                  setAnswers((previous) =>
                    event.target.checked
                      ? [
                          ...previous.filter(
                            (id) =>
                              positionKey(tree.nodes[tree.nodes[id]!.parentId!]!.fen) !==
                              positionKey(tree.nodes[node.parentId!]!.fen),
                          ),
                          node.id,
                        ]
                      : previous.filter((id) => id !== node.id),
                  )
                }
              />{' '}
              {nodePath(tree, node.id)
                .slice(1)
                .map((id) => {
                  const move = tree.nodes[id]!;
                  return `${Math.ceil(move.ply / 2)}${move.ply % 2 ? '.' : '…'} ${move.move!.san}`;
                })
                .join(' ')}
            </label>
          ))}
      </div>
      <Button
        size="sm"
        disabled={!answers.length || save.isPending || saved}
        onClick={() =>
          void save
            .mutateAsync(answers)
            .then(() => setSaved(true))
            .catch(() => undefined)
        }
      >
        Save preparation chapter
      </Button>
      {saved && (
        <p role="status">Saved in Studies with {answers.length} intended-move questions.</p>
      )}
      {save.error && (
        <p role="alert">{save.error instanceof Error ? save.error.message : 'Saving failed.'}</p>
      )}
    </fieldset>
  );
}
