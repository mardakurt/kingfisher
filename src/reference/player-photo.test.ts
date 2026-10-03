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
const commons = (
  meta: Record<string, string>,
  thumb = 'https://thumb.wikimedia.org/a.jpg',
  page = 'https://commons.wikimedia.org/wiki/File:A.jpg',
) =>
  json({
    query: {
      pages: {
        '1': {
          imageinfo: [
            {
              thumburl: thumb,
              descriptionurl: page,
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

  it('shows nothing when the credit would link anywhere but the file’s Commons page', async () => {
    for (const page of ['javascript:alert(1)', 'https://example.com/wiki/File:A.jpg']) {
      expect(
        await commonsPhoto('A.jpg', async () =>
          commons({ LicenseShortName: 'CC0' }, undefined, page),
        ),
      ).toBeNull();
    }
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

  it('never uses a deprecated image statement, and prefers a preferred one', async () => {
    const fileAsked = async (P18: unknown[]) => {
      let title: string | null = null;
      await playerPhoto('Q1', async (url) => {
        if (url.includes('wikidata')) return json({ entities: { Q1: { claims: { P18 } } } });
        title = new URL(url).searchParams.get('titles');
        return commons({ LicenseShortName: 'CC0' });
      });
      return title;
    };
    const statement = (value: string, rank: string) => ({
      rank,
      mainsnak: { datavalue: { value } },
    });
    expect(await fileAsked([statement('Old.jpg', 'deprecated')])).toBeNull();
    expect(
      await fileAsked([statement('Old.jpg', 'deprecated'), statement('Now.jpg', 'normal')]),
    ).toBe('File:Now.jpg');
    expect(
      await fileAsked([statement('Now.jpg', 'normal'), statement('Best.jpg', 'preferred')]),
    ).toBe('File:Best.jpg');
  });

  it('asks nothing for something that is not a Wikidata item', async () => {
    expect(await playerPhoto('not-a-qid', async () => json({}))).toBeNull();
  });
});
