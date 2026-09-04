'use client';

/**
 * The owner of a running database operation.
 *
 * A copy of two hundred thousand games outlives the dialog that started it and
 * the route that dialog was on. Holding the job in a store rather than in a
 * component is what lets the user close the dialog, go and look at something,
 * and still find the work in the Background Activity Centre — and what stops a
 * remount from starting a second copy alongside the first.
 *
 * One job at a time, deliberately. Two concurrent bulk writes to the same
 * SQLite file would contend for the same transaction, and two concurrent
 * *moves* involving the same collection could each verify against a state the
 * other is changing. Serialising them is the cheap way to have neither problem.
 */

import { create } from 'zustand';

import type { TransferProgress, TransferResult } from '@/database/collections/operations';

export type TransferKind = 'copy' | 'move' | 'merge' | 'dedupe';

export interface TransferJobState {
  readonly running: boolean;
  readonly kind: TransferKind | null;
  /** "Mega 2026 → My games", for the activity strip. */
  readonly label: string | null;
  readonly progress: TransferProgress | null;
  readonly lastResult: (TransferResult & { readonly kind: TransferKind }) | null;
  cancel(): void;
  run(
    kind: TransferKind,
    label: string,
    work: (
      signal: AbortSignal,
      onProgress: (progress: TransferProgress) => void,
    ) => Promise<TransferResult>,
  ): Promise<TransferResult | null>;
}

let controller: AbortController | null = null;

export const useTransferJob = create<TransferJobState>((set, get) => ({
  running: false,
  kind: null,
  label: null,
  progress: null,
  lastResult: null,
  cancel: () => controller?.abort(),
  run: async (kind, label, work) => {
    // Refusing rather than queueing: a second copy started by accident is far
    // more likely than a second one wanted, and a refusal is visible.
    if (get().running) return null;
    controller = new AbortController();
    set({
      running: true,
      kind,
      label,
      progress: { stage: 'reading', read: 0, written: 0, duplicates: 0, removed: 0, skipped: 0 },
      lastResult: null,
    });
    try {
      const result = await work(controller.signal, (progress) => set({ progress }));
      set({ lastResult: { ...result, kind } });
      return result;
    } finally {
      controller = null;
      set({ running: false, kind: null, label: null, progress: null });
    }
  },
}));

/** A one-line factual summary of a finished operation. */
export function describeTransfer(result: TransferResult & { kind: TransferKind }): string {
  const parts = [`${result.written.toLocaleString()} written`];
  if (result.duplicates > 0) parts.push(`${result.duplicates.toLocaleString()} already present`);
  if (result.removed > 0) parts.push(`${result.removed.toLocaleString()} removed from the source`);
  if (result.skipped > 0) parts.push(`${result.skipped.toLocaleString()} could not be stored`);
  return parts.join(' · ');
}

/**
 * The warning a partial move has to carry.
 *
 * Returned separately from the summary because it is not a statistic: it means
 * the user now has games in two places and needs to know which.
 */
export function transferWarning(result: TransferResult): string | null {
  if (!result.undeletedAfterCopy) return null;
  return (
    `${result.undeletedAfterCopy.toLocaleString()} game${result.undeletedAfterCopy === 1 ? '' : 's'} ` +
    'could not be confirmed in the destination and were left in the source. ' +
    'Nothing was lost; run the move again to finish it.'
  );
}
