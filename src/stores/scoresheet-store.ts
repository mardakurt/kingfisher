'use client';
/**
 * The scoresheet session: the sheet, the gap being reconstructed, and the
 * reading in flight. The moves themselves live in the analysis store — a
 * move from the sheet is a move on the board — and every flag lives in the
 * tree as a comment that begins with `Check against the sheet`, so the flag
 * list is read from the tree and survives the save.
 */
import { create } from 'zustand';

import { Position } from '@/chess/position';
import type { NodeId } from '@/chess/tree/types';
import { nodePath } from '@/chess/tree/tree';
import { matchToken } from '@/scoresheet/match';
import { readTokens, type Ply } from '@/scoresheet/reading';
import { reconstructGap, type Reconstruction } from '@/scoresheet/reconstruct';
import { useAnalysis } from '@/stores/analysis-store';

export const FLAG_PREFIX = 'Check against the sheet';

export interface SheetPhoto {
  readonly url: string;
  readonly name: string;
  readonly file: File;
}

export interface GapState {
  /** The node the gap follows: the move at the gap is played from here. */
  readonly nodeId: NodeId;
  readonly buffer: readonly string[];
  readonly reconstruction: Reconstruction | null;
}

interface ScoresheetState {
  photo: SheetPhoto | null;
  gap: GapState | null;
  reading: { busy: boolean; message: string | null; error: string | null };
  setPhoto(file: File | null): void;
  /** One cell as written. Returns what happened, for the entry line to show. */
  enter(token: string): string | null;
  /** Take back the last entered cell: a buffered one, or the last move on the board. */
  takeBack(): void;
  /** Pick the move for the open gap when several fit. */
  fillGap(san: string): void;
  /** Rewrite a flagged move as one of its alternatives. */
  resolve(nodeId: NodeId, san: string): string | null;
  /** Apply a reading (typed or from a model): tokens onto the board from the current node. */
  applyTokens(tokens: readonly string[], uncertain?: ReadonlySet<number>): string | null;
  setReading(reading: Partial<ScoresheetState['reading']>): void;
  reset(): void;
}

const MAX_BUFFER = 8;

/** The position the analysis store's current node holds. */
function currentPosition(): Position {
  const state = useAnalysis.getState();
  const node = state.tree.nodes[state.currentId];
  const built = Position.fromFen(node?.fen ?? '');
  return built.ok ? built.value : Position.initial();
}

function flagNote(ply: Ply): string {
  return `${FLAG_PREFIX}: ${ply.note ?? `read as ${ply.san}`}.`;
}

/** Play one accepted ply into the tree, with its flag and alternatives when it has them. */
function playPly(ply: Ply): boolean {
  const analysis = useAnalysis.getState();
  const parentId = analysis.currentId;
  const played = analysis.playSan(ply.san);
  if (!played.ok) return false;
  if (ply.status !== 'read') {
    useAnalysis.getState().comment(played.value, flagNote(ply));
    const parent = useAnalysis.getState().tree.nodes[parentId];
    const parentPosition = parent ? Position.fromFen(parent.fen) : null;
    if (parentPosition?.ok) {
      for (const alternative of ply.alternatives ?? []) {
        const move = parentPosition.value.legalMoves().find((m) => m.san === alternative);
        if (move)
          useAnalysis.getState().toggleShape(parentId, {
            kind: 'arrow',
            from: move.from,
            to: move.to,
            brush: 'yellow',
          });
      }
    }
  }
  return true;
}

