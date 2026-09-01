'use client';

/**
 * The analysis session: a game tree and a cursor into it.
 *
 * Tree and cursor live in one store on purpose. They are not independent — a
 * deletion has to move the cursor, an undo has to restore both — and splitting
 * them would mean keeping two stores in sync on every edit, which is exactly
 * the class of bug that corrupts a game.
 *
 * Everything derived (the current position, legal moves, the main line) is
 * computed by selectors, never stored, so there is one source of truth.
 */

import { create } from 'zustand';

import type { Shape } from '@/chess/annotations';
import { toggleNag as toggleNagCode } from '@/chess/annotations';
import type { Evaluation, Score } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { playIntentAt, playSanAt, positionAt, insertLine } from '@/chess/game';
import { parsePgn, serializePgn } from '@/chess/pgn';
import { Position } from '@/chess/position';
import type { ChessError, Result } from '@/chess/result';
import { fail, ok } from '@/chess/result';
import {
  adjacentSibling,
  createTree,
  lastNodeOfLine,
  moveVariation,
  mustGetNode,
  nodePath,
  promoteToMainline,
  promoteVariation,
  removeNode,
  removeVariation,
  removeVariations,
  setComment,
  setEvaluation,
  setHeader,
  setNags,
  toggleShape,
  truncateAfter,
} from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Color, Fen, MoveIntent } from '@/chess/types';
import type { AnalysisDocument } from '@/persistence/types';

interface Snapshot {
  readonly tree: GameTree;
  readonly currentId: NodeId;
}

const HISTORY_LIMIT = 120;

/** What the workspace is editing right now, before anything has been saved. */
export const UNTITLED_DOCUMENT: AnalysisDocument = {
  kind: 'untitled',
  title: 'Untitled analysis',
};

export interface OpenDocumentInput {
  readonly tree: GameTree;
  readonly document: AnalysisDocument;
  readonly currentId?: NodeId;
  readonly orientation?: Color;
  /** False when the loaded content is not yet the persisted content. */
  readonly clean?: boolean;
}

/** What the save indicator shows. Derived, never stored. */
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface AnalysisState {
  tree: GameTree;
  currentId: NodeId;
  orientation: Color;
  past: Snapshot[];
  future: Snapshot[];
  /** Bumped whenever a fresh game is loaded, so views can reset scroll etc. */
  generation: number;

  /** What is being edited: an untitled analysis, a chapter, or a database game. */
  document: AnalysisDocument;
  /**
   * Bumped by every change worth persisting. Autosave compares it against
   * `savedRevision` rather than diffing trees, so a save can be recognised as
   * stale the moment a further edit lands while it is in flight.
   */
  revision: number;
  savedRevision: number;
  saving: boolean;
  saveError: string | null;

  // Navigation
  goTo(nodeId: NodeId): void;
  forward(): void;
  back(): void;
  toStart(): void;
  toEnd(): void;
  nextVariation(): void;
  previousVariation(): void;

  // Editing
  play(intent: MoveIntent): Result<NodeId>;
  playSan(san: string): Result<NodeId>;
  insertUciLine(moves: readonly string[], from?: NodeId): Result<NodeId>;
  deleteNode(nodeId: NodeId): void;
  deleteVariation(nodeId: NodeId): void;
  truncate(nodeId: NodeId): void;
  clearVariations(nodeId: NodeId): void;
  promote(nodeId: NodeId): void;
  demote(nodeId: NodeId): void;
  promoteToMain(nodeId: NodeId): void;
  comment(nodeId: NodeId, text: string): void;
  toggleNag(nodeId: NodeId, code: number): void;
  toggleShape(nodeId: NodeId, shape: Shape): void;
  clearShapes(nodeId: NodeId): void;
  attachEvaluation(nodeId: NodeId, evaluation: Evaluation): void;
  setHeaderValue(key: string, value: string): void;

  // Session
  newGame(fen?: Fen): void;
  loadGame(tree: GameTree): void;
  openDocument(input: OpenDocumentInput): void;
  setDocument(document: AnalysisDocument): void;
  loadFen(text: string): Result<true>;
  loadPgn(text: string): Result<{ games: number; issues: number }>;
  exportPgn(): string;
  flip(): void;
  setOrientation(color: Color): void;
  undo(): void;
  redo(): void;

  // Persistence bookkeeping, driven by the autosave controller.
  markSaving(): void;
  markSaved(revision: number): void;
  markSaveFailed(message: string): void;
}

