import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CLASSICS_ID = 'famous-games-and-championship-classics';

/** Factual main lines only. Each transcription retains its exact Wikimedia revision. */
export function classicsSet(parsePgn) {
  const sources = JSON.parse(
    readFileSync(new URL('./classics-sources.json', import.meta.url), 'utf8'),
  );
  if (sources.length !== 100) throw new Error('The classics collection must contain 100 games.');
  const identities = new Set();
  const players = new Set();
  let plies = 0;
  const games = sources.map((source) => {
    const original = parsePgn(source.pgn);
    if (
      original.games.length !== 1 ||
      original.refused.length ||
      original.issues.length ||
      original.games[0].issues.length
    ) {
      throw new Error(`${source.title}: the recorded score does not replay completely.`);
    }
    const tree = original.games[0].tree;
    const identity = Object.values(tree.nodes)
      .flatMap((node) => (node.move ? [node.move.uci] : []))
      .join(' ');
    if (identities.has(identity)) throw new Error(`${source.title}: duplicate game score.`);
    identities.add(identity);
    plies += Object.keys(tree.nodes).length - 1;
    players.add(tree.headers.White);
    players.add(tree.headers.Black);
    let pgn = source.pgn;
    // Named games can be found through the existing event search; retain the original tag too.
    if (source.source.includes('commons.wikimedia.org')) {
      pgn = pgn.replace(
        /\[Event "([^"\n]*)"\]/,
        (_, event) => `[Event "${event} (${source.title})"]\n[OriginalEvent "${event}"]`,
      );
    }
    const quote = (value) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    pgn = `[Title "${quote(source.title)}"]\n[Source "${quote(source.source)}"]\n[SourceLicense "CC BY-SA 4.0"]\n${pgn}`;
    return pgn;
  });
  const pgn = `${games.join('\n\n')}\n`;
  return {
    pgn,
    plies,
    row: {
      id: CLASSICS_ID,
      title: 'Famous games and championship classics',
      author: 'Wikimedia contributors',
      year: 2026,
      edition: 'Kingfisher selection; 21 named classics and 79 championship games',
      source: 'https://en.wikipedia.org/wiki/List_of_chess_games',
      rights:
        'Factual main lines transcribed from the credited Wikimedia revisions under CC BY-SA 4.0. No modern annotations or images are included. The selection is not a measured popularity ranking. Each PGN retains its source URL, revision and licence. Adaptation: formatting, removal of commentary, descriptive event labels for named games; original events retained.',
      rightsLabel: 'CC BY-SA 4.0',
      description:
        'Includes the Immortal, Evergreen, Opera, Game of the Century and Kasparov–Topalov games. A curated collection, not a popularity ranking. No commentary is included.',
      file: `${CLASSICS_ID}.pgn`,
      sha256: createHash('sha256').update(pgn).digest('hex'),
      games: 100,
      notes: 0,
      players: [...players].sort(),
    },
  };
}
