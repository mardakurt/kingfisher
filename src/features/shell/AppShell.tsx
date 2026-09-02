'use client';

import { useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

import { CommandPalette } from '@/features/command/CommandPalette';
import { useGlobalHotkeys } from '@/features/command/useGlobalHotkeys';
import { MoveContextMenu } from '@/features/movetree/MoveContextMenu';
import { useWorkspacePersistence } from '@/features/persistence/useWorkspacePersistence';
import { ShortcutsDialog } from '@/features/shell/ShortcutsDialog';
import { useCompanionSync } from '@/companion/useCompanion';
import { useUi } from '@/stores/ui-store';

import { ConflictNotice } from '@/features/persistence/ConflictNotice';
import { RecoveryNotice } from '@/features/persistence/RecoveryNotice';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { Notices } from './Notices';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { MobileNavigation } from './MobileNavigation';
import { ChessWorkspaceProvider } from '@/features/workspace/ChessWorkspaceContext';
import { AnalysisQueueProvider } from '@/features/analysis-queue/AnalysisQueueProvider';

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
  useWorkspacePersistence();
  useCompanionSync();
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const importOpen = useUi((state) => state.importOpen);
  const saveToStudyOpen = useUi((state) => state.saveToStudyOpen);
  const addToRepertoireOpen = useUi((state) => state.addToRepertoireOpen);
  const trainingCaptureOpen = useUi((state) => state.trainingCaptureOpen);
  const modelGameOpen = useUi((state) => state.modelGameOpen);
  const analysisQueueOpen = useUi((state) => state.analysisQueueOpen);
  const commentingNodeId = useUi((state) => state.commentingNodeId);

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

  return (
    <ChessWorkspaceProvider>
      <AnalysisQueueProvider />
      <div className="flex h-dvh flex-col overflow-hidden bg-surface-0">
        <div className="flex min-h-0 flex-1" inert={sidebarOpen || undefined}>
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Above the workspace, not inside it: the notice has to be visible
                on whichever route the conflicting chapter is open in. */}
            <ConflictNotice />
            <RecoveryNotice />
            <ErrorBoundary label="The workspace">{children}</ErrorBoundary>
          </main>
        </div>
        <StatusBar />
        <MobileNavigation />

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
        {saveToStudyOpen ? <SaveToStudyDialog /> : null}
        {addToRepertoireOpen ? <AddToRepertoireDialog /> : null}
        {trainingCaptureOpen ? <CreateTrainingDialog /> : null}
        {modelGameOpen ? <ModelGameDialog /> : null}
        {analysisQueueOpen ? <AnalysisQueueDialog /> : null}
        {commentingNodeId ? <CommentDialog /> : null}
        <MoveContextMenu />
        <Notices />
      </div>
    </ChessWorkspaceProvider>
  );
}
