'use client';

import { useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

import { CommandPalette } from '@/features/command/CommandPalette';
import { useGlobalHotkeys } from '@/features/command/useGlobalHotkeys';
import { MoveContextMenu } from '@/features/movetree/MoveContextMenu';
import { useWorkspacePersistence } from '@/features/persistence/useWorkspacePersistence';
import { ShortcutsDialog } from '@/features/shell/ShortcutsDialog';
import { useCompanionSync } from '@/companion/useCompanion';
import { useDesktopIntegration } from '@/desktop/useDesktop';
import { PostUpdateNotice } from '@/desktop/post-update-notice';
import { useReferenceSources } from '@/reference/use-references';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';
import { APP_VERSION } from '@/lib/version';

import { ConflictNotice } from '@/features/persistence/ConflictNotice';
import { RecoveryNotice } from '@/features/persistence/RecoveryNotice';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { Notices } from './Notices';
import { Sidebar } from './Sidebar';
import { TitleBarSafeBand } from './TitleBarSafeArea';
import { StatusBar } from './StatusBar';
import { FocusModeBar } from './FocusModeBar';
import { ResearchTrail } from './ResearchTrail';
import { MobileNavigation } from './MobileNavigation';
import { PwaUpdateBanner } from '@/pwa/PwaUpdateBanner';
import { ChessWorkspaceProvider } from '@/features/workspace/ChessWorkspaceContext';
import { AnalysisQueueProvider } from '@/features/analysis-queue/AnalysisQueueProvider';
import { useEnginePositionGuard } from '@/features/analysis/useEnginePositionGuard';

// These feature surfaces are large and uncommon at startup. Conditional
// mounting matters as much as the dynamic import: a closed dialog must not
// fetch and evaluate its implementation merely because AppShell exists.
const SettingsDialog = dynamic(
  () => import('@/features/shell/SettingsDialog').then((module) => module.SettingsDialog),
  { ssr: false },
);
const ImportDialog = dynamic(
  () => import('@/features/shell/ImportDialog').then((module) => module.ImportDialog),
  { ssr: false },
);
const PositionSetupDialog = dynamic(
  () =>
    import('@/features/position-setup/PositionSetupDialog').then(
      (module) => module.PositionSetupDialog,
    ),
  { ssr: false },
);
const FeedbackModal = dynamic(
  () => import('@/features/feedback/FeedbackModal').then((module) => module.FeedbackModal),
  { ssr: false },
);
const SaveToStudyDialog = dynamic(
  () => import('@/features/studies/SaveToStudyDialog').then((module) => module.SaveToStudyDialog),
  { ssr: false },
);
const AddToRepertoireDialog = dynamic(
  () =>
    import('@/features/repertoire/AddToRepertoireDialog').then(
      (module) => module.AddToRepertoireDialog,
    ),
  { ssr: false },
);
const CreateTrainingDialog = dynamic(
  () =>
    import('@/features/training/CreateTrainingDialog').then(
      (module) => module.CreateTrainingDialog,
    ),
  { ssr: false },
);
const ModelGameDialog = dynamic(
  () => import('@/features/games/ModelGameDialog').then((module) => module.ModelGameDialog),
  { ssr: false },
);
const AnalysisQueueDialog = dynamic(
  () =>
    import('@/features/analysis-queue/AnalysisQueueDialog').then(
      (module) => module.AnalysisQueueDialog,
    ),
  { ssr: false },
);
const CommentDialog = dynamic(
  () => import('@/features/movetree/CommentDialog').then((module) => module.CommentDialog),
  { ssr: false },
);

export function AppShell({ children }: { children: ReactNode }) {
  useGlobalHotkeys();
  useEnginePositionGuard();
  useWorkspacePersistence();
  useCompanionSync();
  // A no-op in a browser; see src/desktop/bridge.ts.
  useDesktopIntegration();
  // Brings the bundled reference up on a fresh profile, so the explorer has
  // evidence before anybody imports or connects anything.
  useReferenceSources();
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const focusMode = useWorkspaceLayout((state) => state.focusMode);
  const setFocusMode = useWorkspaceLayout((state) => state.setFocusMode);
  const compact = useWorkspaceLayout((state) => state.compact);

  /*
    Density is a document-level flag rather than a class on every component:
    one attribute, and any surface can opt into it in CSS without threading a
    prop through nine layers of layout.
  */
  useEffect(() => {
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
  }, [compact]);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const importOpen = useUi((state) => state.importOpen);
  const positionSetupOpen = useUi((state) => state.positionSetupOpen);
  const saveToStudyOpen = useUi((state) => state.saveToStudyOpen);
  const addToRepertoireOpen = useUi((state) => state.addToRepertoireOpen);
  const trainingCaptureOpen = useUi((state) => state.trainingCaptureOpen);
  const modelGameOpen = useUi((state) => state.modelGameOpen);
  const analysisQueueOpen = useUi((state) => state.analysisQueueOpen);
  const commentingNodeId = useUi((state) => state.commentingNodeId);
  const feedbackOpen = useUi((state) => state.feedbackOpen);
  const feedbackInitialCategory = useUi((state) => state.feedbackInitialCategory);
  const closeFeedback = useUi((state) => state.closeFeedback);

  useEffect(() => {
    // Browser tests and assistive automation need a deterministic signal that
    // client event handlers are attached; visible SSR markup alone is not that
    // signal. This carries no application state and is removed on unmount.
    document.documentElement.dataset.kingfisherReady = 'true';
    return () => {
      delete document.documentElement.dataset.kingfisherReady;
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [setSidebarOpen, sidebarOpen]);

  /*
    Escape leaves focus mode, and does so before anything else reads the key —
    a mode that hides the way out needs the most conventional exit there is.
  */
  useEffect(() => {
    if (!focusMode) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', leave);
    return () => window.removeEventListener('keydown', leave);
  }, [focusMode, setFocusMode]);

  return (
    <ChessWorkspaceProvider>
      <AnalysisQueueProvider />
      <div className="flex h-dvh flex-col overflow-hidden bg-surface-0">
        {/* Room for the macOS window buttons when no sidebar header is there to
            hold them — focus mode, or a viewport narrow enough that navigation
            has become the mobile bar. Zero-height in every other case, and in
            every browser. See TitleBarSafeArea.tsx. */}
        <TitleBarSafeBand focusMode={focusMode} />
        <div className="flex min-h-0 flex-1" inert={sidebarOpen || undefined}>
          {/* Focus mode takes the navigation away, not the ability to navigate:
              Escape and the exit button both restore it, and the command
              palette still works. */}
          {focusMode ? null : <Sidebar />}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Above the workspace, not inside it: the notice has to be visible
                on whichever route the conflicting chapter is open in. */}
            <PostUpdateNotice />
            <PwaUpdateBanner />
            <ConflictNotice />
            <RecoveryNotice />
            <ResearchTrail />
            <ErrorBoundary label="The workspace">{children}</ErrorBoundary>
          </main>
        </div>
        {focusMode ? <FocusModeBar /> : <StatusBar />}
        {focusMode ? null : <MobileNavigation />}

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 flex md:hidden"
            role="dialog"
            aria-modal
            aria-label="Navigation"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/55 animate-fade-in"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative animate-rise">
              <Sidebar variant="drawer" onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        <CommandPalette />
        <ShortcutsDialog />
        {settingsOpen ? <SettingsDialog /> : null}
        {importOpen ? <ImportDialog /> : null}
        {positionSetupOpen ? <PositionSetupDialog /> : null}
        {saveToStudyOpen ? <SaveToStudyDialog /> : null}
        {addToRepertoireOpen ? <AddToRepertoireDialog /> : null}
        {trainingCaptureOpen ? <CreateTrainingDialog /> : null}
        {modelGameOpen ? <ModelGameDialog /> : null}
        {analysisQueueOpen ? <AnalysisQueueDialog /> : null}
        {commentingNodeId ? <CommentDialog /> : null}
        {feedbackOpen ? (
          <FeedbackModal
            open={feedbackOpen}
            onClose={closeFeedback}
            clientVersion={APP_VERSION}
            surface="web"
            githubRepositoryUrl="https://github.com/mardakurt/kingfisher"
            initialCategory={feedbackInitialCategory ?? 'broken'}
          />
        ) : null}
        <MoveContextMenu />
        <Notices />
      </div>
    </ChessWorkspaceProvider>
  );
}