const initialTree = createTree(START_FEN, { Event: 'Analysis', Result: '*' });

/** Wrap a tree edit so that undo/redo, the cursor and the revision are handled once. */
function commit(
  state: AnalysisState,
  tree: GameTree,
  currentId: NodeId = state.currentId,
): Partial<AnalysisState> {
  const snapshot: Snapshot = { tree: state.tree, currentId: state.currentId };
  const past = [...state.past, snapshot].slice(-HISTORY_LIMIT);
  const cursor = tree.nodes[currentId] ? currentId : tree.rootId;
  return { tree, currentId: cursor, past, future: [], revision: state.revision + 1 };
}

/** A freshly opened document starts clean: nothing has changed since it loaded. */
function opened(state: AnalysisState, input: OpenDocumentInput): Partial<AnalysisState> {
  const { tree } = input;
  const revision = state.revision + 1;
  return {
    tree,
    document: input.document,
    currentId: input.currentId && tree.nodes[input.currentId] ? input.currentId : tree.rootId,
    ...(input.orientation ? { orientation: input.orientation } : {}),
    past: [],
    future: [],
    generation: state.generation + 1,
    revision,
    savedRevision: input.clean === false ? revision - 1 : revision,
    saving: false,
    saveError: null,
  };
}

export const useAnalysis = create<AnalysisState>((set, get) => ({
  tree: initialTree,
  currentId: initialTree.rootId,
  orientation: 'w',
  past: [],
  future: [],
  generation: 0,
  document: UNTITLED_DOCUMENT,
  revision: 0,
  savedRevision: 0,
  saving: false,
  saveError: null,

  goTo: (nodeId) => {
    if (!get().tree.nodes[nodeId]) return;
    set({ currentId: nodeId });
  },

  forward: () => {
    const { tree, currentId } = get();
    const next = tree.nodes[currentId]?.children[0];
    if (next) set({ currentId: next });
  },

  back: () => {
    const { tree, currentId } = get();
    const parent = tree.nodes[currentId]?.parentId;
    if (parent) set({ currentId: parent });
  },

  toStart: () => set({ currentId: get().tree.rootId }),

  toEnd: () => set({ currentId: lastNodeOfLine(get().tree, get().currentId) }),

  nextVariation: () => {
    const { tree, currentId } = get();
    const sibling = adjacentSibling(tree, currentId, 1);
    if (sibling) set({ currentId: sibling });
  },

  previousVariation: () => {
    const { tree, currentId } = get();
    const sibling = adjacentSibling(tree, currentId, -1);
    if (sibling) set({ currentId: sibling });
  },

  play: (intent) => {
    const state = get();
    const played = playIntentAt(state.tree, state.currentId, intent);
    if (!played.ok) return played;
    set(commit(state, played.value.tree, played.value.nodeId));
    return ok(played.value.nodeId);
  },

  playSan: (san) => {
    const state = get();
    const played = playSanAt(state.tree, state.currentId, san);
    if (!played.ok) return played;
    set(commit(state, played.value.tree, played.value.nodeId));
    return ok(played.value.nodeId);
  },

  insertUciLine: (moves, from) => {
    const state = get();
    const inserted = insertLine(state.tree, from ?? state.currentId, moves, 'uci');
    if (!inserted.ok) return inserted;
    set(commit(state, inserted.value.tree, inserted.value.nodeIds[0] ?? state.currentId));
    return ok(inserted.value.nodeId);
  },

  deleteNode: (nodeId) => {
    const state = get();
    const removed = removeNode(state.tree, nodeId);
    if (removed.tree === state.tree) return;
    // If the cursor was inside the deleted subtree, fall back to the parent.
    const cursorSurvives = removed.tree.nodes[state.currentId] !== undefined;
    set(commit(state, removed.tree, cursorSurvives ? state.currentId : removed.selectionId));
  },

  deleteVariation: (nodeId) => {
    const state = get();
    const removed = removeVariation(state.tree, nodeId);
    if (removed.tree === state.tree) return;
    const cursorSurvives = removed.tree.nodes[state.currentId] !== undefined;
    set(commit(state, removed.tree, cursorSurvives ? state.currentId : removed.selectionId));
  },

  truncate: (nodeId) => {
    const state = get();
    const tree = truncateAfter(state.tree, nodeId);
    if (tree === state.tree) return;
    set(commit(state, tree, tree.nodes[state.currentId] ? state.currentId : nodeId));
  },

  clearVariations: (nodeId) => {
    const state = get();
    const tree = removeVariations(state.tree, nodeId);
    if (tree === state.tree) return;
    set(commit(state, tree, tree.nodes[state.currentId] ? state.currentId : nodeId));
  },

  promote: (nodeId) => {
    const state = get();
    const tree = promoteVariation(state.tree, nodeId);
    if (tree === state.tree) return;
    set(commit(state, tree));
  },

  demote: (nodeId) => {
    const state = get();
    const tree = moveVariation(state.tree, nodeId, 1);
    if (tree === state.tree) return;
    set(commit(state, tree));
  },

  promoteToMain: (nodeId) => {
    const state = get();
    const tree = promoteToMainline(state.tree, nodeId);
    if (tree === state.tree) return;
    set(commit(state, tree));
  },

  comment: (nodeId, text) => {
    const state = get();
    set(commit(state, setComment(state.tree, nodeId, text)));
  },

  toggleNag: (nodeId, code) => {
    const state = get();
    const node = state.tree.nodes[nodeId];
    if (!node) return;
    set(commit(state, setNags(state.tree, nodeId, toggleNagCode(node.nags, code))));
  },

  toggleShape: (nodeId, shape) => {
    const state = get();
    set(commit(state, toggleShape(state.tree, nodeId, shape)));
  },

  clearShapes: (nodeId) => {
    const state = get();
    const node = state.tree.nodes[nodeId];
    if (!node || node.shapes.length === 0) return;
    set(
      commit(state, {
        ...state.tree,
        nodes: { ...state.tree.nodes, [nodeId]: { ...node, shapes: [] } },
      }),
    );
  },

  /**
   * Attach an engine evaluation to a move as a deliberate act.
   *
   * A running search emits a new best line several times a second; none of that
   * is knowledge. Only a snapshot the user asked for — or the final state of a
   * search they let finish or stopped — becomes part of the study, which is why
   * this is a normal revision-bumping edit rather than a silent background
   * write. It still creates no undo step: undoing an evaluation is not what
   * ⌘Z means to anybody.
   */
  attachEvaluation: (nodeId, evaluation) => {
    const state = get();
    const node = state.tree.nodes[nodeId];
    if (!node) return;
    const current = node.evaluation;
    // Re-attaching the identical snapshot must not mark the document dirty.
    if (
      current &&
      current.depth === evaluation.depth &&
      current.engine === evaluation.engine &&
      current.score.kind === evaluation.score.kind &&
      scoreMagnitude(current.score) === scoreMagnitude(evaluation.score)
    ) {
      return;
    }
    set({
      tree: setEvaluation(state.tree, nodeId, evaluation),
      revision: state.revision + 1,
    });
  },

  setHeaderValue: (key, value) => {
    const state = get();
    set(commit(state, setHeader(state.tree, key, value)));
  },

  newGame: (fen = START_FEN) => {
    const tree = createTree(fen, { Event: 'Analysis', Result: '*' });
    set((state) => opened(state, { tree, document: UNTITLED_DOCUMENT }));
  },

  loadGame: (tree) => {
    set((state) => opened(state, { tree, document: UNTITLED_DOCUMENT, clean: false }));
  },

  openDocument: (input) => {
    set((state) => opened(state, input));
  },

  setDocument: (document) => {
    set((state) => ({ document, revision: state.revision + 1 }));
  },

  loadFen: (text) => {
    const position = Position.fromFen(text);
    if (!position.ok) return position;
    get().newGame(position.value.fen);
    set({ orientation: position.value.turn });
    return ok(true);
  },

  loadPgn: (text) => {
    const parsed = parsePgn(text);
    const first = parsed.games[0];
    if (!first) {
      return fail('invalid-pgn', 'No games were found in that PGN.') as Result<never>;
    }
    get().loadGame(first.tree);
    return ok({ games: parsed.games.length, issues: first.issues.length });
  },

  exportPgn: () => serializePgn(get().tree),

  flip: () => set((state) => ({ orientation: state.orientation === 'w' ? 'b' : 'w' })),

  setOrientation: (orientation) => set({ orientation }),

  undo: () => {
    const state = get();
    const previous = state.past.at(-1);
    if (!previous) return;
    set({
      tree: previous.tree,
      currentId: previous.tree.nodes[previous.currentId]
        ? previous.currentId
        : previous.tree.rootId,
      past: state.past.slice(0, -1),
      future: [{ tree: state.tree, currentId: state.currentId }, ...state.future].slice(
        0,
        HISTORY_LIMIT,
      ),
      revision: state.revision + 1,
    });
  },

  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return;
    set({
      tree: next.tree,
      currentId: next.tree.nodes[next.currentId] ? next.currentId : next.tree.rootId,
      past: [...state.past, { tree: state.tree, currentId: state.currentId }].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      revision: state.revision + 1,
    });
  },

  markSaving: () => set({ saving: true }),

  /**
   * A save records the revision it captured, not the current one: an edit made
   * while the write was in flight must leave the document dirty.
   */
  markSaved: (revision) =>
    set((state) => ({
      saving: false,
      saveError: null,
      savedRevision: Math.max(state.savedRevision, revision),
    })),

  markSaveFailed: (message) => set({ saving: false, saveError: message }),
}));

