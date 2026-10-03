import { describe, expect, it } from 'vitest';

import { commonsPhoto, plainText, playerPhoto, rosterEntryFor } from './player-photo';
import type { TitledPlayer } from './titled-players';

const person = (wikidata: string, name: string, aliases: string[] = []): TitledPlayer => ({
  wikidata,
  name,
  aliases,
  title: 'GM',
  fideId: '',
  born: 0,
  female: false,
  citizenship: '',
  peakElo: 0,
});

describe('rosterEntryFor', () => {
  const roster = [
    person('Q106807', 'Magnus Carlsen'),
    person('Q1', 'Wang Hao'),
    person('Q2', 'Hao Wang'),
  ];

  it('matches a PGN-style name to the roster in either order', () => {
    expect(rosterEntryFor('Carlsen, Magnus', roster)?.wikidata).toBe('Q106807');
    expect(rosterEntryFor('Magnus Carlsen', roster)?.wikidata).toBe('Q106807');
  });

  it('gives no one when two people could be meant', () => {
    expect(rosterEntryFor('Wang, Hao', roster)).toBeNull();
    expect(rosterEntryFor('Nobody, At All', roster)).toBeNull();
  });
});

describe('plainText', () => {
  it('turns Commons credit HTML into the words', () => {
    expect(
      plainText('<a rel="nofollow" href="https://x">Andreas Kontokanis</a> from Piraeus, Greece'),
    ).toBe('Andreas Kontokanis from Piraeus, Greece');
  });
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const commons = (meta: Record<string, string>, thumb = 'https://thumb.wikimedia.org/a.jpg') =>
  json({
    query: {
      pages: {
        '1': {
          imageinfo: [
            {
              thumburl: thumb,
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
              extmetadata: Object.fromEntries(
                Object.entries(meta).map(([key, value]) => [key, { value }]),
              ),
            },
          ],
        },
      },
    },
  });

describe('commonsPhoto', () => {
  it('returns the thumbnail with its author and licence', async () => {
    const photo = await commonsPhoto('A.jpg', async () =>
      commons({
        Artist: '<a href="x">Ann</a>',
        LicenseShortName: 'CC BY-SA 2.0',
        LicenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      }),
    );
    expect(photo).toEqual({
      url: 'https://thumb.wikimedia.org/a.jpg',
      author: 'Ann',
      licence: 'CC BY-SA 2.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      page: 'https://commons.wikimedia.org/wiki/File:A.jpg',
    });
  });

  it('shows nothing without a licence, or from a host that is not Wikimedia', async () => {
    expect(await commonsPhoto('A.jpg', async () => commons({ Artist: 'Ann' }))).toBeNull();
    expect(
      await commonsPhoto('A.jpg', async () =>
        commons({ LicenseShortName: 'CC0' }, 'https://example.com/a.jpg'),
      ),
    ).toBeNull();
  });
});

describe('playerPhoto', () => {
  it('reads the file name from the item’s P18, then asks Commons about that file', async () => {
    const asked: string[] = [];
    await playerPhoto('Q106807', async (url) => {
      asked.push(url);
      return url.includes('wikidata')
        ? json({
            entities: {
              Q106807: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Carlsen.jpg' } } }] } },
            },
          })
        : commons({ LicenseShortName: 'CC BY 2.0' });
    });
    expect(asked[0]).toBe('https://www.wikidata.org/wiki/Special:EntityData/Q106807.json');
    expect(new URL(asked[1]!).searchParams.get('titles')).toBe('File:Carlsen.jpg');
  });

  it('asks nothing for something that is not a Wikidata item', async () => {
    expect(await playerPhoto('not-a-qid', async () => json({}))).toBeNull();
  });
});
