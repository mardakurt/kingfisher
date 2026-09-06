import { Worker } from 'node:worker_threads';

/** Maintenance owns its collection until the worker exits, not until a tab closes. */
export class DatabaseMaintenance {
  #jobs = new Map();

  busy(key) {
    return this.#jobs.get(key)?.state.status === 'running';
  }

  status(key) {
    return this.#jobs.get(key)?.state ?? null;
  }

  start(key, file, operation) {
    if (this.busy(key)) throw new Error('This collection already has maintenance running.');
    if (!['compact', 'integrity', 'claim-index'].includes(operation))
      throw new Error('Unknown maintenance operation.');
    for (const [id, job] of this.#jobs) {
      if (this.#jobs.size < 64) break;
      if (job.state.status !== 'running') this.#jobs.delete(id);
    }
    if (this.#jobs.size >= 64 && !this.#jobs.has(key))
      throw new Error('Too many maintenance jobs.');
    const cancel = new Int32Array(new SharedArrayBuffer(4));
    const state = {
      key,
      operation,
      status: 'running',
      phase: 'starting',
      progress: null,
      result: null,
      error: null,
    };
    const worker = new Worker(new URL('./database-maintenance.worker.mjs', import.meta.url), {
      workerData: { file, operation, cancel: cancel.buffer },
    });
    const job = { worker, cancel, state, final: null };
    this.#jobs.set(key, job);
    worker.on('message', (message) => {
      if (message.kind === 'progress') Object.assign(state, message.progress);
      else job.final = message;
    });
    worker.on('error', (error) => {
      job.final = { error: error.message };
    });
    worker.on('exit', (code) => {
      const final = job.final;
      Object.assign(
        state,
        final?.result
          ? { status: 'completed', phase: 'complete', result: final.result }
          : {
              status: cancel[0] ? 'cancelled' : 'failed',
              error: final?.error ?? `Maintenance exited (${code}).`,
            },
      );
    });
    return state;
  }

  cancel(key) {
    const job = this.#jobs.get(key);
    if (job?.state.status === 'running') Atomics.store(job.cancel, 0, 1);
    return job?.state ?? null;
  }

  async close() {
    await Promise.all(
      [...this.#jobs.values()]
        .filter((job) => job.state.status === 'running')
        .map((job) => job.worker.terminate()),
    );
  }
}
