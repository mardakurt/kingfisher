'use client';

/**
 * Deep analysis in the engine panel: ChessBase's overnight tree, as evidence.
 *
 * A form (how wide, how deep, how long per position), a progress line while
 * it runs, and a report when it stops: the start's own search beside the
 * tree's backed-up verdict, the line the tree prefers, and every place a
 * position's own search disagreed with the line that led to it. "Add to the
 * analysis" writes the tree into the game as one undo step
 * (`deepen-graft.ts`). See `src/engine/deepen.ts` for the rules.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatScore } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { createTree, startingPly } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { moveNumberOfPly } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import {
  backedUp,
  changedMinds,
  countMoves,
  positionsFor,
  principalLine,
  type DeepNode,
} from '@/engine/deepen';
import { graftDeepening } from '@/engine/deepen-graft';
import { DEFAULT_ENGINE_ID } from '@/engine/registry';
import { openInNewTab } from '@/features/tabs/tab-actions';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';

import { useDeepen } from './deepen-store';

const BREADTHS = [1, 2, 3] as const;
const PLIES = [4, 6, 8, 10, 12] as const;
const SECONDS = [1, 3, 10, 30] as const;
/** The most positions one run searches; past this, deepen from a later position. */
const MAX_BUDGET = 400;

const SELECT =
  'h-6 rounded-[5px] border border-line bg-surface-inset px-1 text-[10.5px] text-primary';

/** `1.e4 c5 2.Nf3` from a start position and a path of tree nodes. */
function lineText(start: Fen, path: readonly DeepNode[]): string {
  const first = startingPly(start);
  return path
    .map((node, index) => {
      const ply = first + index + 1;
      const white = ply % 2 === 1;
      const san = node.move?.san ?? '';
      if (white) return `${moveNumberOfPly(ply)}.${san}`;
      return index === 0 ? `${moveNumberOfPly(ply)}...${san}` : san;
    })
    .join(' ');
}

function pathTo(root: DeepNode, target: DeepNode): DeepNode[] | null {
  if (root === target) return [];
  for (const child of root.children) {
    const rest = pathTo(child, target);
    if (rest) return [child, ...rest];
  }
  return null;
}

/** Where to write: the node on the board if it is the start, else the first node that is. */
function graftTarget(tree: GameTree, currentId: NodeId, start: Fen): NodeId | null {
  const key = positionKey(start);
  const current = tree.nodes[currentId];
  if (current && positionKey(current.fen) === key) return currentId;
  const found = Object.values(tree.nodes).find((node) => positionKey(node.fen) === key);
  return found?.id ?? null;
}

