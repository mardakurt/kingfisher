/** Serialize install/remove across tabs. The fallback also covers non-browser tests. */
const tails = new Map<string, Promise<unknown>>();

export async function withPackLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request(`kingfisher:reference:${id}`, work);
  }
  const previous = tails.get(id) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(work);
  tails.set(id, result);
  void result
    .finally(() => {
      if (tails.get(id) === result) tails.delete(id);
    })
    .catch(() => undefined);
  return result;
}
