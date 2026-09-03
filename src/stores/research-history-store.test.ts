import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_STOPS, stopContext, useResearchHistory } from './research-history-store';

beforeEach(() => useResearchHistory.getState().clear());

describe('the research trail', () => {
  it('remembers where a departure came from, with its context', () => {
    useResearchHistory.getState().push({
      href: '/repertoire',
      label: 'Najdorf repertoire',
      fen: 'fen-1',
      context: { repertoireId: 'r1', source: 'lichess-masters' },
    });

    const stop = useResearchHistory.getState().last()!;
    expect(stop).toMatchObject({ href: '/repertoire', label: 'Najdorf repertoire', fen: 'fen-1' });
    expect(stopContext<string>(stop, 'repertoireId')).toBe('r1');
    // A context key a route no longer writes reads as absent, not as a wrong type.
    expect(stopContext<string>(stop, 'gone')).toBeUndefined();
  });

  it('treats departing twice from the same place as one departure', () => {
    const history = useResearchHistory.getState();
    history.push({ href: '/repertoire', label: 'Najdorf', fen: 'fen-1' });
    history.push({ href: '/repertoire', label: 'Najdorf', fen: 'fen-1' });

    // Otherwise "back" walks through six identical entries.
    expect(useResearchHistory.getState().stops).toHaveLength(1);
  });

  it('keeps a second departure from the same route at a different position', () => {
    const history = useResearchHistory.getState();
    history.push({ href: '/repertoire', label: 'Najdorf', fen: 'fen-1' });
    history.push({ href: '/repertoire', label: 'Najdorf', fen: 'fen-2' });

    expect(useResearchHistory.getState().stops).toHaveLength(2);
  });

  it('pops the most recent stop and removes it', () => {
    const history = useResearchHistory.getState();
    history.push({ href: '/a', label: 'A' });
    history.push({ href: '/b', label: 'B' });

    expect(useResearchHistory.getState().pop()?.label).toBe('B');
    expect(useResearchHistory.getState().last()?.label).toBe('A');
    expect(useResearchHistory.getState().pop()?.label).toBe('A');
    expect(useResearchHistory.getState().pop()).toBeNull();
  });

  it('stays bounded, keeping the most recent stops', () => {
    const history = useResearchHistory.getState();
    for (let index = 0; index < MAX_STOPS + 5; index += 1) {
      history.push({ href: `/route-${index}`, label: `Stop ${index}` });
    }

    const stops = useResearchHistory.getState().stops;
    expect(stops).toHaveLength(MAX_STOPS);
    expect(stops.at(-1)?.label).toBe(`Stop ${MAX_STOPS + 4}`);
    expect(stops[0]?.label).toBe('Stop 5');
  });
});
