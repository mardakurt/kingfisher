/**
 * The opening library.
 *
 * `openings.ts` answers "what is this position called". This answers the two
 * questions a player actually asks first: "what openings are there", and "show
 * me the Najdorf". Those need the whole dataset as a list rather than as a
 * lookup, and they need the moves — which the classification index used to
 * throw away, because classification never needed them.
 *
 * Loaded on demand, from the same generated module as the classifier, so the
 * library and the name under the board can never disagree about what a line
 * is called.
 */

import { Position } from '@/chess/position';
import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';

export interface OpeningEntry {
  /** Canonical position key, and the identity of the opening. */
  readonly key: string;
  readonly eco: string;
  /** Family, e.g. "Sicilian Defense". */
  readonly name: string;
  /** Everything the dataset says after the family, when it says anything. */
  readonly variation?: string;
  /** `name: variation`, as the dataset writes it. */
  readonly label: string;
  readonly plies: number;
  /** The dataset's own shortest line, in SAN. */
  readonly moves: readonly string[];
}

let catalog: Promise<readonly OpeningEntry[]> | null = null;

export function loadOpeningCatalog(): Promise<readonly OpeningEntry[]> {
  catalog ??= import('./opening-index.generated').then((module) => {
    const entries: OpeningEntry[] = [];
    for (const [key, packed] of Object.entries(module.OPENING_POSITIONS)) {
      const label = module.OPENING_LABELS[packed[1]] ?? '';
      const colon = label.indexOf(': ');
      const line = module.OPENING_LINES[key] ?? '';
      entries.push({
        key,
        eco: module.OPENING_LABELS[packed[0]] ?? '',
        name: colon === -1 ? label : label.slice(0, colon),
        ...(colon === -1 ? {} : { variation: label.slice(colon + 2) }),
        label,
        plies: packed[2],
        moves: line.length > 0 ? line.split(' ') : [],
      });
    }
    // ECO order, then by depth, which is how a printed encyclopedia reads and
    // what makes "browse B90" land on the main line rather than a subvariation.
    entries.sort(
      (a, b) => a.eco.localeCompare(b.eco) || a.plies - b.plies || a.label.localeCompare(b.label),
    );
    return entries;
  });
  return catalog;
}

export function resetOpeningCatalogForTests(): void {
  catalog = null;
}

/**
 * Informal names players actually type.
 *
 * The dataset is thorough and formal: "Sicilian Defense: Najdorf Variation,
 * English Attack". Nobody types that. These map what is said out loud onto
 * something that appears in a dataset label, so the search box works for the
 * words a chess player uses. They are aliases, not new openings: every one
 * resolves to a term the dataset itself contains.
 */
export const OPENING_ALIASES: Readonly<Record<string, string>> = {
  najdorf: 'Najdorf',
  dragon: 'Dragon',
  'yugoslav attack': 'Yugoslav Attack',
  'poisoned pawn': 'Poisoned Pawn',
  sveshnikov: 'Sveshnikov',
  taimanov: 'Taimanov',
  kan: 'Kan',
  scheveningen: 'Scheveningen',
  'english attack': 'English Attack',
  'ruy lopez': 'Ruy Lopez',
  spanish: 'Ruy Lopez',
  berlin: 'Berlin',
  marshall: 'Marshall',
  italian: 'Italian Game',
  giuoco: 'Giuoco',
  'two knights': 'Two Knights',
  scotch: 'Scotch',
  petrov: 'Petrov',
  petroff: 'Petrov',
  russian: 'Petrov',
  french: 'French Defense',
  winawer: 'Winawer',
  tarrasch: 'Tarrasch',
  advance: 'Advance Variation',
  'caro-kann': 'Caro-Kann',
  'caro kann': 'Caro-Kann',
  pirc: 'Pirc',
  'modern defense': 'Modern Defense',
  alekhine: 'Alekhine Defense',
  scandinavian: 'Scandinavian',
  'centre counter': 'Scandinavian',
  'kings gambit': "King's Gambit",
  vienna: 'Vienna Game',
  'queens gambit': "Queen's Gambit",
  qgd: "Queen's Gambit Declined",
  qga: "Queen's Gambit Accepted",
  slav: 'Slav',
  'semi-slav': 'Semi-Slav',
  'semi slav': 'Semi-Slav',
  meran: 'Meran',
  botvinnik: 'Botvinnik',
  'moscow variation': 'Moscow Variation',
  'anti-moscow': 'Anti-Moscow',
  catalan: 'Catalan',
  nimzo: 'Nimzo-Indian',
  'nimzo-indian': 'Nimzo-Indian',
  'queens indian': "Queen's Indian",
  qid: "Queen's Indian",
  bogo: 'Bogo-Indian',
  grunfeld: 'Grünfeld',
  gruenfeld: 'Grünfeld',
  kid: "King's Indian",
  'kings indian': "King's Indian",
  benoni: 'Benoni',
  benko: 'Benko',
  volga: 'Benko',
  budapest: 'Budapest',
  dutch: 'Dutch Defense',
  leningrad: 'Leningrad',
  stonewall: 'Stonewall',
  english: 'English Opening',
  reti: 'Réti',
  london: 'London System',
  colle: 'Colle',
  trompowsky: 'Trompowsky',
  torre: 'Torre Attack',
  veresov: 'Veresov',
  'kings gambit accepted': "King's Gambit Accepted",
  evans: 'Evans Gambit',
  'four knights': 'Four Knights',
  philidor: 'Philidor',
  latvian: 'Latvian Gambit',
  sicilian: 'Sicilian Defense',
  'accelerated dragon': 'Accelerated',
  'closed sicilian': 'Closed',
  'grand prix': 'Grand Prix',
  'smith-morra': 'Smith-Morra',
  alapin: 'Alapin',
  rossolimo: 'Rossolimo',
  moscow: 'Moscow Variation',
  bird: 'Bird Opening',
  larsen: 'Nimzo-Larsen',
  'nimzo-larsen': 'Nimzo-Larsen',
  grob: 'Grob',
  polish: 'Polish Opening',
  orangutan: 'Polish Opening',
};

