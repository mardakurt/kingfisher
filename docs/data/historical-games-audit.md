# Historical games: what was audited, and why nothing was shipped

Kingfisher's reference packs are built from the Lichess broadcast archive,
which begins in 2020. That is a good elite database and a hopeless history of
chess: it has Carlsen, Gukesh and Praggnanandhaa, and no Morphy, Capablanca,
Tal or Fischer at all.

Phase 17 asked whether a **Kingfisher Classics** pack could be built from
legally redistributable historical games. This is the audit. **The answer was
no**, and this file exists so that the next person does not repeat it.

## The legal position on game scores

Chess _moves_ are facts, not creative works. A game score is a record of what
happened, and the consistent position across jurisdictions and commentary is
that it carries no copyright. The claim has been tested: in 2016 the Commercial
Court of the City of Moscow rejected an attempt by a World Championship
organiser to assert rights over the moves of the games, holding the information
to be in the public domain. Annotations are different — those are authored
prose and are protected.

**That is not the end of the question, and treating it as though it were is the
trap.** Two things still stand between "a move is a fact" and "this file may be
redistributed":

1. **Database rights.** In the EU and UK, a `sui generis` database right
   protects substantial extraction from a database whose compilation required
   significant investment, _even when every individual item in it is a fact_.
   Copying somebody's 3-million-game collection is not made lawful by the moves
   being uncopyrightable.
2. **The chain of rights is a claim that has to be checked.** A site offering a
   free download is not thereby granting redistribution, and a compilation
   assembled from sources whose own terms are unknown cannot pass on rights it
   never established.

So the standard applied here is the same one `THIRD_PARTY_DATA.md` applies to
everything else: **a source is used only when its licence has been read, its
redistribution terms confirmed, and its attribution recorded.** Silence is not
permission.

## Sources audited

| Source                                                     | Terms found                  | Verdict                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Lumbra's Gigabase](https://lumbrasgigabase.com/en/)       | **CC BY-NC-SA 4.0**          | **Rejected.** NonCommercial is incompatible with Kingfisher's other data and would restrict what users may do with their own workstation. Its page also states no provenance for the games it aggregates, so the chain of rights behind the licence it grants is unestablished. |
| [PGN Mentor](https://www.pgnmentor.com/)                   | No licence stated            | **Rejected.** Free downloads alongside a paid program. No redistribution grant of any kind is offered, and silence is not permission.                                                                                                                                           |
| Caissabase                                                 | No licence stated; site down | **Rejected.** Described as "based on previous free resources" with no chain of terms. Unmaintained and unreachable.                                                                                                                                                             |
| [Lichess standard database](https://database.lichess.org/) | **CC0 1.0**                  | Usable, and already used — but it is online play only. No historical over-the-board games exist in it.                                                                                                                                                                          |
| Lichess broadcast archive                                  | **CC BY-SA 4.0**             | Already used for Elite OTB, Recent Theory and Starter. Begins in 2020.                                                                                                                                                                                                          |
| [TCEC archive](https://github.com/TCEC-Chess/tcecgames)    | CC BY-SA 3.0                 | Genuinely open, and engine-versus-engine games. Not historical human chess.                                                                                                                                                                                                     |
| Wikipedia / Wikisource game scores                         | CC BY-SA 4.0 on the articles | Individual famous games appear in prose. This is not a corpus, and extracting one would be a hand-transcription exercise measured in games per hour, not a pack.                                                                                                                |

## Decision

**No `Kingfisher Classics` pack was built, and no historical games were
shipped.** No source audited both (a) contains historical master games and
(b) grants redistribution on terms compatible with the rest of Kingfisher's
data.

What was done instead is the part of the brief that does not depend on finding
a corpus: **make sure nothing in the product promises games Kingfisher does not
have.** See `src/reference/players.ts`. Every browse set now contains only
players with at least one game in an installed source; the 67 people the roster
knows and the packs have nothing for are in a Historical index that says what it
is. A profile for one of them shows the roster's own facts — title, dates,
reign, a checked sentence — above a plain statement that the packs begin in 2020. Held by `src/reference/players.test.ts` and `e2e/players.spec.ts`.

## What would change the answer

In rough order of how tractable each looks.

1. **A federation or tournament archive with explicit terms.** Some national
   federations publish their own historical bulletins. Rights would need
   confirming per federation, and coverage would be patchy, but the terms would
   be real.
2. **Transcribing from public-domain published sources.** Tournament books
   published before ~1930 are out of copyright in most jurisdictions, and the
   game scores in them were never protected in the first place. This is a
   transcription project with a verifiable provenance for every game — the
   right answer if somebody wants to do the work, and slow.
3. **A rights holder granting terms.** Worth asking; not worth assuming.

What must **not** happen is any of: scraping a commercial database, assuming a
public download implies redistribution, or shipping a corpus whose provenance
cannot be stated game by game. A pack Kingfisher cannot describe the origin of
is one it should not have.
