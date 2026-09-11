'use client';

/**
 * Transient interface state: which panel is showing, what is open, what the
 * user was just told. None of it is worth persisting, and none of it belongs
 * in the analysis store, where a re-render for "the palette opened" would
 * invalidate board memoisation.
 */

import { create } from 'zustand';

import type { FeedbackCategory } from '@/features/feedback/feedback-schema';

/**
 * Six, not eight.
 *
 * The engine tab holds both the single and the two-engine view, and `position`
 * holds structure and tablebase, because in each pair the two halves answer the
 * same kind of question and are read together anyway. Eight labels did not fit
 * a 430px panel without touching each other.
 */

/** Where a move's context menu was summoned from, in viewport coordinates. */
export interface MoveMenuTarget {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

export interface Notice {
  readonly id: string;
  readonly tone: 'info' | 'error' | 'success';
  readonly message: string;
  readonly detail?: string;
}

interface UiState {
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  /**
   * Which settings section to show when the dialog next opens.
   *
   * Lives here rather than in the dialog so a failing tool can send the user
   * straight to Diagnostics instead of to Appearance and a hunt.
   */
  settingsSection: string | null;
  importOpen: boolean;
  positionSetupOpen: boolean;
  saveToStudyOpen: boolean;
  addToRepertoireOpen: boolean;
  trainingCaptureOpen: boolean;
  trainingReferenceChapterId: string | null;
  /**
   * Where a training item created from Review should land.
   *
   * Two follow-ups the capture dialog performs on the caller's behalf, so the
   * player gets one action instead of three: put the new item in this set, and
   * mark the review queue entry it came from as converted.
   */
  trainingSetTargetId: string | null;
  trainingReviewItemId: string | null;
  modelGameOpen: boolean;
  analysisQueueOpen: boolean;
  analysisQueueGameIds: readonly string[];
  /** The move whose comment is being edited, or null. */
  commentingNodeId: string | null;
  /** The move whose context menu is open, with where to draw it. */
  moveMenu: MoveMenuTarget | null;
  sidebarOpen: boolean;
  notices: Notice[];
  feedbackOpen: boolean;
  /** Initial category for the feedback modal. Lets the Cmd+K
      commands open the same modal with the right pre-selection. */
  feedbackInitialCategory: FeedbackCategory | null;

  setCommandPaletteOpen(open: boolean): void;
  toggleCommandPalette(): void;
  setShortcutsOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  openSettingsAt(section: string): void;
  setImportOpen(open: boolean): void;
  setPositionSetupOpen(open: boolean): void;
  setSaveToStudyOpen(open: boolean): void;
  setAddToRepertoireOpen(open: boolean): void;
  setTrainingCaptureOpen(open: boolean): void;
  setTrainingReferenceChapterId(chapterId: string | null): void;
  setTrainingCaptureTarget(target: {
    readonly setId?: string | null;
    readonly reviewItemId?: string | null;
  }): void;
  setModelGameOpen(open: boolean): void;
  openAnalysisQueue(gameIds?: readonly string[]): void;
  setAnalysisQueueOpen(open: boolean): void;
  clearAnalysisQueueSelection(): void;
  setCommentingNodeId(nodeId: string | null): void;
  setMoveMenu(target: MoveMenuTarget | null): void;
  setSidebarOpen(open: boolean): void;
  openFeedback(category?: FeedbackCategory): void;
  closeFeedback(): void;
  notify(notice: Omit<Notice, 'id'>): void;
  dismiss(id: string): void;
}

let noticeId = 0;

export const useUi = create<UiState>((set) => ({
  commandPaletteOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  settingsSection: null,
  importOpen: false,
  positionSetupOpen: false,
  saveToStudyOpen: false,
  addToRepertoireOpen: false,
  trainingCaptureOpen: false,
  trainingReferenceChapterId: null,
  trainingSetTargetId: null,
  trainingReviewItemId: null,
  modelGameOpen: false,
  analysisQueueOpen: false,
  analysisQueueGameIds: [],
  commentingNodeId: null,
  moveMenu: null,
  sidebarOpen: false,
  notices: [],
  feedbackOpen: false,
  feedbackInitialCategory: null,

  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openSettingsAt: (settingsSection) => set({ settingsSection, settingsOpen: true }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setPositionSetupOpen: (positionSetupOpen) => set({ positionSetupOpen }),
  setSaveToStudyOpen: (saveToStudyOpen) => set({ saveToStudyOpen }),
  setAddToRepertoireOpen: (addToRepertoireOpen) => set({ addToRepertoireOpen }),
  setTrainingCaptureOpen: (trainingCaptureOpen) => set({ trainingCaptureOpen }),
  setTrainingReferenceChapterId: (trainingReferenceChapterId) =>
    set({ trainingReferenceChapterId }),
  setTrainingCaptureTarget: ({ setId, reviewItemId }) =>
    set({
      ...(setId !== undefined ? { trainingSetTargetId: setId } : {}),
      ...(reviewItemId !== undefined ? { trainingReviewItemId: reviewItemId } : {}),
    }),
  setModelGameOpen: (modelGameOpen) => set({ modelGameOpen }),
  openAnalysisQueue: (analysisQueueGameIds = []) =>
    set({ analysisQueueOpen: true, analysisQueueGameIds }),
  setAnalysisQueueOpen: (analysisQueueOpen) => set({ analysisQueueOpen }),
  clearAnalysisQueueSelection: () => set({ analysisQueueGameIds: [] }),
  setCommentingNodeId: (commentingNodeId) => set({ commentingNodeId }),
  setMoveMenu: (moveMenu) => set({ moveMenu }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  openFeedback: (category?: FeedbackCategory) =>
    set({ feedbackOpen: true, feedbackInitialCategory: category ?? null }),
  closeFeedback: () => set({ feedbackOpen: false, feedbackInitialCategory: null }),

  notify: (notice) => {
    const id = `notice-${++noticeId}`;
    set((state) => ({ notices: [...state.notices, { ...notice, id }] }));
    // Errors stay until dismissed; confirmations get out of the way.
    if (notice.tone !== 'error') {
      setTimeout(() => {
        set((state) => ({ notices: state.notices.filter((item) => item.id !== id) }));
      }, 4000);
    }
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((item) => item.id !== id) })),
}));
