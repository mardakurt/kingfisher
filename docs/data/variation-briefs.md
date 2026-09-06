# Variation briefs — what they are, and where the words come from

A brief is the two or three sentences Kingfisher shows under a named opening,
answering "what is this variation?" rather than only "what is it called?".
This file exists because a sentence about chess strategy is the easiest kind of
content to fabricate convincingly, and the hardest for a reader to check.

## The three sources, kept apart on screen

| Part of the panel | Where it comes from                                                                    | Can it be checked?                  |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| The name          | The vendored CC0 opening dataset (`data/openings/`), matched by canonical position key | Yes — it is a lookup                |
| The defining line | `OPENING_LINES` in `src/theory/opening-index.generated.ts`                             | Yes — replayed through `src/chess/` |
| The two sentences | `src/theory/variation-briefs.ts` — authored, fixed at build time                       | Yes — against any opening reference |

The panel labels the third one "Kingfisher summary" every time it is shown. A
reader never has to guess which of the three they are looking at.

## What a brief may say

Only two things:

- the **move or structure that defines the variation** — the fact that makes a
  Najdorf a Najdorf;
- **what each side is playing for** — the standard plans, at the level of
  detail every opening reference states identically.

## What a brief may not say

- an evaluation ("White is better", "±", "unclear");
- a best move, a recommendation, or a repertoire opinion;
- anything about a specific game, player, novelty or year;
- anything that would date. A brief that needs updating when theory moves is
  the wrong kind of sentence for this panel.

Those are exactly the claims Kingfisher already answers with things a user can
interrogate: the engine, the explorer's statistics, and the model games. A
brief that competed with them would be an unsourced opinion sitting next to
sourced evidence, which is worse than saying nothing.

## Why it is not generated

Nothing on this path calls a language model at runtime, and nothing composes
prose from statistics. Every brief is a constant in a source file, reviewed as
code, and covered by tests that assert its length, its provenance field and the
family it is keyed to. Generated opening theory would be indistinguishable from
authored opening theory on screen, and Kingfisher would have no way to tell a
user which one they were reading.

## Coverage, and what happens without one

The dataset names 3,810 positions across 149 families. Briefs cover the
families and principal variations a player actually meets, and everything
deeper **inherits from its nearest named ancestor** — which is correct, because
that is what the variation still is. A position twenty-four plies into a
Najdorf English Attack shows the English Attack's brief and says so in the
provenance line.

Where no ancestor is covered, the panel says a brief has not been written and
shows the dataset's line on its own. It never falls back to prose.

## Changing or adding one

1. Add or edit the entry in `src/theory/variation-briefs.ts`.
2. Key it to a family the dataset actually names — a test enforces this, so a
   brief for an opening that does not exist cannot be committed.
3. Keep each field to one sentence; a test enforces the length.
4. Run `npm test`.

## Coverage, and why it stops where it does

Phase 18 asked for 180–250 briefs. It also said not to produce filler to reach
a number, and measuring which families were uncovered turned those two
instructions into one answer.

|                                    | before Phase 18 |     after |
| ---------------------------------- | --------------: | --------: |
| Briefs                             |             144 |       157 |
| Families with a brief              |              65 |        79 |
| Named positions reached by one     |           3,321 |     3,567 |
| Share of the 3,810 named positions |       **87.2%** | **93.6%** |

Thirteen briefs, not a hundred, and the reason is what the uncovered families
turned out to be. The 84 families with no brief accounted for **489 of 3,810
positions** between them, and the largest were the Van Geet Opening, the
Pterodactyl Defense, the Hungarian Opening, the Kádas Opening and the Ware
Opening. Writing "what each side is playing for" in the Pterodactyl Defense
would be inventing chess knowledge to move a counter.

What was written instead is the list a prepared player can actually be handed:
the Neo-Grünfeld, the English Defense, the Rapport-Jobava System, the Benko
Gambit Declined, the Blumenfeld Countergambit, the Vienna Gambit, the Danish
Gambit Accepted, the Latvian Gambit Accepted, the Elephant Gambit, the two
Blackmar-Diemer branches, and the Zukertort Opening.

Plus the two that are not openings at all. **Queen's Pawn Game** and **King's
Pawn Game** are the dataset's own labels for a 1.d4 or 1.e4 position that has
not yet become a named opening, and they are the two largest uncovered
families by a distance — 82 and 38 positions. A player who lands in one is
exactly the player with nothing else to read, so they now get something true
about what the first move did rather than an empty panel.

Getting the Vienna Gambit to count took a second attempt worth recording. It
was first keyed on `['Vienna Gambit', 'with Max Lange Defense']`, which covered
nothing: the dataset writes that variation as a single label with a comma in
it, and `briefForLineage` strips such a clause back to the family. Keyed on the
family, one brief covers every Vienna Gambit line. The same rule as
"London System, with Bd3", which the suite already held.

**70 families remain uncovered, and they are 243 positions — 6.4%.** They stay
uncovered on purpose.
