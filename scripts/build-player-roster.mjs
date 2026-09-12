#!/usr/bin/env node
/**
 * `npm run players:roster` — build the titled-player roster from Wikidata.
 *
 * The reference packs know every player who has a game in them, and the
 * curated roster in `src/reference/legends.ts` knows a hundred people the
 * packs cannot. Between the two there was nobody: an International Master
 * from 1975, a Woman Grandmaster who never played an elite event in the
 * pack window, the Grandmaster whose name a user half-remembers. This script
 * derives that middle from Wikidata, which records FIDE titles (P2962),
 * FIDE IDs (P1440), dates, federations, sex and alternative spellings for
 * every titled player anyone has written up, under CC0.
 *
 * What is recorded is only what Wikidata states. Nothing is inferred, no
 * game count is implied, and the application shows every roster row as a
 * person the installed sources may hold nothing for. The output is written
 * to `public/data/players/titled-players.json` with a manifest beside it
 * naming the query date, the counts and the digest, and both are committed
 * so a build is reproducible from the repository alone.
 *
 * Usage:
 *   node scripts/build-player-roster.mjs            # rebuild from Wikidata
 *   node scripts/build-player-roster.mjs --check    # verify the committed file's digest
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'public', 'data', 'players');
const ROSTER = path.join(OUT_DIR, 'titled-players.json');
const MANIFEST = path.join(OUT_DIR, 'titled-players.manifest.json');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Kingfisher-chess-data-build/1.0 (https://github.com/mardakurt/kingfisher)';

/** FIDE titles, highest first, as Wikidata items. */
export const TITLES = [
  { code: 'GM', item: 'Q105269', label: 'Grandmaster' },
  { code: 'WGM', item: 'Q3417060', label: 'Woman Grandmaster' },
  { code: 'IM', item: 'Q752119', label: 'International Master' },
  { code: 'WIM', item: 'Q3314851', label: 'Woman International Master' },
];

/** Latin-script languages whose labels give the transliterations people type. */
const ALIAS_LANGUAGES = ['en', 'de', 'fr', 'es', 'nl', 'pl', 'hu', 'cs', 'tr', 'pt', 'it', 'sv'];

/** Everyone holding the title: cheap, and the list the detail batches walk. */
const membersQuery = (item) => `SELECT ?p WHERE { ?p wdt:P31 wd:Q5; wdt:P2962 wd:${item} . }`;

/** The facts about a batch of people. Grouped per person; aliases concatenated. */
const detailQuery = (qids) => `
SELECT ?p ?name ?fide ?born ?died ?sex ?iso
  (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
  (MAX(?elo) AS ?peak)
WHERE {
  VALUES ?p { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?p rdfs:label ?name FILTER(LANG(?name) = "en")
  OPTIONAL { ?p wdt:P1440 ?fide }
  OPTIONAL { ?p wdt:P569 ?born }
  OPTIONAL { ?p wdt:P570 ?died }
  OPTIONAL { ?p wdt:P21 ?sex }
  OPTIONAL { ?p wdt:P27 ?country . ?country wdt:P297 ?iso }
  OPTIONAL { ?p wdt:P1087 ?elo }
  OPTIONAL {
    { ?p skos:altLabel ?alt } UNION { ?p rdfs:label ?alt }
    FILTER(LANG(?alt) IN (${ALIAS_LANGUAGES.map((l) => `"${l}"`).join(', ')}))
  }
}
GROUP BY ?p ?name ?fide ?born ?died ?sex ?iso`;

const BATCH = 150;

