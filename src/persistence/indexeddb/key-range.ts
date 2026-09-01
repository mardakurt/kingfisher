/**
 * Key ranges, described rather than constructed.
 *
 * `IDBKeyRange` only exists where IndexedDB does, so code that built one
 * directly had to guard with `typeof IDBKeyRange !== 'undefined'` and quietly
 * do something else when the guard failed. That is exactly the shape of bug
 * ADR 0013 warns about: a query plan that silently stops narrowing, returns too
 * many rows, and looks like it worked.
 *
 * A range is therefore plain data here. The native driver turns it into an
 * `IDBKeyRange` at the last moment; the in-memory double evaluates it directly.
 * Both agree, and the query planner is the same code in a browser and a test.
 */

export type KeyRange =
  | { readonly kind: 'only'; readonly value: IDBValidKey }
  | {
      readonly kind: 'bound';
      readonly lower: IDBValidKey;
      readonly upper: IDBValidKey;
      readonly lowerOpen?: boolean;
      readonly upperOpen?: boolean;
    }
  | { readonly kind: 'lowerBound'; readonly lower: IDBValidKey; readonly lowerOpen?: boolean }
  | { readonly kind: 'upperBound'; readonly upper: IDBValidKey; readonly upperOpen?: boolean };

export const onlyKey = (value: IDBValidKey): KeyRange => ({ kind: 'only', value });

export const boundKeys = (lower: IDBValidKey, upper: IDBValidKey): KeyRange => ({
  kind: 'bound',
  lower,
  upper,
});

export const upToKey = (upper: IDBValidKey): KeyRange => ({ kind: 'upperBound', upper });

export const fromKey = (lower: IDBValidKey): KeyRange => ({ kind: 'lowerBound', lower });

/** The native equivalent. Only ever called where IndexedDB is present. */
export function toNativeRange(range: KeyRange): IDBKeyRange {
  if (range.kind === 'only') return IDBKeyRange.only(range.value);
  if (range.kind === 'lowerBound') return IDBKeyRange.lowerBound(range.lower, range.lowerOpen);
  if (range.kind === 'upperBound') return IDBKeyRange.upperBound(range.upper, range.upperOpen);
  return IDBKeyRange.bound(range.lower, range.upper, range.lowerOpen, range.upperOpen);
}

/**
 * IndexedDB key ordering, for the environments that have no `indexedDB.cmp`.
 *
 * Only the key types this schema actually stores are ordered: numbers, strings
 * and arrays of them. Anything else would be a schema mistake rather than a
 * comparison to guess at.
 */
export function compareKeys(a: unknown, b: unknown): number {
  if (typeof indexedDB !== 'undefined') return indexedDB.cmp(a as IDBValidKey, b as IDBValidKey);
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const step = compareKeys(a[index], b[index]);
      if (step !== 0) return step;
    }
    return 0;
  }
  if (typeof a === 'number' && typeof b === 'string') return -1;
  if (typeof a === 'string' && typeof b === 'number') return 1;
  if (a === b) return 0;
  return (a as never) < (b as never) ? -1 : 1;
}

/** Whether an indexed key falls inside the range. */
export function rangeIncludes(range: KeyRange, value: unknown): boolean {
  if (value === undefined) return false;
  if (range.kind === 'only') return compareKeys(value, range.value) === 0;

  if (range.kind !== 'upperBound') {
    const step = compareKeys(value, range.lower);
    if (step < 0 || (step === 0 && range.lowerOpen)) return false;
  }
  if (range.kind !== 'lowerBound') {
    const step = compareKeys(value, range.upper);
    if (step > 0 || (step === 0 && range.upperOpen)) return false;
  }
  return true;
}
