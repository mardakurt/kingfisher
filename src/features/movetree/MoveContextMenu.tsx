'use client';

/**
 * What you can do to a move.
 *
 * These actions belong on a context menu rather than on the move itself: a
 * notation window with five buttons per move is unreadable, and reading the
 * game is what the notation window is for. The same actions are reachable from
 * the command palette and the keyboard, so nothing here is the only route to
 * anything.
 */

import { useMemo, useState } from 'react';

import { nagInfo, qualityNags } from '@/chess/annotations';
import { isOnMainline, siblings, variationHeadId } from '@/chess/tree/tree';
import { ArrowDown, ArrowUp, Copy, Pencil, Scissors, Search, Trash } from '@/components/icons';
import { ContextMenu, type MenuSection } from '@/components/ui/Menu';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { DEFAULT_QUESTION_PROMPT } from '@/chess/tree/questions';
import type { NodeId } from '@/chess/tree/types';
import { serializeMovetext, serializePgnFrom } from '@/chess/pgn';
import { nodePath } from '@/chess/tree/tree';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function MoveContextMenu() {
  const target = useUi((state) => state.moveMenu);
  const setMoveMenu = useUi((state) => state.setMoveMenu);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);
  const notify = useUi((state) => state.notify);

  const tree = useAnalysis((state) => state.tree);
  const goTo = useAnalysis((state) => state.goTo);
  const promote = useAnalysis((state) => state.promote);
  const demote = useAnalysis((state) => state.demote);
  const promoteToMain = useAnalysis((state) => state.promoteToMain);
  const deleteNode = useAnalysis((state) => state.deleteNode);
  const deleteVariation = useAnalysis((state) => state.deleteVariation);
  const truncate = useAnalysis((state) => state.truncate);
  const toggleNag = useAnalysis((state) => state.toggleNag);
  const clearShapes = useAnalysis((state) => state.clearShapes);
  const setQuestion = useAnalysis((state) => state.setQuestion);
  /** The move being made a question, while its prompt is asked for. */
  const [asking, setAsking] = useState<NodeId | null>(null);

  const nodeId = target?.nodeId ?? null;
  const node = nodeId ? tree.nodes[nodeId] : undefined;

  const sections = useMemo<readonly MenuSection[]>(() => {
    if (!nodeId || !node) return [];

    const head = variationHeadId(tree, nodeId);
    const order = head ? siblings(tree, head) : [];
    const index = head ? order.indexOf(head) : -1;
    const onMainline = isOnMainline(tree, nodeId);
    const hasSideLine = head !== null;

    return [
      {
        id: 'annotate',
        items: [
          {
            id: 'comment',
            label: node.comment ? 'Edit comment…' : 'Add comment…',
            shortcut: 'C',
            icon: <Pencil />,
            run: () => {
              goTo(nodeId);
              setCommentingNodeId(nodeId);
            },
          },
          /*
           * Phase 56: "Find this position elsewhere in my work" is the
           * one cross-collection lookup that is most useful from a
           * single move. The user has the position on the board, the
           * command palette would ask them to paste it, and pasting a
           * FEN is not what an analysis session is for. The command
           * palette still does it on FEN input; this is the one-click
           * surface for the same question.
           */
          {
            id: 'find-position',
            label: 'Find this position in my work…',
            icon: <Search />,
            run: () => {
              const fen = node.fen;
              goTo(nodeId);
              window.dispatchEvent(
                new CustomEvent('kingfisher:open-search', { detail: { query: fen } }),
              );
            },
          },
          /*
            Phase 84: a chapter's homework. The marked move is the answer; the
            question is asked at the position before it (questions.ts).
          */
          node.meta.question === undefined
            ? {
                id: 'question',
                label: 'Ask this move as a question…',
                run: () => setAsking(nodeId),
              }
            : {
                id: 'question',
                label: 'Remove the question',
                run: () => setQuestion(nodeId, null),
              },
          ...qualityNags.map((nag) => ({
            id: `nag-${nag.code}`,
            label: `${nag.symbol}  ${nag.label}${node.nags.includes(nag.code) ? ' ✓' : ''}`,
            shortcut: String(nag.code),
            run: () => toggleNag(nodeId, nag.code),
          })),
          ...(node.nags.length > 0
            ? [
                {
                  id: 'clear-nags',
                  label: 'Remove glyphs',
                  run: () => {
                    for (const code of [...node.nags]) {
                      if (nagInfo(code)) toggleNag(nodeId, code);
                    }
                  },
                },
              ]
            : []),
          ...(node.shapes.length > 0
            ? [
                {
                  id: 'clear-shapes',
                  label: `Clear ${node.shapes.length} arrow(s) and highlight(s)`,
                  shortcut: 'X',
                  run: () => clearShapes(nodeId),
                },
              ]
            : []),
        ],
      },
      {
        id: 'order',
        items: [
          {
            id: 'promote-main',
            label: 'Make this the main line',
            shortcut: '⇧M',
            disabled: onMainline,
            run: () => promoteToMain(nodeId),
          },
          {
            id: 'promote',
            label: 'Move variation up',
            shortcut: '⇧P',
            icon: <ArrowUp />,
            disabled: !hasSideLine || index <= 0,
            run: () => promote(nodeId),
          },
          {
            id: 'demote',
            label: 'Move variation down',
            icon: <ArrowDown />,
            disabled: !hasSideLine || index < 0 || index >= order.length - 1,
            run: () => demote(nodeId),
          },
        ],
      },
      {
        id: 'copy',
        items: [
          {
            id: 'copy-line',
            label: 'Copy the line to here',
            icon: <Copy />,
            run: () => {
              const text = serializeMovetext(tree, nodePath(tree, nodeId));
              void navigator.clipboard
                .writeText(text)
                .then(() => notify({ tone: 'success', message: 'Line copied.' }))
                .catch(() =>
                  notify({ tone: 'error', message: 'The clipboard is not available here.' }),
                );
            },
          },
          {
            id: 'copy-pgn-from-here',
            label: 'Copy PGN from here',
            icon: <Copy />,
            run: () => {
              void navigator.clipboard
                .writeText(serializePgnFrom(tree, nodeId))
                .then(() => notify({ tone: 'success', message: 'PGN from this move copied.' }))
                .catch(() =>
                  notify({ tone: 'error', message: 'The clipboard is not available here.' }),
                );
            },
          },
        ],
      },
      {
        id: 'delete',
        items: [
          {
            id: 'truncate',
            label: 'Delete everything after this move',
            icon: <Scissors />,
            disabled: node.children.length === 0,
            run: () => truncate(nodeId),
          },
          {
            id: 'delete-variation',
            label: 'Delete this variation',
            icon: <Trash />,
            danger: true,
            disabled: !hasSideLine,
            run: () => deleteVariation(nodeId),
          },
          {
            id: 'delete',
            label: 'Delete from this move',
            shortcut: '⌫',
            icon: <Trash />,
            danger: true,
            run: () => deleteNode(nodeId),
          },
        ],
      },
    ];
  }, [
    clearShapes,
    deleteNode,
    deleteVariation,
    demote,
    goTo,
    node,
    nodeId,
    notify,
    promote,
    promoteToMain,
    setCommentingNodeId,
    setQuestion,
    toggleNag,
    tree,
    truncate,
  ]);

  const askingNode = asking ? tree.nodes[asking] : undefined;

  return (
    <>
      {target && node ? (
        <ContextMenu
          x={target.x}
          y={target.y}
          sections={sections}
          onClose={() => setMoveMenu(null)}
        />
      ) : null}
      {/* Mounted per question: the dialog keeps its busy state while it lives. */}
      {askingNode ? (
        <PromptDialog
          key={asking}
          open
          title={`Ask ${askingNode?.move?.san ?? 'this move'} as a question`}
          description="When the chapter is solved, the board stops before this move and asks for it. The move is the answer; a sibling you marked ! or !! is accepted too."
          label="Question"
          initialValue={DEFAULT_QUESTION_PROMPT}
          confirmLabel="Ask it"
          onCancel={() => setAsking(null)}
          onSubmit={(prompt) => {
            if (asking) setQuestion(asking, prompt === DEFAULT_QUESTION_PROMPT ? '' : prompt);
            setAsking(null);
            notify({ tone: 'success', message: 'Question added. Solve it from the chapter.' });
          }}
        />
      ) : null}
    </>
  );
}