// --- Selectors -------------------------------------------------------------
// Derived values, computed from the store rather than duplicated inside it.

export const selectCurrentNode = (state: AnalysisState) => mustGetNode(state.tree, state.currentId);

export const selectFen = (state: AnalysisState): Fen => selectCurrentNode(state).fen;

export const selectPosition = (state: AnalysisState): Position =>
  positionAt(state.tree, state.currentId);

export const selectPathIds = (state: AnalysisState): NodeId[] =>
  nodePath(state.tree, state.currentId);

export const selectLastMove = (state: AnalysisState) => selectCurrentNode(state).move;

export const selectCanUndo = (state: AnalysisState): boolean => state.past.length > 0;
export const selectCanRedo = (state: AnalysisState): boolean => state.future.length > 0;

export const selectDirty = (state: AnalysisState): boolean =>
  state.revision !== state.savedRevision;

export const selectSaveState = (state: AnalysisState): SaveState => {
  if (state.saveError) return 'error';
  if (state.saving) return 'saving';
  return selectDirty(state) ? 'unsaved' : 'saved';
};

/** True while the document is a study chapter, which is what autosave writes to. */
export const selectChapterId = (state: AnalysisState): string | null =>
  state.document.kind === 'study-chapter' ? state.document.chapterId : null;

const scoreMagnitude = (score: Score): number => (score.kind === 'cp' ? score.cp : score.moves);

export type { AnalysisState, ChessError };
