#!/usr/bin/env node
/**
 * `npm run players:legends` — the Wikidata item of each historical player.
 *
 * The titled roster (`build-player-roster.mjs`) is everyone Wikidata records
 * with a FIDE title. FIDE awarded its first titles in 1950, so the people who
 * made chess history before that — Morphy, Steinitz, Lasker, Capablanca,
 * Alekhine — are not in it, and a photograph, which is found through a
 * Wikidata item, could never be found for them.
 *
 * This resolves each person in `src/reference/legends.ts` to an item without
 * anyone typing an identifier: Wikidata's own search for the name, then only
 * candidates that are human (P31 Q5), recorded as chess players (P106
 * Q10873124), born in the roster's year and — where the roster states one —
 * died in its year. Exactly one survivor is recorded; none or several records
 * nothing, and that person keeps their initials.
 *
 * Usage:
 *   node scripts/build-legend-identities.mjs          # resolve from Wikidata
 *   node scripts/build-legend-identities.mjs --check  # the committed file matches the roster
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'src', 'reference', 'legend-wikidata.json');
const API = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'Kingfisher-chess-data-build/1.0 (https://github.com/mardakurt/kingfisher)';
const HUMAN = 'Q5';
const CHESS_PLAYER = 'Q10873124';

const { LEGENDS } = await import(path.join(ROOT, 'src', 'reference', 'legends.ts'));

async function api(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, format: 'json' }))
    url.searchParams.set(key, value);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return response.json();
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw new Error(`Wikidata answered no to ${url}`);
}

/** "Capablanca, Jose Raul" → "Jose Raul Capablanca"; a name without a comma as written. */
const spoken = (name) => {
  const [surname, given] = name.split(',').map((part) => part.trim());
  return given ? `${given} ${surname}` : name.trim();
};

const year = (claims, property) => {
  const time = claims?.[property]?.find((claim) => claim.rank !== 'deprecated')?.mainsnak?.datavalue
    ?.value?.time;
  const match = /^[+-](\d{4})-/.exec(time ?? '');
  return match ? Number(match[1]) : null;
};
const items = (claims, property) =>
  (claims?.[property] ?? [])
    .filter((claim) => claim.rank !== 'deprecated')
    .map((claim) => claim.mainsnak?.datavalue?.value?.id);

async function resolve(legend) {
  const searches = [
    ...new Set([legend.name, ...legend.aliases].map(spoken).filter((text) => /\s/.test(text))),
  ];
  const candidates = new Set();
  for (const search of searches.slice(0, 4)) {
    const found = await api({
      action: 'wbsearchentities',
      search,
      language: 'en',
      type: 'item',
      limit: '10',
    });
    for (const hit of found.search ?? []) candidates.add(hit.id);
  }
  if (candidates.size === 0) return { qid: null, why: 'no search result' };
  const { entities } = await api({
    action: 'wbgetentities',
    ids: [...candidates].join('|'),
    props: 'claims',
  });
  const matching = Object.entries(entities ?? {}).filter(([, entity]) => {
    const claims = entity.claims;
    if (!items(claims, 'P31').includes(HUMAN)) return false;
    if (!items(claims, 'P106').includes(CHESS_PLAYER)) return false;
    if (year(claims, 'P569') !== legend.born) return false;
    return legend.died === undefined || year(claims, 'P570') === legend.died;
  });
  if (matching.length !== 1)
    return { qid: null, why: `${matching.length} candidates match name and years` };
  return { qid: matching[0][0] };
}

const names = LEGENDS.map((legend) => legend.name);

if (process.argv.includes('--check')) {
  const file = JSON.parse(readFileSync(OUT, 'utf8'));
  const stale = Object.keys(file.items).filter((name) => !names.includes(name));
  const bad = Object.entries(file.items).filter(([, qid]) => !/^Q\d+$/.test(qid));
  const qids = Object.values(file.items);
  if (stale.length || bad.length || new Set(qids).size !== qids.length) {
    console.error(`legend-wikidata.json: stale ${stale}, malformed ${bad}, duplicates possible`);
    process.exit(1);
  }
  console.log(`legend-wikidata.json: ${qids.length} of ${names.length} people, all on the roster`);
  process.exit(0);
}

const resolved = {};
const unresolved = {};
for (const legend of LEGENDS) {
  const answer = await resolve(legend);
  if (answer.qid) resolved[legend.name] = answer.qid;
  else unresolved[legend.name] = answer.why;
  process.stdout.write(`${legend.name}: ${answer.qid ?? `— ${answer.why}`}\n`);
}
const duplicates = Object.values(resolved).filter((qid, i, all) => all.indexOf(qid) !== i);
if (duplicates.length) throw new Error(`one item for two people: ${duplicates.join(', ')}`);
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      source: 'Wikidata (CC0): wbsearchentities, then P31=Q5, P106=Q10873124, P569/P570 years',
      generatedAt: new Date().toISOString().slice(0, 10),
      items: resolved,
      unresolved,
    },
    null,
    2,
  )}\n`,
);
console.log(`${Object.keys(resolved).length} of ${LEGENDS.length} resolved → ${OUT}`);