export const useScoresheet = create<ScoresheetState>((set, get) => ({
  photo: null,
  gap: null,
  reading: { busy: false, message: null, error: null },

  setPhoto: (file) => {
    const previous = get().photo;
    if (previous) URL.revokeObjectURL(previous.url);
    set({ photo: file ? { url: URL.createObjectURL(file), name: file.name, file } : null });
  },

  enter: (token) => {
    const text = token.trim();
    if (!text) return null;
    const gap = get().gap;
    if (gap) return bufferToken(text);
    if (/^[?_\-–—]+$/.test(text)) {
      set({ gap: { nodeId: useAnalysis.getState().currentId, buffer: [], reconstruction: null } });
      return 'Cell skipped. Keep entering the moves after it; the gap is filled from them.';
    }
    const reading = readTokens(currentPosition(), [text]);
    const ply = reading.plies[0];
    if (!ply) return `Nothing legal here reads as "${text}".`;
    playPly(ply);
    return ply.status === 'read' ? null : `Flagged: ${ply.note}.`;
  },

  takeBack: () => {
    const gap = get().gap;
    if (gap) {
      if (gap.buffer.length === 0) {
        set({ gap: null });
        return;
      }
      const buffer = gap.buffer.slice(0, -1);
      set({ gap: { ...gap, buffer, reconstruction: null } });
      return;
    }
    const analysis = useAnalysis.getState();
    const node = analysis.tree.nodes[analysis.currentId];
    if (!node || node.parentId === null) return;
    analysis.deleteNode(node.id);
  },

  fillGap: (san) => {
    const gap = get().gap;
    if (!gap) return;
    const candidate = gap.reconstruction?.all.find((c) => c.move.san === san);
    if (!candidate) return;
    commitGap(gap, candidate.move.san, candidate.reading.plies);
    set({ gap: null });
  },

  resolve: (nodeId, san) => {
    const analysis = useAnalysis.getState();
    const node = analysis.tree.nodes[nodeId];
    if (!node || node.parentId === null) return 'That move is no longer on the board.';
    const parent = analysis.tree.nodes[node.parentId];
    if (!parent) return 'That move is no longer on the board.';
    // The moves that followed, to be replayed after the replacement.
    const following: string[] = [];
    let cursor = node;
    while (cursor.children[0]) {
      cursor = analysis.tree.nodes[cursor.children[0]]!;
      if (cursor.move) following.push(cursor.move.san);
    }
    const start = Position.fromFen(parent.fen);
    if (!start.ok) return 'The position before that move could not be rebuilt.';
    const replaced = start.value.advanceSan(san);
    if (!replaced.ok) return `${san} is not legal there.`;
    const rest = readTokens(replaced.value.next, following, { exact: true });
    analysis.deleteNode(nodeId);
    useAnalysis.getState().goTo(parent.id);
    useAnalysis.getState().clearShapes(parent.id);
    const played = useAnalysis.getState().playSan(san);
    if (!played.ok) return `${san} could not be played.`;
    for (const ply of rest.plies) playPly({ ...ply, status: 'read' });
    if (rest.stopped) {
      return `${san} taken; the moves from "${rest.stopped.token}" no longer fit and were dropped — enter them again from the sheet.`;
    }
    return null;
  },

  applyTokens: (tokens, uncertain) => {
    const reading = readTokens(currentPosition(), tokens, { uncertain });
    for (const ply of reading.plies) playPly(ply);
    if (!reading.stopped) return null;
    const { index, token, reason } = reading.stopped;
    if (/^[?_\-–—]+$/.test(token)) {
      // A cell the reader could not see: open the gap and feed what followed.
      set({ gap: { nodeId: useAnalysis.getState().currentId, buffer: [], reconstruction: null } });
      const rest = tokens.slice(index + 1, index + 1 + MAX_BUFFER);
      let message: string | null = null;
      for (const later of rest) message = bufferToken(later) ?? message;
      return message ?? `Cell ${index + 1} could not be read; the moves after it are being fitted.`;
    }
    return `Stopped at cell ${index + 1} ("${token}"): ${reason}. Nothing after it was taken.`;
  },

  setReading: (reading) => set((state) => ({ reading: { ...state.reading, ...reading } })),

  reset: () => {
    const previous = get().photo;
    if (previous) URL.revokeObjectURL(previous.url);
    set({ photo: null, gap: null, reading: { busy: false, message: null, error: null } });
  },
}));

