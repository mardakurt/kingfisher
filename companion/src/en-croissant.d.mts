import type { EnCroissantInspection, EnCroissantPage } from '../../src/database/encroissant/types';
export class EnCroissantError extends Error {
  remedy?: string;
}
export const SUPPORTED_VERSIONS: readonly string[];
export function inspect(file: string): EnCroissantInspection;
export function readGames(
  file: string,
  options?: { after?: number; limit?: number },
): EnCroissantPage;
