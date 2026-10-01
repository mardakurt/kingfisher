import type { Fen } from '@/chess/types';
import type { EngineSlot } from '@/stores/engine-store';

/** Handshaking alone does not demonstrate a working engine or a current result. */
export function researchEngineStatus(slot: EngineSlot, fen: Fen): string {
  if (slot.status === 'unavailable') return 'Unavailable';
  if (slot.status === 'error') return 'Search failed';
  if (slot.status === 'loading') return 'Starting engine…';
  const result = slot.analysis;
  if (slot.identity && result?.fen === fen && result.depth > 0 && result.lines.length > 0) {
    return result.complete ? 'Search completed' : 'Search responding';
  }
  if (slot.running) return 'Waiting for a result…';
  return slot.identity ? 'Connected · search not checked here' : 'Not checked in this session';
}