async function sparql(text, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `query=${encodeURIComponent(text)}`,
    });
    if (response.ok) return (await response.json()).results.bindings;
    if (![429, 502, 503, 504].includes(response.status)) {
      throw new Error(`${label}: Wikidata answered ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000 * attempt));
  }
  throw new Error(`${label}: Wikidata kept answering with a timeout or rate limit`);
}

async function fetchTitle({ code, item }) {
  const members = (await sparql(membersQuery(item), code)).map((row) =>
    row.p.value.replace('http://www.wikidata.org/entity/', ''),
  );
  const rows = [];
  for (let start = 0; start < members.length; start += BATCH) {
    const batch = members.slice(start, start + BATCH);
    const answer = await sparql(detailQuery(batch), `${code} ${start}-${start + batch.length}`);
    for (const row of answer) {
      rows.push({
        code,
        qid: row.p.value.replace('http://www.wikidata.org/entity/', ''),
        name: row.name.value,
        fide: row.fide?.value ?? '',
        born: year(row.born?.value),
        died: year(row.died?.value),
        female: row.sex?.value === 'http://www.wikidata.org/entity/Q6581072',
        federation: row.iso?.value ?? '',
        peak: row.peak?.value ? Number(row.peak.value) : 0,
        alts: (row.alts?.value ?? '').split('|').filter(Boolean),
      });
    }
    process.stdout.write('.');
  }
  return rows;
}

const year = (value) => (value ? Number(value.slice(0, 4)) || 0 : 0);

/** Fold a name to what two spellings share, the way the search does. */
const fold = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[-'’.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * One row per person, holding their highest title. Aliases are the labels
 * that fold to something the name does not — a real alternative spelling,
 * not the same name with an accent — and a handful at most.
 */
function merge(rows) {
  const byPerson = new Map();
  for (const row of rows) {
    const current = byPerson.get(row.qid);
    if (!current) {
      byPerson.set(row.qid, row);
      continue;
    }
    // Rows arrive highest title first; keep that, union the aliases.
    byPerson.set(row.qid, { ...current, alts: [...current.alts, ...row.alts] });
  }
  const roster = [];
  for (const row of byPerson.values()) {
    const seen = new Set([fold(row.name)]);
    const aliases = [];
    // Shortest first: a nickname or a bare surname is what gets typed, and
    // GROUP_CONCAT returns labels in no stable order.
    const candidates = [...new Set(row.alts)].sort(
      (a, b) => a.length - b.length || a.localeCompare(b),
    );
    for (const alt of candidates) {
      const key = fold(alt);
      // Latin letters only, at most four words: a nickname or a spelling, not
      // a handle ("yifan0227") or an epithet ("El Mozart del ajedrez").
      if (!key || seen.has(key) || !/^[a-z ]+$/.test(key) || key.split(' ').length > 4) continue;
      if (/[a-z][A-Z]/.test(alt)) continue; // a handle ("lachesisQ"), not a name
      seen.add(key);
      aliases.push(alt);
      if (aliases.length === 8) break;
    }
    const entry = { q: row.qid, n: row.name, t: row.code };
    if (aliases.length) entry.a = aliases;
    if (row.fide) entry.f = row.fide;
    if (row.born) entry.b = row.born;
    if (row.died) entry.d = row.died;
    if (row.female) entry.w = 1;
    if (row.federation) entry.c = row.federation;
    if (row.peak) entry.e = row.peak;
    roster.push(entry);
  }
  roster.sort((a, b) => a.n.localeCompare(b.n) || a.q.localeCompare(b.q));
  return roster;
}

const digestOf = (text) => createHash('sha256').update(text).digest('hex');

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const actual = digestOf(readFileSync(ROSTER, 'utf8'));
  if (actual !== manifest.sha256) {
    console.error(`titled-players.json digest ${actual} ≠ manifest ${manifest.sha256}`);
    process.exit(1);
  }
  console.log(`titled-players.json — ${manifest.count} players, digest matches the manifest.`);
} else {
  const rows = [];
  for (const title of TITLES) {
    process.stdout.write(`${title.label} … `);
    const fetched = await fetchTitle(title);
    process.stdout.write(`${fetched.length}\n`);
    rows.push(...fetched);
  }
  const roster = merge(rows);
  const text = `${JSON.stringify(roster)}\n`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(ROSTER, text);
  const counts = Object.fromEntries(
    TITLES.map((t) => [t.code, roster.filter((r) => r.t === t.code).length]),
  );
  const manifest = {
    schema: 'kingfisher-titled-players/1',
    source: 'Wikidata (https://www.wikidata.org/), SPARQL endpoint',
    licence: 'CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/',
    query:
      'humans with a FIDE title (P2962) of GM, WGM, IM or WIM; see scripts/build-player-roster.mjs',
    fetchedAt: new Date().toISOString(),
    count: roster.length,
    counts,
    withFideId: roster.filter((r) => r.f).length,
    withBirthYear: roster.filter((r) => r.b).length,
    withAliases: roster.filter((r) => r.a).length,
    bytes: Buffer.byteLength(text),
    sha256: digestOf(text),
    fields: {
      q: 'Wikidata item',
      n: 'name (English label)',
      t: 'highest FIDE title',
      a: 'alternative spellings (Latin script)',
      f: 'FIDE ID',
      b: 'birth year',
      d: 'death year',
      w: '1 when Wikidata records the person as female',
      c: 'federation, ISO 3166-1 alpha-2 of the country of citizenship',
      e: 'highest Elo Wikidata records',
    },
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${roster.length} titled players, ${(manifest.bytes / 1024).toFixed(0)} KB → ${path.relative(ROOT, ROSTER)}`,
  );
}
