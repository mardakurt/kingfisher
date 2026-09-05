/**
 * The line-level boundary between a UCI session and whatever is running the
 * engine.
 *
 * `UciSession` contains everything that is hard about driving an engine —
 * serialising searches, coalescing `info` floods, keeping MultiPV lines in
 * order, turning scores to White's point of view — and none of it depends on
 * *where* the engine is. Putting that behind this interface is what lets a
 * native binary behind the local companion and a WebAssembly build in a Worker
 * share one implementation instead of two that drift apart.
 */

export type LineListener = (line: string) => void;

export interface UciTransport {
  /** Subscribe to engine output. Returns an unsubscribe function. */
  onLine(listener: LineListener): () => void;
  /** Send one UCI command. Throws if the transport is no longer usable. */
  send(command: string): void;
  /**
   * Resolve once a line satisfying `match` arrives.
   *
   * Must reject on timeout, and must also reject as soon as the transport is
   * known to be dead — disposed, or the engine behind it crashed. A waiter left
   * pending on an engine that can no longer answer stalls the session queue
   * behind it for the whole timeout.
   */
  waitFor(match: (line: string) => boolean, timeoutMs?: number, label?: string): Promise<string>;
  dispose(): void;
}