export function DeepenSection({ fen }: { readonly fen: Fen }) {
  const job = useDeepen();
  const [open, setOpen] = useState(false);
  const [breadth, setBreadth] = useState<number>(2);
  const [plies, setPlies] = useState<number>(6);
  const [seconds, setSeconds] = useState<number>(3);
  const engineId = useEngine((state) => state.primary.engineId) ?? DEFAULT_ENGINE_ID;

  const budget = Math.min(MAX_BUDGET, positionsFor(breadth, plies));
  const minutes = Math.ceil((budget * seconds) / 60);

  return (
    <section
      className="border-t border-line-subtle px-2.5 py-1.5 text-[10.5px]"
      aria-label="Deep analysis"
      data-deepen={job.status}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-tertiary">Deep analysis</span>
        {job.status === 'running' ? (
          <Button size="sm" variant="ghost" onClick={job.stop}>
            Stop · {job.searched} searched
          </Button>
        ) : job.status === 'idle' ? (
          <Button size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Deepen from here…
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={job.clear}>
            Discard
          </Button>
        )}
      </div>

      {job.status === 'idle' && open ? (
        <div className="mt-1.5 space-y-1.5" data-deepen-form>
          <div className="flex flex-wrap items-center gap-2 text-tertiary">
            <label>
              Moves per position{' '}
              <select
                className={SELECT}
                value={breadth}
                onChange={(event) => setBreadth(Number(event.target.value))}
              >
                {BREADTHS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plies{' '}
              <select
                className={SELECT}
                value={plies}
                onChange={(event) => setPlies(Number(event.target.value))}
              >
                {PLIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seconds each{' '}
              <select
                className={SELECT}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
              >
                {SECONDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-tertiary" data-deepen-estimate>
            Up to {budget} positions, about {minutes} {minutes === 1 ? 'minute' : 'minutes'}. A move
            is kept when it is within 0.5 of the best for the side to move. The engine panel’s own
            search stops while this runs; it runs while this window is open and the machine awake.
          </p>
          <Button
            size="sm"
            variant="accent"
            onClick={() => {
              setOpen(false);
              void job.start(fen, engineId, {
                breadth,
                maxPlies: plies,
                marginCp: 50,
                budget,
                msPerPosition: seconds * 1000,
              });
            }}
          >
            Start
          </Button>
        </div>
      ) : null}

      {job.status === 'running' && job.startFen ? (
        <p className="mt-1 truncate text-secondary" data-deepen-progress>
          {job.searched} of up to {job.options?.budget} positions
          {job.resumed > 0
            ? ` · resumed ${job.resumed === 1 ? 'once' : `${job.resumed} times`}`
            : ''}
          {job.current.length > 0 ? ` · ${lineText(job.startFen, job.current)}` : ''}
        </p>
      ) : null}

      {job.status === 'failed' ? (
        <p className="mt-1 text-caution" role="status">
          {job.error}
        </p>
      ) : null}

      {job.status === 'done' && job.result && job.startFen ? <DeepenReport onBoard={fen} /> : null}
    </section>
  );
}

function DeepenReport({ onBoard }: { readonly onBoard: Fen }) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const applyEdit = useAnalysis((state) => state.applyEdit);
  const job = useDeepen();
  const result = job.result!;
  const start = job.startFen!;
  const root = result.root;

  const summary = useMemo(() => {
    const line = principalLine(root);
    const minds = changedMinds(root).map((mind) => ({
      mind,
      path: pathTo(root, mind.node) ?? [],
    }));
    return { line, minds, tree: backedUp(root), moves: countMoves(root) };
  }, [root]);

  const own = root.evaluation;
  const onSamePosition = positionKey(onBoard) === positionKey(start);

  const add = () => {
    const engine = job.engineName ?? 'Engine';
    const state = useAnalysis.getState();
    const target = graftTarget(state.tree, state.currentId, start);
    if (target) {
      let added = 0;
      const changed = applyEdit((tree) => {
        const grafted = graftDeepening(tree, target, root, engine);
        added = grafted.added;
        return grafted.tree;
      });
      notify({
        tone: changed ? 'success' : 'info',
        message: changed
          ? `${added} ${added === 1 ? 'move' : 'moves'} and their evaluations added. Undo with ⌘Z.`
          : 'The analysis already holds this tree.',
      });
      return;
    }
    // The start position is not in this game: the tree becomes an analysis of its own.
    const fresh = createTree(start, { Event: 'Deep analysis', Result: '*' });
    const grafted = graftDeepening(fresh, fresh.rootId, root, engine);
    void openInNewTab(router, () =>
      useAnalysis.getState().openDocument({
        tree: grafted.tree,
        document: { kind: 'untitled', title: 'Deep analysis' },
        clean: false,
      }),
    );
  };

  return (
    <div className="mt-1 space-y-1" data-deepen-report>
      <p className="text-secondary">
        {result.stopped ? 'Stopped after' : 'Finished:'} {result.searched}{' '}
        {result.searched === 1 ? 'position' : 'positions'} searched by {job.engineName},{' '}
        {summary.moves} {summary.moves === 1 ? 'move' : 'moves'} in the tree.
        {job.resumed > 0
          ? ` Picked up again ${job.resumed === 1 ? 'once' : `${job.resumed} times`} after the page running it went away.`
          : ''}
        {job.finishedUnseen && job.finishedAt
          ? ` It finished at ${new Date(job.finishedAt).toLocaleString()}, while Kingfisher was not showing it.`
          : ''}
      </p>
      {own ? (
        <p className="text-secondary tabular" data-deepen-own>
          The start’s own search: {formatScore(own.score)} at depth {own.depth}.
        </p>
      ) : null}
      {summary.tree && summary.line.length > 0 ? (
        <p className="text-secondary tabular" data-deepen-tree>
          The tree’s backed-up score: {formatScore(summary.tree)}, along{' '}
          {lineText(start, summary.line)}.
        </p>
      ) : null}
      {summary.minds.length > 0 ? (
        <div>
          <p className="text-tertiary">
            Where a position’s own search disagreed with the line that led to it:
          </p>
          <ul className="space-y-0.5" data-deepen-minds>
            {summary.minds.slice(0, 8).map(({ mind, path }) => (
              <li key={lineText(start, path)} className="text-secondary">
                after {lineText(start, path)}: expected {mind.expected.san ?? mind.expected.uci},
                prefers {mind.found.san ?? mind.found.uci}
                {mind.node.evaluation
                  ? ` (${formatScore(mind.node.evaluation.score)}, depth ${mind.node.evaluation.depth})`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-tertiary">
          No position’s own search disagreed with the line that led to it.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button size="sm" variant="accent" onClick={add}>
          {onSamePosition ? 'Add to the analysis' : 'Add to the analysis at its start'}
        </Button>
      </div>
    </div>
  );
}
