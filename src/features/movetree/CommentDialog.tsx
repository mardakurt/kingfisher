'use client';

/**
 * Editing the prose attached to a move.
 *
 * A dialog rather than an inline field, for one reason: the board answers to
 * single-key shortcuts, and a comment box that lives inside the notation window
 * makes every letter typed a gamble on whether focus is where the user thinks.
 * A modal makes the mode explicit, and the global shortcut handler already
 * refuses to act while a text field has focus.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { moveNumberOfPly } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function CommentDialog() {
  const nodeId = useUi((state) => state.commentingNodeId);
  return nodeId ? <CommentForm nodeId={nodeId} /> : null;
}

function CommentForm({ nodeId }: { readonly nodeId: string }) {
  const close = useUi((state) => state.setCommentingNodeId);
  const tree = useAnalysis((state) => state.tree);
  const comment = useAnalysis((state) => state.comment);

  const node = tree.nodes[nodeId];
  const [text, setText] = useState(node?.comment ?? '');

  if (!node) return null;

  const label = node.move
    ? `${moveNumberOfPly(node.ply)}${node.ply % 2 === 1 ? '.' : '…'} ${node.move.san}`
    : 'the starting position';

  const submit = () => {
    comment(nodeId, text);
    close(null);
  };

  return (
    <Dialog
      open
      onClose={() => close(null)}
      title={`Comment on ${label}`}
      description="Kept with the move and written out with the PGN, including through export and re-import."
      width="w-[560px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          {node.comment && (
            <Button
              variant="danger"
              onClick={() => {
                comment(nodeId, '');
                close(null);
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="accent" onClick={submit}>
            Save comment
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="What is the idea? What did you miss? What should you remember?"
        className="h-40 w-full resize-none rounded-[4px] border border-line bg-surface-inset px-3 py-2 text-xs leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
      />
      <p className="mt-1.5 text-[10.5px] text-tertiary">⌘↵ to save. Line breaks are preserved.</p>
    </Dialog>
  );
}
