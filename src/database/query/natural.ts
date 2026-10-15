/**
 * "Carlsen as Black in the Najdorf since 2018, rated over 2700, blitz" — a
 * sentence compiled into the same `GameQuery` the search form builds.
 *
 * Deterministic and offline: no model, no service, nothing guessed. Every
 * word of the sentence is either understood — and shown back as a labelled
 * condition before anything runs — or reported as not understood. A phrase
 * this parser cannot express exactly (a player's wins without a colour, two
 * structures at once) is refused with the reason, never widened into a
 * query that means something else. The person reads what will run, and the
 * form it fills is the ordinary one, so they can correct it there.
 *
 * Vocabulary is grounded rather than invented: opening names come from the
 * CC0 classification Kingfisher already ships (`OPENING_LABELS`), structures
 * from the strategic-theme registry, time classes from `time-control.ts`.
 */

import { STRATEGIC_THEMES } from '@/chess/themes';
import type { Color } from '@/chess/types';
import type { GameResult } from '@/database/types';
import type { TimeClass } from '@/search/time-control';
import { OPENING_LABELS } from '@/theory/opening-index.generated';

import { QUERY_VERSION, type GameQuery, type QueryPredicate } from './ast';

export interface NaturalPart {
  /** What the condition is, for a chip: "Player", "Opening", "Years". */
  readonly label: string;
  /** How it reads: "Carlsen (Black)", "Najdorf", "2018 onwards". */
  readonly value: string;
}

export interface NaturalQuery {
  /** `null` when nothing was understood, or when something was refused. */
  readonly query: GameQuery | null;
  readonly parts: readonly NaturalPart[];
  /** Words that meant nothing to the parser, in the order typed. */
  readonly unparsed: readonly string[];
  /** Why a phrase that was understood could not be expressed. */
  readonly refusals: readonly string[];
}

// ---------------------------------------------------------------------------
// Tokens

interface Token {
  readonly text: string;
  readonly lower: string;
  /** Capitalised as typed — a hint that a word is a name. */
  readonly capital: boolean;
  used: boolean;
}

const normalise = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/defence/gi, 'defense')
    .replace(/[–—]/g, '-');

function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  for (const match of normalise(input).matchAll(
    /\b[A-Ea-e]\d{1,2}\b|[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'.-]*|\d{4}s?\+?|\d+\+?|[<>]=?|-/g,
  )) {
    const text = match[0].replace(/[.,]+$/, '');
    if (!text) continue;
    tokens.push({
      text,
      lower: text.toLowerCase(),
      capital: /^[A-ZÀ-ÖØ-Þ]/.test(text),
      used: false,
    });
  }
  return tokens;
}

/** Words that carry no condition of their own and are never reported. */
const FILLER = new Set([
  'a',
  'an',
  'the',
  'all',
  'any',
  'games',
  'game',
  'show',
  'find',
  'me',
  'list',
  'with',
  'in',
  'of',
  'and',
  'from',
  'where',
  'which',
  'that',
  'played',
  'playing',
  'were',
  'was',
  'is',
  'are',
  'only',
  'by',
  'for',
  'at',
  'on',
  'to',
  'pieces',
  'side',
  'my',
  'please',
  'search',
  'opening',
  'openings',
  'line',
  'lines',
  'his',
  'her',
  'their',
  'had',
  'has',
  'did',
  'between',
  'during',
  'year',
  'years',
  'players',
  'player',
  'both',
  'rated',
  'rating',
  'ratings',
  'elo',
  'over',
  'above',
  'under',
  'below',
  'least',
  'most',
  'since',
  'after',
  'before',
  'until',
  'as',
  'vs',
  'v',
  'versus',
  'against',
  'or',
  'than',
  'more',
  'less',
  'time',
  'control',
  'positions',
  'position',
  'structures',
  'structure',
  'endgames',
  'endings',
]);

