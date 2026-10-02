# Large databases without filling the internal SSD

Kingfisher does not ship a copy of Mega Database. Its desktop companion can
stream user-chosen PGN, PGN.zst, PGN.gz and CBH files into SQLite collections.
The source is read-only. The destination stores game records and an index;
this is not a zero-copy PGN mount. Existing Kingfisher collections can be
attached in place, including on an external drive, without importing another copy.

In Databases → Import a large file:

1. Download a permitted archive directly to the drive where you want to keep it.
   [Lichess standard rated games](https://database.lichess.org/#standard_games)
   are CC0; the publisher links SHA-256 checksums. They are online play, not
   historical OTB master games. Computer evaluations are not expert commentary.
2. Choose the archive and **Choose storage folder**. Choose an external SSD for
   a large collection. Kingfisher creates a new file exclusively and refuses
   a filename or registered-name collision. It never overwrites the source.
3. Set the collection size limit. Default: 10 GiB. A SQLite page limit bounds
   the main database; between batches Kingfisher also checks database, WAL and
   shared-memory bytes and a 2 GiB filesystem free-space reserve. A pending
   batch, journal and index finalisation need additional headroom; this is not
   a strict quota over every temporary byte. A filesystem quota is appropriate
   when a hard total allocation limit is required.
4. Choose a rating floor for **both** players and optionally exclude explicit
   BOT tags. PGN header filtering happens before chess parsing. Unknown ratings
   cannot meet a positive floor. Standard chess is required. These filters do
   not run on CBH files. They do not prove human identity or OTB provenance.
5. Compact position indexing is the default. It supports the Explorer and
   move searches, but omits pawn-structure and positional-claim indexes.
   Turn position indexing off for a smaller game-search collection; the
   Explorer then has no evidence from those games.
6. Enter the publisher's SHA-256 to verify the compressed archive before any
   game writes. An omitted checksum is recorded as unverified. Verification
   reads the archive once before the streaming import; it does not decompress
   it into a temporary PGN. Keep the source unchanged throughout the import.

A large-file import belongs to the companion, not the dialog. **Keep importing
in background** closes the dialog without stopping it. Reopen the dialog after
navigation or renderer reload to find the active job or one of the twenty recent
finished jobs. Its companion must still be running. One file import runs at a
time per companion, bounding worker concurrency; other collections remain
readable. Maintenance, deletion and competing writes to the importing collection
are refused until it finishes or stops. If the companion itself restarts, reimport
the same source archive; committed records are deduplicated. A renderer reload
is not the same as a companion restart, and neither is claimed as a fully
certified 10M interruption test.

For an incremental update, copy the destination's collection key from its
source ledger into the large-file dialog. Exact fingerprints deduplicate
repeated records. Provenance, supplied licence, checksum and accepted-game
annotation/date/rating coverage are retained. Coverage includes duplicates and
is not a count of expert-annotated games. Failed/partial imports must be inspected
before treating an update as complete. A stopped import keeps committed games.
Incremental imports into nonempty collections record a rollback ledger in the
same transaction as each new game. In the source ledger, **Roll back this
update** removes only those new records, preserving pre-existing duplicates.
The operation is paged and does not make a second full copy. Partial or failed
updates retain their ledger; reimport the archive to reapply removed games.
Stop an active import before rollback. The initial import into an empty
collection has no update ledger; back up that file if you need a full snapshot. Portable workspace JSON carries authored studies, training questions,
experiment checkpoints and inbox decisions; it does not embed SQLite corpora.

After an update, Repertoire → Inbox → Check recent source games queries one
population with a since-year filter, at most the first 40 prepared positions.
A changed evidence digest reopens an earlier decision. This is a bounded recent
source review, not a complete diff of all games imported since the last update.

## Browser use

Small authored work stays in IndexedDB and portable backups. A browser paired
with the local companion can query registered SQLite collections without moving
millions of games into IndexedDB. Choose/attach the files in the desktop app;
the native directory picker is not available in the browser. Existing remote
reference providers use bounded shard caches and retain source separation.
Uninstalling a pack or clearing a reference cache must not remove authored work.

## Real-scale certification

The dated Phase 86 measurement was 7,484,400 fully indexed games, 36.37 GB.
It does not establish a completed 10M run. Its database and raw archive were
removed after the evidence was written. No external volume was mounted during
this implementation; the internal SSD had about 63 GiB free. A roughly 52 GB
new database plus archive, journals and indexes was not allocated there.

On suitable external storage, the following runs the actual importer and
checks every stored PGN against selected Explorer positions. The oracle walks
the whole corpus, replaying games through the rules without using the posting
records. It does not check every possible position in the corpus.

```sh
node scripts/bench-import-file.mjs --file /Volumes/Chess/archive.pgn.zst \
  --out /Volumes/Chess/acceptance --layout postings --workers 2 \
  --max-gib 80 --sha256 <publisher-sha256> --licence 'Lichess standard, CC0' \
  --min-games 10000000 --sample 30000 --oracle 50 --independent-oracle
```

The script fails on an insufficient corpus or mismatch and records hardware,
Node, Git identity, actual size and query timings. Its first-query timing is
not an operating-system cold-cache guarantee. Keep results with the corpus
identity. A small-corpus oracle pass is not 10M certification.
