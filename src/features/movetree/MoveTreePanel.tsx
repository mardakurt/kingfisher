'use client';

import { Panel, PanelHeader } from '@/components/ui/Panel';
import { MoveTree } from '@/features/movetree/MoveTree';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/**
 * The move tree as a self-contained module.
 *
 * It reads the tree and cursor from the workspace context and its handlers
 * from the stores, which is what makes it placeable: a module that needed five
 * props from its route could only ever live where that route put it. The
 * board column, the dock and the lower panel all render this same component,
 * so a move tree moved to the right behaves identically to one below the
 * board.
 */
export function MoveTreePanel({
  withHeader = true,
  className,
}: {
  readonly withHeader?: boolean;
  readonly className?: string;
}) {
  const { tree, currentId } = useChessWorkspace();
  const goTo = useAnalysis((state) => state.goTo);
  const setMoveMenu = useUi((state) => state.setMoveMenu);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);

  return (
    <Panel className={cn('h-full', className)}>
      {withHeader ? <PanelHeader>Moves &amp; variations</PanelHeader> : null}
      <div className="min-h-0 flex-1">
        <MoveTree
          tree={tree}
          currentId={currentId}
          onSelect={goTo}
          onContextMenu={(nodeId, event) =>
            setMoveMenu({ nodeId, x: event.clientX, y: event.clientY })
          }
          onEditComment={setCommentingNodeId}
        />
      </div>
    </Panel>
  );
}