/** Add a token to the open gap's buffer and try to fill the gap. */
function bufferToken(token: string): string | null {
  const state = useScoresheet.getState();
  const gap = state.gap;
  if (!gap) return null;
  if (/^[?_\-–—]+$/.test(token))
    return 'Two cells in a row cannot be read; fill the first before skipping another.';
  const buffer = [...gap.buffer, token];
  const analysis = useAnalysis.getState();
  const node = analysis.tree.nodes[gap.nodeId];
  const position = node ? Position.fromFen(node.fen) : null;
  if (!position?.ok) {
    useScoresheet.setState({ gap: null });
    return 'The gap lost its place on the board.';
  }
  const reconstruction = reconstructGap(position.value, buffer);
  if (reconstruction.survivors.length === 1) {
    const only = reconstruction.survivors[0]!;
    commitGap({ ...gap, buffer, reconstruction }, only.move.san, only.reading.plies);
    useScoresheet.setState({ gap: null });
    return `Gap filled: ${only.move.san}, the only move that fits the ${buffer.length} after it. Flagged to check.`;
  }
  if (reconstruction.survivors.length === 0) {
    const at = reconstruction.blockedAt ?? 0;
    useScoresheet.setState({ gap: { ...gap, buffer, reconstruction } });
    return `No move at the gap lets "${buffer[at]}" follow. Check that cell on the sheet; take it back with Backspace.`;
  }
  useScoresheet.setState({ gap: { ...gap, buffer, reconstruction } });
  return buffer.length >= MAX_BUFFER
    ? `${reconstruction.survivors.length} moves still fit after ${buffer.length} cells; choose one below.`
    : `${reconstruction.survivors.length} moves fit so far; keep entering, or choose one below.`;
}

/** Play the gap's move, flagged, then the buffered moves after it. */
function commitGap(gap: GapState, san: string, plies: readonly Ply[]): void {
  const analysis = useAnalysis.getState();
  analysis.goTo(gap.nodeId);
  const played = useAnalysis.getState().playSan(san);
  if (!played.ok) return;
  const count = gap.buffer.length;
  useAnalysis
    .getState()
    .comment(
      played.value,
      `${FLAG_PREFIX}: the cell could not be read; ${san} is the move that fits the ${count} after it.`,
    );
  for (const ply of plies) playPly({ ...ply, status: 'read' });
}

/** Every flagged move on the main line from the root, in order. */
export function flaggedNodes(): readonly {
  id: NodeId;
  san: string;
  ply: number;
  note: string;
  alternatives: readonly string[];
}[] {
  const { tree } = useAnalysis.getState();
  const out: {
    id: NodeId;
    san: string;
    ply: number;
    note: string;
    alternatives: readonly string[];
  }[] = [];
  let cursor = tree.nodes[tree.rootId];
  while (cursor?.children[0]) {
    cursor = tree.nodes[cursor.children[0]];
    if (!cursor?.move || !cursor.comment?.startsWith(FLAG_PREFIX)) continue;
    const parent = cursor.parentId ? tree.nodes[cursor.parentId] : null;
    const alternatives: string[] = [];
    if (parent) {
      const position = Position.fromFen(parent.fen);
      if (position.ok) {
        for (const shape of parent.shapes) {
          if (shape.kind !== 'arrow') continue;
          const move = position.value
            .legalMoves()
            .find((m) => m.from === shape.from && m.to === shape.to);
          if (move && move.san !== cursor.move.san) alternatives.push(move.san);
        }
      }
    }
    out.push({
      id: cursor.id,
      san: cursor.move.san,
      ply: cursor.ply,
      note: cursor.comment.slice(FLAG_PREFIX.length + 2).replace(/\.$/, ''),
      alternatives,
    });
  }
  return out;
}

/** The candidates the entry line shows for what is typed so far. */
export function candidatesFor(text: string) {
  if (!text.trim()) return [];
  return matchToken(currentPosition(), text).candidates.slice(0, 6);
}

/** A flag's node, cleared: the comment goes, the arrows on its parent go. */
export function acceptFlag(nodeId: NodeId): void {
  const analysis = useAnalysis.getState();
  const node = analysis.tree.nodes[nodeId];
  if (!node) return;
  analysis.comment(nodeId, '');
  if (node.parentId) useAnalysis.getState().clearShapes(node.parentId);
}

export const pathSans = (): string[] => {
  const { tree, currentId } = useAnalysis.getState();
  return nodePath(tree, currentId)
    .slice(1)
    .map((id) => tree.nodes[id]?.move?.san ?? '');
};
