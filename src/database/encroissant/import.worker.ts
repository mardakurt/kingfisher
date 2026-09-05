/// <reference lib="webworker" />
import { loadOpeningIndex } from '@/theory/openings';
import { prepareEnCroissantGame } from './prepare';
import type { EnCroissantGame } from './types';
const openings = loadOpeningIndex();
self.onmessage = (event: MessageEvent<readonly EnCroissantGame[]>) => {
  void openings
    .then((index) => {
      const games = [];
      const rejected: { id: number; reason: string }[] = [];
      for (const row of event.data) {
        try {
          games.push(prepareEnCroissantGame(row, index));
        } catch (error) {
          rejected.push({
            id: row.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      self.postMessage({ games, rejected });
    })
    .catch((error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }),
    );
};