/** Words that end a name: a name never runs across one. */
const BOUNDARY = new Set([
  ...FILLER,
  'white',
  'black',
  'wins',
  'win',
  'won',
  'winning',
  'victories',
  'beat',
  'beats',
  'lost',
  'loses',
  'lose',
  'losses',
  'draw',
  'draws',
  'drawn',
  'drawing',
  'annotated',
  'commented',
  'comments',
  'annotations',
]);

// ---------------------------------------------------------------------------
// Vocabularies

const TIME_WORDS: Readonly<Record<string, TimeClass>> = {
  ultrabullet: 'ultrabullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  rapidplay: 'rapid',
  classical: 'classical',
  standard: 'classical',
  correspondence: 'correspondence',
  corr: 'correspondence',
};

const THEME_ALIASES: readonly (readonly [string, string])[] = (() => {
  const aliases: [string, string][] = [];
  for (const theme of STRATEGIC_THEMES) {
    const name = normalise(theme.name).toLowerCase();
    aliases.push([name, theme.id]);
    aliases.push([name.replace(/coloured/g, 'colored'), theme.id]);
    aliases.push([name.replace(/'s/g, ''), theme.id]);
    aliases.push([theme.id.replace(/-/g, ' '), theme.id]);
  }
  const extra: Record<string, string> = {
    iqp: 'isolated-queen-pawn',
    isolani: 'isolated-queen-pawn',
    'isolated pawn': 'isolated-queen-pawn',
    'rook endgame': 'rook-ending',
    'rook endgames': 'rook-ending',
    'rook endings': 'rook-ending',
    'minor piece endgame': 'minor-piece-ending',
    'minor piece endgames': 'minor-piece-ending',
    'minor piece endings': 'minor-piece-ending',
    'opposite castling': 'opposite-side-castling',
    'castling on opposite sides': 'opposite-side-castling',
    queenless: 'queenless-middlegame',
    'queens off': 'queenless-middlegame',
    'carlsbad structure': 'carlsbad',
    'opposite bishops': 'opposite-coloured-bishops',
    'opposite colored bishops': 'opposite-coloured-bishops',
    'opposite-colored bishops': 'opposite-coloured-bishops',
    'bishop pair': 'bishop-pair',
  };
  for (const [alias, id] of Object.entries(extra)) {
    if (STRATEGIC_THEMES.some((theme) => theme.id === id)) aliases.push([alias, id]);
  }
  return aliases.sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);
})();

/** Generic words that name a variation's kind, never a variation by themselves. */
const GENERIC = new Set([
  'defense',
  'variation',
  'attack',
  'gambit',
  'opening',
  'game',
  'system',
  'line',
  'declined',
  'accepted',
  'main',
  'modern',
  'classical',
  'open',
  'closed',
  'normal',
  'exchange',
  'advance',
  'accelerated',
  'fianchetto',
  'symmetrical',
  'old',
  'new',
  'two',
  'three',
  'four',
  'king',
  'queen',
  'pawn',
  'knight',
  'bishop',
  'rook',
  'center',
  'centre',
  'wing',
  'reversed',
  'quiet',
  'double',
  'early',
  'delayed',
  'deferred',
  'counterattack',
  'countergambit',
  'formation',
  'structure',
  'setup',
  'complex',
  'refused',
  'with',
  'without',
  'and',
  'of',
  'the',
  'knights',
  'bishops',
  'pawns',
  'kings',
  'queens',
  'rooks',
  'black',
  'white',
  'standard',
  'rapid',
  'blitz',
  'bullet',
  'indian',
]);

interface OpeningPhrase {
  readonly words: readonly string[];
  readonly display: string;
  /** How many classified lines carry it: "Najdorf" outranks a one-off "Fischer". */
  readonly weight: number;
}

const OPENING_PHRASES: readonly OpeningPhrase[] = (() => {
  const seen = new Map<string, { display: string; weight: number }>();
  const add = (phrase: string) => {
    const display = phrase.trim();
    const key = normalise(display).toLowerCase();
    if (key.length < 4) return;
    const known = seen.get(key);
    if (known) known.weight += 1;
    else seen.set(key, { display, weight: 1 });
  };
  const SUFFIX = new Set([
    'defense',
    'variation',
    'attack',
    'gambit',
    'opening',
    'game',
    'system',
    'line',
  ]);
  const trimSuffix = (segment: string) => {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length > 1 && SUFFIX.has(normalise(words[words.length - 1]!).toLowerCase()))
      words.pop();
    return words.join(' ');
  };
  for (const label of OPENING_LABELS) {
    if (/^[A-E]\d{2}$/.test(label)) continue;
    // "Caro-Kann Advance" names "Caro-Kann Defense: Advance Variation" exactly.
    const [family, rest] = label.split(':');
    const variation = rest?.split(',')[0];
    if (family && variation) {
      const display = `${family.trim()}: ${variation.trim()}`;
      for (const key of [
        `${trimSuffix(family)} ${trimSuffix(variation)}`,
        `${trimSuffix(family)} ${variation.trim()}`,
      ]) {
        const normalised = normalise(key).toLowerCase();
        const known = seen.get(normalised);
        if (known) known.weight += 1;
        else seen.set(normalised, { display, weight: 1 });
      }
    }
    for (const segment of label.split(/[:,]/)) {
      const words = segment.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      add(words.join(' '));
      // "Najdorf Variation" → "Najdorf"; "King's Indian Defense" → "King's Indian".
      const stem = [...words];
      while (stem.length > 0 && GENERIC.has(normalise(stem[stem.length - 1]!).toLowerCase()))
        stem.pop();
      if (stem.length === 0) continue;
      const stemText = stem.join(' ');
      if (stem.length === 1 && !/^[A-ZÀ-ÖØ-Þ]/.test(stem[0]!)) continue;
      add(stemText);
    }
  }
  return [...seen.entries()]
    .map(([key, { display, weight }]) => ({ words: key.split(' '), display, weight }))
    .sort((a, b) => b.words.length - a.words.length || b.weight - a.weight);
})();

// ---------------------------------------------------------------------------
// The parse

export function parseNaturalQuery(input: string, now: Date = new Date()): NaturalQuery {
  const tokens = tokenise(input);
  const parts: NaturalPart[] = [];
  const refusals: string[] = [];
  const where: QueryPredicate[] = [];
  const thisYear = now.getFullYear();

  const take = (from: number, count: number) => {
    for (let index = from; index < from + count && index < tokens.length; index += 1)
      tokens[index]!.used = true;
  };
  const free = (index: number) => index >= 0 && index < tokens.length && !tokens[index]!.used;
  const word = (index: number) => (index >= 0 && index < tokens.length ? tokens[index]!.lower : '');
  /** Match a run of lower-case words at `index`, all still free. */
  const at = (index: number, phrase: readonly string[]) =>
    phrase.every((part, offset) => free(index + offset) && word(index + offset) === part);

  // ECO codes and ranges: "B90", "B90-B99", "C6".
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^([a-e])(\d{1,2})$/.exec(word(index));
    if (!match || !free(index)) continue;
    let prefix = `${match[1]!.toUpperCase()}${match[2]}`;
    take(index, 1);
    if (word(index + 1) === '-' || word(index + 1) === 'to') {
      const end = /^([a-e])?(\d{2})$/.exec(word(index + 2));
      if (end && match[2]!.length === 2) {
        const [a, b] = [match[2]!, end[2]!];
        prefix = a[0] === b[0] && a[1] === '0' && b[1] === '9' ? prefix.slice(0, 2) : prefix;
        if (prefix.length === 3 && a !== b)
          refusals.push(`ECO ${prefix}–${b} is not a single code family; searching ${prefix}.`);
        take(index + 1, 2);
      }
    }
    where.push({ type: 'eco', prefix });
    parts.push({ label: 'ECO', value: prefix.length === 3 ? prefix : `${prefix}0–${prefix}9` });
    break;
  }

  // Years.
  const yearOf = (text: string) => {
    const value = Number(text);
    return /^\d{4}$/.test(text) && value >= 1475 && value <= thisYear + 1 ? value : null;
  };
  let years: { from?: number; to?: number } | null = null;
  for (let index = 0; index < tokens.length && !years; index += 1) {
    if (!free(index)) continue;
    const here = word(index);
    const next = word(index + 1);
    if (
      (here === 'between' || here === 'from') &&
      yearOf(next) !== null &&
      ['and', 'to', '-'].includes(word(index + 2))
    ) {
      const end = yearOf(word(index + 3));
      if (end !== null) {
        years = { from: Math.min(yearOf(next)!, end), to: Math.max(yearOf(next)!, end) };
        take(index, 4);
      }
    } else if (
      yearOf(here) !== null &&
      word(index + 1) === '-' &&
      yearOf(word(index + 2)) !== null
    ) {
      years = { from: yearOf(here)!, to: yearOf(word(index + 2))! };
      take(index, 3);
    } else if ((here === 'since' || here === 'from') && yearOf(next) !== null) {
      years = { from: yearOf(next)! };
      take(index, 2);
    } else if (here === 'after' && yearOf(next) !== null) {
      years = { from: yearOf(next)! + 1 };
      take(index, 2);
    } else if (
      (here === 'before' || here === 'until' || here === 'till') &&
      yearOf(next) !== null
    ) {
      years = { to: here === 'before' ? yearOf(next)! - 1 : yearOf(next)! };
      take(index, 2);
    } else if (here === 'this' && next === 'year') {
      years = { from: thisYear, to: thisYear };
      take(index, 2);
    } else if (here === 'last' && next === 'year') {
      years = { from: thisYear - 1, to: thisYear - 1 };
      take(index, 2);
    } else if (here === 'last' && /^\d{1,2}$/.test(next) && word(index + 2) === 'years') {
      years = { from: thisYear - Number(next) + 1 };
      take(index, 3);
    } else if (/^\d{3}0s$/.test(here)) {
      const decade = Number(here.slice(0, 4));
      years = { from: decade, to: decade + 9 };
      take(index, 1);
    } else if (yearOf(here) !== null && !isRatingCue(word(index - 1)) && !here.endsWith('+')) {
      years = { from: yearOf(here)!, to: yearOf(here)! };
      take(index, 1);
      if (word(index - 1) === 'in' && free(index - 1)) take(index - 1, 1);
    }
  }
  if (years) {
    where.push({ type: 'year', ...years });
    parts.push({
      label: 'Years',
      value:
        years.from !== undefined && years.to !== undefined
          ? years.from === years.to
            ? String(years.from)
            : `${years.from}–${years.to}`
          : years.from !== undefined
            ? `${years.from} onwards`
            : `up to ${years.to}`,
    });
  }

  // Ratings: "rated over 2600", "2700+", "both players above 2500", "under 2000".
  const ratingOf = (text: string) => {
    const value = Number(text.replace(/\+$/, ''));
    return /^\d{3,4}\+?$/.test(text) && value >= 600 && value <= 3600 ? value : null;
  };
  let rating: { min?: number; max?: number; scope?: 'both' } | null = null;
  for (let index = 0; index < tokens.length && !rating; index += 1) {
    if (!free(index)) continue;
    const value = ratingOf(word(index));
    if (value === null) continue;
    const before = [word(index - 1), word(index - 2), word(index - 3)];
    const cued = word(index).endsWith('+') || before.some(isRatingCue);
    if (!cued) continue;
    const below = before
      .slice(0, 2)
      .some((cue) => cue === 'under' || cue === 'below' || cue === '<' || cue === 'most');
    const both = [word(index - 1), word(index - 2), word(index - 3), word(index - 4)].includes(
      'both',
    );
    rating = below ? { max: value } : { min: value };
    if (both) rating = { ...rating, scope: 'both' };
    take(index, 1);
  }
  if (rating) {
    where.push({ type: 'rating', ...rating });
    parts.push({
      label: rating.scope === 'both' ? 'Both rated' : 'Rated',
      value: rating.min !== undefined ? `${rating.min}+` : `under ${rating.max}`,
    });
  }

  // Time class.
  for (let index = 0; index < tokens.length; index += 1) {
    const value = TIME_WORDS[word(index)];
    if (!value || !free(index)) continue;
    take(index, 1);
    where.push({ type: 'timeClass', value });
    parts.push({ label: 'Time control', value: value[0]!.toUpperCase() + value.slice(1) });
    break;
  }

  // Annotations.
  for (let index = 0; index < tokens.length; index += 1) {
    if (!free(index)) continue;
    if (word(index) === 'annotated' || word(index) === 'annotations') {
      take(index, 1);
      where.push({ type: 'annotations', value: 'annotated' });
      parts.push({ label: 'Annotations', value: 'annotated' });
      break;
    }
    if (word(index) === 'commented' || word(index) === 'comments') {
      take(index, 1);
      where.push({ type: 'annotations', value: 'commented' });
      parts.push({ label: 'Annotations', value: 'with comments' });
      break;
    }
  }

  // Structures.
  let themed = false;
  for (const [alias, id] of THEME_ALIASES) {
    const phrase = alias.split(' ');
    for (let index = 0; index < tokens.length; index += 1) {
      if (!at(index, phrase)) continue;
      take(index, phrase.length);
      if (themed) {
        refusals.push(`One structure at a time: "${alias}" was not added.`);
        continue;
      }
      themed = true;
      where.push({ type: 'theme', id });
      parts.push({
        label: 'Structure',
        value: STRATEGIC_THEMES.find((theme) => theme.id === id)!.name,
      });
    }
  }

  // Players: explicit roles first, so "by Alekhine" is a person and not a defence.
  const nameAt = (
    start: number,
    step: 1 | -1,
  ): { text: string; from: number; count: number } | null => {
    const words: string[] = [];
    let index = start;
    while (
      free(index) &&
      !BOUNDARY.has(word(index)) &&
      !/^\d/.test(word(index)) &&
      words.length < 4
    ) {
      words.push(tokens[index]!.text);
      index += step;
    }
    if (words.length === 0) return null;
    if (step === -1) words.reverse();
    const from = step === 1 ? start : start - words.length + 1;
    return { text: words.join(' ').replace(/'s$/i, ''), from, count: words.length };
  };

  let player: string | null = null;
  let opponent: string | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    if (!free(index) || !['vs', 'v', 'versus', 'against'].includes(word(index))) continue;
    const right = nameAt(index + 1, 1);
    const left = nameAt(index - 1, -1);
    take(index, 1);
    if (right) {
      opponent = right.text;
      take(right.from, right.count);
    }
    if (left) {
      player = left.text;
      take(left.from, left.count);
    }
    break;
  }
  for (let index = 0; index < tokens.length && !player; index += 1) {
    if (!free(index)) continue;
    if (word(index) === 'by' || (word(index) === 'of' && word(index - 1) === 'games')) {
      const name = nameAt(index + 1, 1);
      if (name) {
        player = name.text;
        take(index, 1);
        take(name.from, name.count);
      }
    }
  }

  // Colour: "as Black", "with the white pieces", "playing white".
  let colour: Color | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const side = word(index);
    if ((side !== 'white' && side !== 'black') || !free(index)) continue;
    const lead = [word(index - 1), word(index - 2)];
    if (!lead.some((cue) => cue === 'as' || cue === 'with' || cue === 'playing' || cue === 'for'))
      continue;
    // "White wins" is a result, not a side.
    if (['wins', 'won', 'win'].includes(word(index + 1))) continue;
    colour = side === 'white' ? 'w' : 'b';
    take(index, 1);
    for (const offset of [1, 2])
      if (['as', 'with', 'playing', 'for', 'the'].includes(word(index - offset)))
        take(index - offset, 1);
    if (word(index + 1) === 'pieces') take(index + 1, 1);
    if (!player) {
      const name = nameAt(
        index -
          1 -
          lead.filter((cue) => ['as', 'with', 'playing', 'for', 'the'].includes(cue)).length,
        -1,
      );
      if (name) {
        player = name.text;
        take(name.from, name.count);
      }
    }
    break;
  }

  // Openings, longest phrase first, from the classification's own names.
  let opening: string | null = null;
  for (const phrase of OPENING_PHRASES) {
    if (opening) break;
    /*
      A one-word name carried by only a line or two is usually a person the
      variation is named after ("Carlsen Variation"), and a capitalised
      surname with no player yet named is far more likely to mean the player.
      Once a player is named, it is free to be the variation.
    */
    if (phrase.words.length === 1 && phrase.weight < 3 && !player) continue;
    for (let index = 0; index + phrase.words.length <= tokens.length; index += 1) {
      if (!at(index, phrase.words)) continue;
      opening = phrase.display;
      take(index, phrase.words.length);
      for (const generic of ['defense', 'variation', 'attack', 'gambit', 'opening', 'system']) {
        if (word(index + phrase.words.length) === generic) take(index + phrase.words.length, 1);
      }
      break;
    }
  }
  if (opening) {
    where.push({ type: 'opening', contains: opening });
    parts.push({ label: 'Opening', value: opening });
  }

  // A remaining capitalised name, when no role named a player: "Carlsen Najdorf 2019".
  if (!player) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (!free(index) || !tokens[index]!.capital || BOUNDARY.has(word(index))) continue;
      const name = nameAt(index, 1);
      if (!name) continue;
      player = name.text;
      take(name.from, name.count);
      break;
    }
  }

  // Results.
  let result: GameResult | null = null;
  for (let index = 0; index < tokens.length && !result; index += 1) {
    if (!free(index)) continue;
    const here = word(index);
    const before = word(index - 1);
    if (['draw', 'draws', 'drawn', 'drawing'].includes(here)) {
      result = '1/2-1/2';
      take(index, 1);
    } else if (['wins', 'won', 'win', 'winning', 'victories', 'beat', 'beats'].includes(here)) {
      if ((before === 'white' || before === 'black') && free(index - 1)) {
        result = before === 'white' ? '1-0' : '0-1';
        take(index - 1, 2);
      } else if (player && colour) {
        result = colour === 'w' ? '1-0' : '0-1';
        take(index, 1);
      } else {
        take(index, 1);
        refusals.push(
          player
            ? `To find ${player}'s wins, say which colour: "as White" or "as Black".`
            : 'Say whose wins: "White wins", "Black wins", or a player with a colour.',
        );
      }
    } else if (['lost', 'loses', 'lose', 'losses', 'losing'].includes(here)) {
      take(index, 1);
      if (player && colour) result = colour === 'w' ? '0-1' : '1-0';
      else
        refusals.push(
          'To find losses, name the player and their colour: "Carlsen as White, lost".',
        );
    }
  }

  if (player || opponent) {
    where.push({
      type: 'player',
      name: player ?? '',
      ...(colour ? { color: colour } : {}),
      ...(opponent ? { opponent } : {}),
    });
    parts.unshift(...(opponent ? [{ label: 'Opponent', value: opponent }] : []));
    if (player) {
      parts.unshift({
        label: 'Player',
        value: colour ? `${player} (${colour === 'w' ? 'White' : 'Black'})` : player,
      });
    }
  } else if (colour) {
    refusals.push('A colour needs a player: "Carlsen as Black".');
  }
  if (result) {
    where.push({ type: 'result', value: result });
    parts.push({
      label: 'Result',
      value:
        result === '1/2-1/2'
          ? 'Draw'
          : player && colour
            ? result === (colour === 'w' ? '1-0' : '0-1')
              ? `${player} won`
              : `${player} lost`
            : result === '1-0'
              ? 'White won'
              : 'Black won',
    });
  }

  const unparsed = tokens
    .filter((token) => !token.used && !FILLER.has(token.lower) && token.lower !== '-')
    .map((token) => token.text);

  return {
    query:
      where.length > 0 && refusals.length === 0
        ? { version: QUERY_VERSION, where: { type: 'and', of: where } }
        : null,
    parts,
    unparsed,
    refusals,
  };
}

function isRatingCue(text: string): boolean {
  return [
    'rated',
    'rating',
    'elo',
    'over',
    'above',
    'under',
    'below',
    'least',
    'most',
    '>',
    '>=',
    '<',
    '<=',
    'players',
    'both',
  ].includes(text);
}
