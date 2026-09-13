import { describe, expect, it } from 'vitest';

import { stripQueryAndHash, stripQueryAndHashFromTiming } from './WebAnalytics';

describe('web analytics beforeSend', () => {
  it('never lets a query string or fragment — where a FEN could be — into a page view', () => {
    const sent = stripQueryAndHash({
      type: 'pageview',
      url: 'https://kingfisherchess.app/analysis?fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F8%2F8%2FPPPPPPPP%2FRNBQKBNR%20w%20KQkq%20-%200%201#move-12',
    });
    expect(sent).toEqual({ type: 'pageview', url: 'https://kingfisherchess.app/analysis' });
  });

  it('keeps a plain path as it is and drops an event whose URL cannot be parsed', () => {
    expect(
      stripQueryAndHash({ type: 'pageview', url: 'https://kingfisherchess.app/install' }),
    ).toEqual({
      type: 'pageview',
      url: 'https://kingfisherchess.app/install',
    });
    expect(stripQueryAndHash({ type: 'event', url: 'http://[bad' })).toBeNull();
  });

  it('applies the same rule to a load-timing event', () => {
    expect(
      stripQueryAndHashFromTiming({
        type: 'vital',
        url: 'https://kingfisherchess.app/openings?fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k%20w%20-%20-%200%201',
      }),
    ).toEqual({ type: 'vital', url: 'https://kingfisherchess.app/openings' });
    expect(stripQueryAndHashFromTiming({ type: 'vital', url: 'http://[bad' })).toBeNull();
  });
});
