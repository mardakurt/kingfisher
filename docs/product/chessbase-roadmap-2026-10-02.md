# Kingfisher versus ChessBase: next development priorities

Research date: 2026-10-02. Baseline: clean `master`, `49ce4bd`.
ChessBase was researched through its publisher's current product pages and
manual; it was not installed or benchmarked. Kingfisher's current code was
inspected. Earlier parity measurements remain dated evidence, not new tests.

## Assessment

Kingfisher is already a substantial research workstation. Adding another
engine, roster or isolated screen will not establish parity. The next work
should make preparation easier to complete, improve reference-data quality,
and finish acceptance of large databases and packaged workflows.

ChessBase ’26 is the Windows comparison target. The publisher announces the
Mac product for November 2026; its demonstrations are not a released Mac
application we can test today. Kingfisher's shared browser/Mac implementation,
local storage and visibly separate populations are useful differentiators.
They do not establish that Kingfisher is faster or universally better.

## Comparison

| Workflow                                        | ChessBase, publisher evidence                                                                                              | Kingfisher, current code inspected                                                                                                                                    | Decision                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Opening research                                | ’26 combines variation history, rating-class results, recorded piece paths, instructive games and tactical exercises       | `opening-report.ts` and `OpeningReportPanel.tsx` combine source-separated branches, named classification, authored briefs, plan counts and bounded collection history | Improve the passage from evidence to reusable preparation; do not rebuild the report                                           |
| Opening surveys                                 | The manual describes a structured variation tree from a reference database, with colour/style choices and selectable depth | No survey builder existed at the baseline; the Explorer required stepping positions individually                                                                      | Add an explicitly bounded survey of recorded practice; do not claim frequency selects the best move                            |
| Reference corpus and updates                    | Mega 2026 advertises >11.7M games, >114,000 annotated games and weekly additions of >5,000 games                           | Reference packs aggregate positions; collections preserve per-game evidence; curated annotations and licensed update breadth are smaller                              | Build a rights-verified update pipeline and annotation catalogue, preserving source, licence, identity and unknown metadata    |
| Database scale                                  | Publisher positions the application as a large-database workstation; we have no comparable measured latency                | Posting indexes, compact move-search indexes and maintenance workers exist. The dated ledger records a 10.68M search-only run and 7.48M fully indexed positions       | Finish 10M end-to-end acceptance on a real corpus, rather than adding another search UI or calling generated benchmarks parity |
| Opponent preparation and repertoire maintenance | Player filtering, reports and surveys support preparation                                                                  | `PreparationReport`, `brief.ts`, `RepertoireInboxDialog` and `inbox.ts` already exist                                                                                 | Connect new source games to decisions, rehearsal and an offline brief with fewer steps                                         |
| Engine work                                     | ’26 advertises remote engines, parallel game analysis and Monte Carlo exploration                                          | Durable queue/deep job projection in `engine/jobs.ts`; companion remote-engine transport and `engine/playouts.ts` Monte Carlo playouts exist                          | Verify restart/recovery, remote worker identity and reproducible budgets before adding new analysis modes                      |
| Interoperability                                | ChessBase's own database ecosystem                                                                                         | CBH/CBV reader, writer and preservation matrix exist; matrix explicitly distinguishes self-readback from validation in ChessBase                                      | Run written files in licensed ChessBase and retain per-field loss reports; do not call self-readback full compatibility        |

Sources checked live:

