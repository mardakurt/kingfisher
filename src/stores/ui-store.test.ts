import { afterEach, describe, expect, it } from 'vitest';

import { useUi } from './ui-store';

afterEach(() => useUi.setState({ notices: [] }));

describe('notice pressure', () => {
  it('keeps a repeated persistent error as one actionable notice', () => {
    for (let i = 0; i < 100; i += 1) {
      useUi
        .getState()
        .notify({ tone: 'error', message: 'Cannot read PGN', detail: 'Illegal move' });
    }
    expect(useUi.getState().notices).toHaveLength(1);
    const notice = useUi.getState().notices[0]!;
    useUi.getState().dismiss(notice.id);
    expect(useUi.getState().notices).toEqual([]);
  });

  it('bounds distinct persistent errors and keeps the most recent messages', () => {
    for (let i = 0; i < 100; i += 1) {
      useUi.getState().notify({ tone: 'error', message: `File ${i} failed` });
    }
    expect(useUi.getState().notices.map((notice) => notice.message)).toEqual([
      'File 96 failed',
      'File 97 failed',
      'File 98 failed',
      'File 99 failed',
    ]);
  });
});
