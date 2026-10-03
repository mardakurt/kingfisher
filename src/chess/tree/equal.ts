import type { GameTree } from './types';

/** All authored tree content matters when deciding whether a draft is newer. */
export function sameGameTree(a: GameTree, b: GameTree): boolean {
  return equalValue(a, b);
}

function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => equalValue(value, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // JSON persistence drops undefined properties; property insertion order is irrelevant.
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]))
  );
}