- [ChessBase ’26 program](https://shop.chessbase.com/en/products/chessbase_26_program_only): reports, piece paths, training, remote/parallel analysis and Monte Carlo features. These are publisher descriptions, not independent measurements.
- [Opening surveys manual](https://help.chessbase.com/CBase/18/Eng/opening_surveys.htm): reference-derived variation trees, style/colour/depth choices and local/offline mode.
- [Mega Database 2026](https://shop.chessbase.com/en/products/mega_database_2026): corpus, annotation and update figures. They are advertised baseline figures, not a live game count we independently verified.
- [ChessBase Mac announcement](https://en.chessbase.com/post/chessbase-finally-on-mac): November 2026 release and demonstrated workflows. No comparison here assumes the announced Mac build has shipped.

## Opening survey increment

Open **Analysis → Opening Report → Opening survey**. Choose one source,
depth in plies (1–8) and moves per position (1–5). Generate a legal variation
tree ordered by that source's recorded frequency, then copy its PGN into a
study or another chess program. The default is four plies, three moves and
at most forty source queries. Surveys use source defaults; Explorer date/rating
filters are not reused. The player-specific Lichess source is disabled here
because a username and colour have not been supplied. This is a survey of recorded practice, not
ChessBase's colour/style recommendation system or an engine evaluation.

Each move carries its count and parent-position denominator. Counts are
position aggregates; a complete generated path need not have occurred in any
single game. Parent comments
mark capped move lists. Root commentary names the source ID, limits and
complete/query-limit/cancelled status. "Complete" means the bounded request
finished, not complete opening theory. Cycles stop; transpositions reuse a
canonical-position query. Invalid positions, illegal moves, mismatched sources
or positions and invalid counts fail visibly. Source/network failures are not
converted to empty evidence. Stop retains labelled partial output; closing
aborts and discards the dialog's transient job. Generating a survey does not replace the analysis tree or repertoire. Selected
answers can now be saved as a durable study chapter with training questions.
Survey generation itself is not a durable background job.

**Copy report** exports the current Opening Report as Markdown with its FEN,
snapshot time, provenance, criteria, sample limits and empty-state reasons.
It can capture still-loading evidence; exporting it does not make that evidence
complete. No schema, reference corpus or engine capability changed.

## Roadmap, implementation and acceptance

1. **Preparation handoff.** Review a survey, choose the moves intentionally,
   save a chapter and turn selected positions into training questions or
   game-day cards. Preserve the original counts as a dated evidence snapshot;
   never silently write popular moves into the user's repertoire. Acceptance:
   a player completes this flow, reloads and restores it from a portable backup.
2. **Verified data updates and an annotation catalogue.** Ingest permitted
   new game archives incrementally with publisher digests, deduplication,
   metadata coverage and licensing. Show new games reaching saved repertoire
   positions, with reversible inbox decisions. Fix unfinished-game outcome
   classification and rebuild affected reference packs before quoting those
   outcomes. Acceptance: real update, rollback, checksum and rights evidence.
3. **Finish real-scale database acceptance.** Complete the partially recorded
   fully indexed 10M run, validate results against an exhaustive oracle, measure
   cold/warm search and report latency, and test interruption and disk limits
   through the product. Publish hardware/corpus/latency details. No new blanket
   speed claim until that run exists.
4. **Reproducible analysis laboratory.** Expose comparable engine identity,
   parameters, position, budget and checkpoint with exportable evidence.
   Verify overnight/restart/remote-disconnection recovery with real workers.
   Extend and verify the existing Monte Carlo playouts with reproducible seeds,
   budgets and game provenance; never present simulated winning frequency as
   an objective evaluation.
5. **Independent interoperability and usability acceptance.** Open exported
   databases in licensed ChessBase; retain a truthful preservation matrix.
   Time the same six research tasks with strong players in both applications.
   Certify the released Mac package and treat Windows acceptance separately.

The follow-up implements preparation chapters and questions; bounded recent-source
inbox checks; checksum-verified incremental imports with transactional update
rollback; source/annotation coverage ledgers; external-directory compact
collections with disk safeguards and PGN header filters; stricter corpus/oracle
acceptance; seeded playout checkpoints, resume and exports; durable job exports;
and a generated independent ChessBase acceptance kit.

Acceptance remains distinct from implementation. No new 10M run, thousands of
expert-authored annotations, overnight remote-worker recovery, licensed
ChessBase comparison, participant timing, Windows run or newly published Mac
certification is asserted by these additions. The scanner already excluded
unfinished results at this checkout; the reducer now also refuses invalid cached
outcomes. No affected pack was identified or silently republished. Recent-source
inbox checks cover at most 40 positions and are not a complete import delta.
See [large databases](../operations/large-databases.md) and
[independent acceptance](../operations/independent-chessbase-acceptance.md).
Hosted sync/collaboration remains outside the previously chosen file-exchange
scope. A new service needs an explicit product decision. Purchasing or copying
ChessBase's proprietary corpus is not a substitute for verified redistribution
rights.

## Release status

The source version was bumped to 1.4.1 after these implementations. The public descriptor continues to name
1.4.0 build 1007 until a separately certified signed/notarized 1.4.1 artifact
is published. A version bump does not establish public release, deployment,
packaged acceptance or complete ChessBase parity. Check the accompanying
validation report for commands actually run.
