'use client';

import { useEffect, type ReactNode } from 'react';

import { CommandPalette } from '@/features/command/CommandPalette';
import { useGlobalHotkeys } from '@/features/command/useGlobalHotkeys';
import { CommentDialog } from '@/features/movetree/CommentDialog';
import { MoveContextMenu } from '@/features/movetree/MoveContextMenu';
import { useWorkspacePersistence } from '@/features/persistence/useWorkspacePersistence';
import { SaveToStudyDialog } from '@/features/studies/SaveToStudyDialog';
import { AddToRepertoireDialog } from '@/features/repertoire/AddToRepertoireDialog';
import { CreateTrainingDialog } from '@/features/training/CreateTrainingDialog';
import { ModelGameDialog } from '@/features/games/ModelGameDialog';
import { ImportDialog } from '@/features/shell/ImportDialog';
import { SettingsDialog } from '@/features/shell/SettingsDialog';
import { ShortcutsDialog } from '@/features/shell/ShortcutsDialog';
import { useCompanionSync } from '@/companion/useCompanion';
import { useUi } from '@/stores/ui-store';

import { Notices } from './Notices';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { MobileNavigation } from './MobileNavigation';
import { ChessWorkspaceProvider } from '@/features/workspace/ChessWorkspaceContext';

export function AppShell({ children }: { children: ReactNode }) {
  useGlobalHotkeys();
  useWorkspacePersistence();
  useCompanionSync();
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);

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
      <div className="flex h-dvh flex-col overflow-hidden bg-surface-0">
        <div className="flex min-h-0 flex-1" inert={sidebarOpen || undefined}>
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
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
        <SettingsDialog />
        <ImportDialog />
        <SaveToStudyDialog />
        <AddToRepertoireDialog />
        <CreateTrainingDialog />
        <ModelGameDialog />
        <CommentDialog />
        <MoveContextMenu />
        <Notices />
      </div>
    </ChessWorkspaceProvider>
  );
}
