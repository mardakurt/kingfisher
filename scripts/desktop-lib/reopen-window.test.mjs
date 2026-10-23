import { expect, it } from 'vitest';
import { reopenWindow } from './reopen-window.mjs';

it('subscribes before activation and adopts the replacement, never a closing page', async () => {
  const closing = { isClosed: () => false };
  const replacement = { isClosed: () => false };
  let deliver;
  const boundary = {
    windows: () => [closing],
    waitForEvent(event, options) {
      expect(event).toBe('window');
      expect(options.timeout).toBe(10_000);
      return new Promise((resolve) => {
        deliver = resolve;
      });
    },
    async evaluate(activate) {
      activate({
        app: {
          emit(event) {
            expect(event).toBe('activate');
            expect(deliver).toBeTypeOf('function');
            deliver(replacement);
          },
        },
      });
    },
  };
  expect(await reopenWindow(boundary)).toBe(replacement);
});