const ECO_PATTERN = /^[A-Ea-e]\d{0,2}$/;
const SAN_PATTERN = /^(?:[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?|O-O(?:-O)?)[+#]?$/;

export interface OpeningSearchResult {
  readonly entry: OpeningEntry;
  /** Why it matched, so the list can group by kind rather than look arbitrary. */
  readonly reason: 'eco' | 'name' | 'alias' | 'moves' | 'position';
}

/**
 * Search the library by whatever the user typed.
 *
 * One box, five kinds of query, distinguished by shape rather than by a mode
 * switch: `B90` is an ECO code, `1.e4 c5 2.Nf3` is a move sequence, a FEN is a
 * position, and anything else is a name — after being run through the alias
 * table, so "poisoned pawn" finds what the dataset calls "Poisoned Pawn
 * Variation".
 */
/**
 * The families an empty search box should open on.
 *
 * Without this, "browse the openings" means an ECO-ordered list, and A00 is
 * the Amar Opening — a first screen that suggests Kingfisher's idea of a
 * notable opening is 1.Nh3. These are the families a player would name if
 * asked, and each resolves to its own shortest line in the dataset.
 */
export const OPENING_FAMILIES: readonly string[] = [
  'Sicilian Defense',
  'Ruy Lopez',
  'Italian Game',
  'French Defense',
  'Caro-Kann Defense',
  "Queen's Gambit Declined",
  "Queen's Gambit Accepted",
  'Slav Defense',
  'Semi-Slav Defense',
  'Nimzo-Indian Defense',
  "King's Indian Defense",
  'Grünfeld Defense',
  'Catalan Opening',
  "Queen's Indian Defense",
  'English Opening',
  'London System',
  'Scandinavian Defense',
  'Pirc Defense',
  'Modern Defense',
  'Alekhine Defense',
  'Dutch Defense',
  'Benoni Defense',
  'Benko Gambit',
  'Scotch Game',
  'Four Knights Game',
  'Vienna Game',
  "King's Gambit",
  'Philidor Defense',
  "Petrov's Defense",
  'Trompowsky Attack',
];

export function searchOpenings(
  entries: readonly OpeningEntry[],
  query: string,
  limit = 120,
): readonly OpeningSearchResult[] {
  const raw = query.trim();
  if (raw.length === 0) {
    const shortest = new Map<string, OpeningEntry>();
    for (const entry of entries) {
      const existing = shortest.get(entry.name);
      if (!existing || entry.plies < existing.plies) shortest.set(entry.name, entry);
    }
    const families = OPENING_FAMILIES.map((family) => shortest.get(family)).filter(
      (entry): entry is OpeningEntry => entry !== undefined,
    );
    const seen = new Set(families.map((entry) => entry.key));
    const rest = entries.filter((entry) => entry.plies <= 4 && !seen.has(entry.key));
    return [...families, ...rest]
      .slice(0, limit)
      .map((entry) => ({ entry, reason: 'name' as const }));
  }

  if (ECO_PATTERN.test(raw)) {
    const code = raw.toUpperCase();
    return entries
      .filter((entry) => entry.eco.startsWith(code))
      .slice(0, limit)
      .map((entry) => ({ entry, reason: 'eco' as const }));
  }

  const fen = raw.split(/\s+/).length >= 4 && raw.includes('/') ? tryPositionKey(raw) : null;
  if (fen) {
    return entries
      .filter((entry) => entry.key === fen)
      .map((entry) => ({ entry, reason: 'position' as const }));
  }

  const moves = tokeniseMoves(raw);
  if (moves) {
    const key = keyAfter(moves);
    if (key) {
      const exact = entries.filter((entry) => entry.key === key);
      if (exact.length > 0) return exact.map((entry) => ({ entry, reason: 'moves' as const }));
    }
    // No named position there: offer everything whose own line starts this way,
    // which is what "1.e4 c5 2.Nf3" should show even though it has a name.
    const prefix = entries.filter(
      (entry) =>
        entry.moves.length >= moves.length &&
        moves.every((san, index) => entry.moves[index] === san),
    );
    if (prefix.length > 0) {
      return prefix.slice(0, limit).map((entry) => ({ entry, reason: 'moves' as const }));
    }
  }

  const needle = raw.toLowerCase();
  const alias = OPENING_ALIASES[needle];
  const term = (alias ?? raw).toLowerCase();
  const reason: OpeningSearchResult['reason'] = alias ? 'alias' : 'name';

  return entries
    .filter((entry) => entry.label.toLowerCase().includes(term))
    .sort((a, b) => nameRank(b, term) - nameRank(a, term) || a.plies - b.plies)
    .slice(0, limit)
    .map((entry) => ({ entry, reason }));
}

const nameRank = (entry: OpeningEntry, term: string): number => {
  const label = entry.label.toLowerCase();
  if (label === term) return 3;
  if (label.startsWith(term)) return 2;
  if (entry.name.toLowerCase().includes(term)) return 1;
  return 0;
};

/** SAN tokens from "1. e4 c5 2. Nf3" or "e4 c5 Nf3", or null if it is not that. */
export function tokeniseMoves(input: string): readonly string[] | null {
  const tokens = input
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  return tokens.every((token) => SAN_PATTERN.test(token)) ? tokens : null;
}

/** The position key a legal SAN sequence reaches, or null if it is not legal. */
export function keyAfter(moves: readonly string[]): string | null {
  let position = Position.initial();
  for (const san of moves) {
    const advanced = position.advanceSan(san);
    if (!advanced.ok) return null;
    position = advanced.value.next;
  }
  return positionKey(position.fen);
}

/** The FEN a legal SAN sequence reaches, for putting a library entry on a board. */
export function fenAfter(moves: readonly string[]): Fen | null {
  let position = Position.initial();
  for (const san of moves) {
    const advanced = position.advanceSan(san);
    if (!advanced.ok) return null;
    position = advanced.value.next;
  }
  return position.fen;
}

function tryPositionKey(input: string): string | null {
  const parsed = Position.fromFen(input);
  return parsed.ok ? positionKey(parsed.value.fen) : null;
}

/**
 * Other move orders that reach the same position.
 *
 * Computed rather than stored, because the dataset lists exactly one line per
 * position and a table of permutations would be far larger than the index it
 * decorates. Each side's moves are permuted independently and re-interleaved,
 * and every candidate is *played* — so an order that appears here is one the
 * rules code accepted, not one that looked plausible.
 *
 * Bounded hard. Transposition search is factorial, and a user waiting on an
 * opening page does not care about the 5,000th equivalent move order.
 */
export function alternativeMoveOrders(
  moves: readonly string[],
  { limit = 6, maxPlies = 12 } = {},
): readonly (readonly string[])[] {
  if (moves.length < 4 || moves.length > maxPlies) return [];
  const target = keyAfter(moves);
  if (!target) return [];

  const found: (readonly string[])[] = [];
  const seen = new Set([moves.join(' ')]);
  let examined = 0;
  const BUDGET = 4000;

  const white = moves.filter((_, index) => index % 2 === 0);
  const black = moves.filter((_, index) => index % 2 === 1);

  for (const whiteOrder of permutations(white)) {
    for (const blackOrder of permutations(black)) {
      if (examined >= BUDGET || found.length >= limit) return found;
      examined += 1;
      const candidate: string[] = [];
      for (let index = 0; index < moves.length; index += 1) {
        candidate.push(
          (index % 2 === 0 ? whiteOrder[index >> 1] : blackOrder[index >> 1]) as string,
        );
      }
      const text = candidate.join(' ');
      if (seen.has(text)) continue;
      seen.add(text);
      if (keyAfter(candidate) === target) found.push(candidate);
    }
  }
  return found;
}

/** Every ordering of up to six items; anything longer is refused, not truncated. */
function* permutations<T>(items: readonly T[]): Generator<readonly T[]> {
  if (items.length > 6) {
    yield items;
    return;
  }
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [items[index] as T, ...tail];
  }
}
