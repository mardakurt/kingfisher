'use client';

import { create } from 'zustand';

import type { ImportProgress } from '@/persistence/types';

interface ImportJobState {
  readonly running: boolean;
  readonly minimized: boolean;
  readonly progress: ImportProgress | null;
  setMinimized(value: boolean): void;
  cancel(): void;
  run(
    work: (signal: AbortSignal, onProgress: (progress: ImportProgress) => void) => Promise<void>,
  ): Promise<void>;
}

let controller: AbortController | null = null;

/** A route-independent import owner; dialogs may remount, jobs may not. */
export const useImportJob = create<ImportJobState>((set, get) => ({
  running: false,
  minimized: false,
  progress: null,
  setMinimized: (minimized) => set({ minimized }),
  cancel: () => controller?.abort(),
  run: async (work) => {
    if (get().running) return;
    controller = new AbortController();
    set({
      running: true,
      minimized: false,
      progress: { stage: 'parsing', completed: 0, total: 0 },
    });
    try {
      await work(controller.signal, (progress) => set({ progress }));
    } finally {
      controller = null;
      set({ running: false, minimized: false, progress: null });
    }
  },
}));
