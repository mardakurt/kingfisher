import type { GameTree, NodeId } from './types';

/** Only a filename travels with a lesson. File bytes and filesystem paths do not. */
export const VIDEO_FILENAME_HEADER = 'KFVideoFilename';

export interface VideoCue {
  readonly nodeId: NodeId;
  readonly seconds: number;
  readonly label: string;
}

export function videoCues(tree: GameTree): readonly VideoCue[] {
  return Object.values(tree.nodes)
    .filter((node) => validVideoTime(node.meta.videoSeconds))
    .sort(
      (a, b) =>
        a.meta.videoSeconds! - b.meta.videoSeconds! || a.ply - b.ply || a.id.localeCompare(b.id),
    )
    .map((node) => ({
      nodeId: node.id,
      seconds: node.meta.videoSeconds!,
      label: node.move
        ? `${Math.ceil(node.ply / 2)}${node.ply % 2 ? '.' : '…'} ${node.move.san}`
        : 'Starting position',
    }));
}

export function validVideoTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400;
}

/** Seeking backwards uses the last preceding cue too, never a stale cursor. */
export function videoNodeAt(tree: GameTree, seconds: number, cues = videoCues(tree)): NodeId {
  let id = tree.rootId;
  for (const cue of cues) {
    if (cue.seconds > seconds) break;
    id = cue.nodeId;
  }
  return id;
}

/** One time names one position. Moving a cue replaces any cue at that time. */
export function setVideoCue(tree: GameTree, nodeId: NodeId, seconds: number | null): GameTree {
  const target = tree.nodes[nodeId];
  if (!target || (seconds !== null && !validVideoTime(seconds))) return tree;
  const nodes = { ...tree.nodes };
  for (const node of Object.values(tree.nodes)) {
    if (node.id !== nodeId && (seconds === null || node.meta.videoSeconds !== seconds)) continue;
    const { videoSeconds: _previous, ...meta } = node.meta;
    nodes[node.id] = {
      ...node,
      meta: node.id === nodeId && seconds !== null ? { ...meta, videoSeconds: seconds } : meta,
    };
  }
  return { ...tree, nodes };
}

export function clearVideoLesson(tree: GameTree): GameTree {
  const { [VIDEO_FILENAME_HEADER]: _filename, ...headers } = tree.headers;
  const nodes = { ...tree.nodes };
  for (const node of Object.values(tree.nodes)) {
    const { videoSeconds: _cue, ...meta } = node.meta;
    nodes[node.id] = { ...node, meta };
  }
  return { ...tree, headers, nodes };
}
