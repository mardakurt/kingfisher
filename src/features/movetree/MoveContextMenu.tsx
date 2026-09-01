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

import { useMemo } from 'react';

import { nagInfo, qualityNags } from '@/chess/annotations';
import { isOnMainline, siblings, variationHeadId } from '@/chess/tree/tree';
import { ArrowDown, ArrowUp, Copy, Pencil, Scissors, Trash } from '@/components/icons';
import { ContextMenu, type MenuSection } from '@/components/ui/Menu';
import { serializeMovetext } from '@/chess/pgn';
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
    toggleNag,
    tree,
    truncate,
  ]);

  if (!target || !node) return null;

  return (
    <ContextMenu x={target.x} y={target.y} sections={sections} onClose={() => setMoveMenu(null)} />
  );
}
