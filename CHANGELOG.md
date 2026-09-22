# Kingfisher changelog

The user-facing changelog. Internal phase history is in
`docs/reports/` and `docs/product/phase-*.md`; the list below is what
real users notice.

## Unreleased (web)

Phase numbers below this header will be moved into a dated `## <version>` section at the next release. Until then, they sit here in chronological order.

- **Fixed: the round brief's first section could say nothing.** With no
  games of the opponent's on this machine — or none with the colour they will
  have — _What they play_ printed its title and a dash. It now says which
  input was missing, as every other section of the brief already did.
- **Recurring facts in Review → Improvement.** Four questions now join the
  selected period's games to evidence Kingfisher already stores: which moves
  crossed a visible engine-loss threshold, which pawn structures occurred in
  at least five games with a below-50% record, which player-authored endgame
  categories had that record, and which prepared repertoire positions did.
  Every row shows W/L/D and its unique games, opens the records behind it, and
  groups positions canonically so transpositions meet. There is no new score,
  diagnosis or style label. (`docs/design/recurring-mistakes.md`, Phase 80)
- **The season (`/season`).** Pick the last 30/90/180/365 days, an event,
  a site or an ECO from games that exist on this machine. Five sections read
  clock use by phase and move number, the positions that cost the most time,
  time trouble at moves 30/35/40 and the openings where the move-15 clock was
  lowest. Every section states its denominator. Enabling all sources compares
  OTB, Lichess and Chess.com in separate blocks; their populations are never
  merged. (`docs/design/season.md`, Phase 79)
- **The daily session (`/daily`).** Fifteen minutes built only from the
  player's own work, in four slices in a fixed order: due repertoire
  cards (training items in `repertoire-recall` mode), due critical
  positions (review items), one seeded endgame from the player's saved
  library (tablebase-eligible only), and the most recent round brief's
  first three sheet cards. Grading reuses the existing SM-2 scheduler
  on the same record the player already trusts in `/review` — no
  separate "daily session" store. The headline says "X rehearsed of Y"
  because that is the only honest count: no streak, no rating-gain, no
  invented score. (`docs/design/daily-session.md`, Phase 78)
- **The position page (`/position?fen=…`).** One URL for everything Kingfisher
  knows about a position: your games from it with results and clock facts, the
  studies and hand-ins holding it, the repertoire's chosen move, each reference
  population in its own column, stored engine evidence and the same-pawn-structure
  work. Position-keyed, never move-sequence-keyed — transpositions meet at the
  same address and counters never split identity. Reachable from every board via a
  labelled control; one click in the common workspace frame, one hit from the
  palette. Concealed workspaces (Review before reveal, Training, blindfold)
  suppress the control so the button's presence cannot leak the existence of
  evidence. (`docs/design/position-page.md`, Phase 77)
- **The surprise finder (`/preparation`).** What this opponent might play
  that your repertoire has no answer to, and that the source you chose
  plays in under 5% of its games there. Three populations joined and none
  merged: their count with their denominator, the source's share with its
  own and its name, and your repertoire deciding what counts as
  unprepared. Nothing predicts a move. A move everybody plays is a gap,
  not a surprise, and the panel says which panel lists it. A source with
  no games at a position has said nothing, and the row says so rather than
  printing a share of zero. (`docs/design/surprise-finder.md`, Phase 76)
- **The companion is asked to stop, not only signalled.** The shell sent
  `SIGTERM` and nothing else; Windows does not deliver it, so the
  companion's own shutdown — the one that stops every engine — would never
  have run there, and engines are spawned detached precisely so that they
  outlive a parent nobody told to stop. The shell now asks over the IPC
  channel it already had and signals only if that goes unanswered. No
  change on macOS, where both paths reach the same handler. (Phase 76)
- **Dynamic ECO in the move list, and the board flipped from your
  profile.** The opening code now follows the line rather than labelling
  the whole game from its headers: a small code appears at each move where
  the named opening changes, and every move between two of them inherits
  the name above it — which is Kingfisher's classification rule, shown
  rather than restated. And a stored game now opens from your side when
  your profile's name is one of the players, not only when a linked online
  account matches: the same exact matching the games index uses (case and
  whitespace, never an initial), so an over-the-board game flips and an
  ambiguous one does not. (Phase 76)
- **Similar games (`/similar`).** The position on the board, looked for in
  your own games, in every companion collection and in every installed
  reference pack — each answering for itself, with its own count, never
  added together. Four ways to count as similar (same pawns, same
  features, same position, chosen facts), each one saying what it means.
  And where a source was never asked to index what you are asking for, it
  says so: a pack stores positions and their counts, not structures, so it
  can answer "the same position" and cannot answer "the same pawns" — a
  sentence rather than an empty list that would read as "no such games".
  (Phase 76)
- **Publish a study (`/studies` → Publish…).** One file with the boards
  drawn inside it as SVG and the figurines in Unicode: no stylesheet, no
  script, no image, no network — it opens on a machine that has never run
  Kingfisher. Choose the chapters, whether to draw a diagram at each
  position you marked critical, and a byline; then save it as HTML or
  print it, which is how it becomes a PDF (the operating system's own,
  from the same bytes). The dialog says when the chapter on the board has
  edits that are not in the file yet. (Phase 76)
- **The evidence, written into the game (_After the round_ → Engine).**
  Once the background pass has analysed a game, every move the engine
  disagreed with can be written into the tree as a variation: its own
  line, and one comment carrying the score before, the score after, the
  depth and which engine said so. No adjective, no glyph, no NAG — a NAG
  is the label in one character, and "blunder" is a verdict about the
  player rather than a fact about the position. You choose how much a
  move must cost before it is written (3, 10 or 20 points of win chance),
  the panel says what a run would write before it writes it, and one undo
  takes the whole write back. (Phase 76)
- **Tags on studies and chapters, and Search as a page (`/search`).**
  File a study under as many subjects as it belongs to — tags, not
  folders, because a study about the Najdorf, for one opponent, from one
  tournament has three answers and a folder forces two of them away. The
  Studies rail filters by tag and narrows as you add them. Search is now
  a page as well as the palette: one box that takes a FEN, a line like
  `1.e4 c5 2.Nf3`, or a name, says which way it read what you typed, and
  keeps the query in the URL so a search can be linked and reloaded. It
  searches your own work and says that reference packs and the explorer
  are not in it. Schema v20; tags travel in the backup.
  (`docs/design/organising-work.md`, Phase 76)
- **The built-in reference installs again if its first attempt fails**, and
  the explorer says where it stands instead of offering an empty source
  list. A profile whose first install of the bundled pack failed used to
  spend the rest of its session with no source at all and an error message
  nobody was looking at. (Phase 76)
- **Coverage (dock, every route with the explorer), and an explorer that
  no longer claims more than it knows.** A reference pack aggregates
  positions only to the depth its build kept — the bundled one stops at
  move 21 — and past that the explorer said "no games reach this
  position", which reads as a fact about chess and is a fact about the
  build. It now says which kind of nothing it is. _Coverage_ states, for
  every source you have and for the position on the board, what it holds
  (games, openable games, months, the source it was built from, its
  depth), what it does not, and its licence — one row per source, never
  merged. It also states plainly that Kingfisher ships no games before
  2020 and no annotated master corpus, and why
  (`docs/data/historical-games-audit.md`). (Phase 76)
- **Scoresheet (`/scoresheet`).** The over-the-board game, from the sheet
  to the board: every cell typed as it was written (German, French and
  Spanish piece letters, `0-0`, `ed`, `e8Q`, a missing `x`) resolved
  against the rules, a cell nobody can read filled from the moves after it,
  and **Check these moves** naming every doubtful move with its
  alternatives on the board. A photo can be read by the assistant endpoint
  you configured — your endpoint, your key, none ships — and everything it
  returns is checked against the rules and flagged where it was unsure.
  Saves to My games, or straight into After the round.
  (`docs/design/scoresheet.md`, Phase 76)
- **Import ChessBase (`/databases`).** The database every club player
  and coach already has — a `.cbh` and its siblings, or the `.cbv` archive
  ChessBase exports — read in the browser and stored in _My games_ or a
  new companion collection. Moves, variations, set-up positions, comments,
  symbols, coloured squares, arrows and clocks come across; every game
  keeps the database's own source and annotator as tags and a
  `ChessBaseFile` tag naming the file it came from; what the PGN cannot
  hold (medals, training questions, media, a line past a null move) is
  counted and shown, never silently dropped. The files are only read.
  Checked against a ChessBase-written archive of 8,895 games: every
  game's moves, result and date agree with the publisher's own PGN
  (`docs/data/chessbase-archive-format.md`). (Phase 76)
- **After the round (`/analysis`, `/games`, `/review` → dock).** The
  evening-of-the-game page a tournament player runs from the game on the
  board: which side you played, where the game left your repertoire and
  who left it, what the clock says (the three longest thinks, the last
  reading, the first move under a third of the control — the
  over-the-board `40/5400+30:1800+30` control is now read), the engine's
  evidence from the background queue with _Send positions to review_, and
  one thing for tomorrow, filed in the new **round journal** (Review →
  **Rounds**: one entry per game, grouped by event, opening its game;
  schema v19, in the portable backup). Facts only; nothing is graded.
  Your name is matched exactly as the games index matches it, and the
  page names the spelling to add. (Phase 75)
- **Played against you (`/repertoire`).** Every repertoire position with
  how many of _your_ games reached it, beside what share of a named pack
  did — two populations, two columns, never one number — most met first,
  or **Never reached**: none of your games and under 0.5% of the pack,
  deepest first, the drilling that goes to waste. _Review repertoire_ is
  ordered by the same counts and says so ("reached in 7 of your 40
  games"); it had accepted that ordering since it was written and nothing
  supplied it. (Phase 75)
- **Search finds studies, hand-ins and structures.** A pasted position is
  now found in study chapters — every node, variations included, the
  sideline nobody could find again — and in team hand-ins, and each hit
  opens where it was found: the chapter at the move, the assignment in
  its team, the game at the ply. A second group, **Same pawns**, lists the
  chapters, hand-ins and repertoire positions that hold the pawn skeleton
  without the position; _Known position?_ shows the same. (Phase 75)

## 1.2.6 — 2026-09-20

Kingfisher 1.2.6 brings the Team hub to the Mac application, and with it
the preparation loop a coach or a second uses every day: a searchable
inbox, suggested briefs, the latest board one click away, and note drafts
that survive a failed save. It also corrects the reset control's label.
The web has shipped each as it landed; the Mac 1.2.5 build has none of
them.

- **The reset control says where the board goes.** _Clear the move tree
  (keep this position)_ read as keeping the position on screen, which is
  exactly what it does not keep; it is now _Clear the move tree — back to the
  starting position_ in the Position menu, the Analysis menu, the command
  palette and the board control, and the toast says the same. The behaviour
  is unchanged. (Phase 74)
- **The Team hub (`/team`).** A coach and their students, or a player and
  their seconds, hand work to each other on one board: assignments with a
  brief and a due date, a thread of hand-ins, reviews and notes on each,
  the board carried as PGN and replayed through Kingfisher's rules before it
  is stored, and an evidence line per handover that says which engine
  evaluated how many positions at what depth — or that none did. The rail is
  _To do_, _Handed in_, _Accepted_; the first button is the one your role
  needs. The team travels as a packet file — no server, no account — and
  threads merge by adding, so receiving the same packet twice changes
  nothing. Research and decisions in `docs/design/team-hub.md`. A second
  pass, from using it as a coach and as a student: the action box is pinned
  under the thread; rows say what is new since you last looked; the team and
  thread you had open come back after a reload; _Open on board_ asks before
  replacing unsaved moves; _Copy PGN_ on every handover; an empty board
  says so and offers an import; _Archive_ has an _Unarchive_; a packet can
  be dropped on the route; an opponent assignment names the person and your
  colour and opens their dossier in Preparation; _Position → Hand in to the
  team…_ from any board route; and the evidence line counts moves,
  variations and comments. One defect fixed before anyone met it: the merge
  kept a stale `archived`, due date or assignee after the other side had
  cleared it. (Phase 74)
- **Team preparation workflow.** Editable brief starters for game review,
  opening work and opponent preparation; a searchable inbox with member and
  review filters, earliest due first; and a shortcut to the latest board.
  Notes stay with their assignment during thread switches and are retained
  when a write fails. Text notes no longer attach a board. Sharing guidance
  explains that filters do not restrict whole-team packet exports. (Phase 74)

## 1.2.5 — 2026-09-20

Kingfisher 1.2.5 carries three owner reports from the day 1.2.4 shipped
to the Mac application; the web has shipped each as it landed. The Mac
1.2.4 build lists engines it cannot install as switches, draws a tooltip
on the board under the best-move arrow, and offers threads, hash and the
search limit only as a preset's read-only summary.

- **Engines that do not exist for your machine are not switches.** The
  Mac application's Settings → Engines drew Berserk, Koivisto and Obsidian
  — Windows-only projects — as rows with a switch turned on, above a note
  saying they are not offered here. The note now carries them and the rows
  are the engines the machine can install or has installed. (Phase 73)
- **No text on the board when the pointer crosses an engine arrow.** The
  hover tooltip 1.1.x added to the best-move arrow is gone; the move, score
  and depth are in the engine panel and the legend. (Phase 73)
- **More to set under Settings → Engine → Analysis settings.** Threads
  and hash are chosen directly (they were read-only, "set by the preset");
  the search limit is a control — until stopped, a depth, a time or a node
  count; the line length (6–24 moves); whether a running engine follows the
  board; and variation arrows — the first move of every line, fainter by
  rank, or the best move only. Every one is searchable, persists, and has
  a browser test that looks at its effect. (Phase 73)

## 1.2.4 — 2026-09-20

Kingfisher 1.2.4 carries the whole-codebase audit after 1.2.3 and the
five improvements built on it to the Mac application; the web has
shipped each as it landed. The Mac 1.2.3 build gives a position pasted
from a FEN a different identity from the same position reached by
playing, and can run one engine under another's name when they are
switched mid-start.

- **A pasted position is the same position as a played one.** A FEN from
  another program records an en passant square after every double push;
  Kingfisher records one only when the capture is possible. The two
  spellings used to give one position two identities, so a game imported
  with a `[FEN]` tag, a position from Set up or an `?fen=` link could sit
  beside its own transpositions in the explorer, the repertoire and the
  "in your work" counts without being counted with them. Every position
  now enters through one canonical form. (Phase 73)
- **A FEN describing nine squares on a rank is refused** instead of being
  accepted with the ninth silently dropped. (Phase 73)
- **Arrows and highlights on the starting position survive a PGN export.**
  They were read on import and lost on the way out. (Phase 73)
- **Switching engines while one is still starting no longer runs the
  first one under the second one's name.** Lc0 takes seconds to load its
  weights; choosing Stockfish in that window used to install Lc0's session
  under the Stockfish label. (Phase 73)
- **The Lichess "Min Elo" filter asks for the band you typed.** 2200 used
  to request the 2000+ band as well, so the column was labelled 2200+ and
  counted games from 2000. (Phase 73)
- **"Also reached by … move orders" lists routes, not continuations.**
  The list included the move played _from_ the position, so after 1.e4 it
  offered "e4 e5" as a route to the position after 1.e4. (Phase 73)
- **Feedback with a non-Latin first line is delivered.** A message opening
  with a piece glyph, an emoji or a Turkish ş failed the ntfy delivery as
  "the sink rejected it". (Phase 73)
- **Engines are sent only the options they declared.** Lc0 has no `Hash`;
  it was sent one anyway. (Phase 73)
- **"1 move", "1 game", "1 reply"** — counts of one read as one throughout
  Studies, Openings, the explorer, the repertoire and Databases. (Phase 73)
- **Route titles stay readable on a 1280–1440 px display.** The Repertoire
  header read "Rep…" and the Training header lost its name entirely once
  the sidebar was open; the two secondary repertoire verbs now drop their
  noun below 1536 px and the Training queue counts, which the rail also
  shows, appear in the header only from 1536 px. The "My games" facts on
  Databases no longer truncate "not tracked" to a syllable. (Phase 73)
- **Route actions fold to fit.** Every workspace header now keeps its
  title readable: a route's buttons shorten their labels first and then
  fold, from the least important, into a "⋯" menu — one rule in the frame,
  in place of the per-route label tricks. (Phase 73)
- **Copy PGN from this move.** In the Export menu, a move's right-click
  menu and the command palette: the game from the current move on, as its
  own PGN with a `[FEN]` tag, every variation and comment below it kept.
  (Phase 73)
- **Score by depth.** The engine panel's footer draws the top line's score
  at every depth of the running search, with a hollow point where the top
  move changed, and the readings in its tooltip. (Phase 73)
- **"Known position?" in Set up.** While you place pieces the dialog says
  where that exact position already is — your games, chapters, repertoire,
  training — and how many games the chosen reference source has for it.
  (Phase 73)
- **Train these gaps.** The repertoire's coverage panel now offers the
  built-in Starter pack as a source, and one click enrols every gap as a
  card in a set named for the repertoire and opens it in Training; a
  position with several undecided replies is one card that names them
  all, and a Black repertoire's cards are Black to move (they were written
  as White's). (Phase 73)
- **A tab left open across an update says what to do.** When another tab
  upgraded the local database, this one used to fail every save with the
  browser's "connection is closing"; it now says Kingfisher was updated in
  another tab and asks for a reload. (Phase 73)

## 1.2.3 — 2026-09-20

Kingfisher 1.2.3 carries the three fixes below to the Mac application;
the web has shipped each one as it landed. The Mac 1.2.2 build clipped
the dock's More menu to one item, so a folded tool could only be reached
by pinning everything before it.

- **The More menu shows every tool again.** The one-row tool strip
  (1.2.2) clipped its own More menu to a single item, so the last tools
  could only be reached by pinning everything before them. (Phase 72)
- **Engine notes say what is true for your machine.** On a Mac the
  public site used to say "Windows only" for the Windows-only engines
  and, from a Windows or Linux browser, "Mac app only" for every native
  engine — neither a path anyone on the web can take. Now: from a Mac,
  "Mac app only" for the engines the Mac application runs; from Windows
  or Linux, "not available in the browser"; in the Mac application and a
  checkout, "needs the companion" or "Windows only" as before. The
  Engines list and the Companion panel say the same. (Phase 72)
- **Skip the landing page, from Settings.** _Settings → Workspace_ has
  the "open the Studio straight away" choice the landing offers, so it
  can be turned on or off from inside the Studio on any device, not only
  at `/?stay`. (Phase 72)

## 1.2.2 — 2026-09-20

Kingfisher 1.2.2 carries every change below to the Mac application; the
web at `kingfisherchess.app` has shipped each one as it landed. The Mac
1.2.1 build still opened on the last position rather than a chessboard,
dipped the evaluation bar between moves, answered checkmate with an even
split, and flipped the board with a rotation that squeezed the pieces
to the centre.

- **Opening Kingfisher opens a chessboard.** The last position you were
  working on was put back on the board at every start — so opening the
  application showed yesterday's half-played line, and the Mac
  application never opened on the initial position. A fresh launch (a
  new tab, a new window, reopening the Mac app) now starts from the
  initial position; your work is still saved and is one click away as
  _Continue …_ on Recent. A reload, a route change, or anything you play
  in this session still comes back by itself, which is what the draft is
  for. (Phase 72)
- **The evaluation bar shows the result of a finished game.** A
  checkmated position filled the winner's band completely and reads
  `1-0` or `0-1`; stalemate and the rule draws sit at the middle as
  `½-½`. Before, the bar answered checkmate with an even split and "no
  evaluation", and the engine panel offered a button that could only
  produce more silence; it now says "Checkmate — White wins" and that
  there is nothing to search. (Phase 72)
- **No dip between moves.** With the engine running, every move used to
  drop the bar to the middle for about a tenth of a second and flash the
  engine panel's "No analysis yet" button while the new search warmed
  up. The bar now keeps the previous reading, dimmed and titled as the
  previous position's, until the new search is deep enough to show; the
  panel says "Analysing…" instead of offering to start. (Phase 72)
- **The board flips without collapsing.** The flip was a 3-D rotation
  that squeezed every piece toward the centre line and back; it is now a
  snap with a short fade, the way published boards do it. (Phase 72)
- **One row of tool tabs.** The dock's tabs fit the width they have —
  dropping their icons first, then folding what still does not fit under
  _More_ — so "More" no longer sits alone on a second line with a blank
  band beside it. On a phone the Move Tree outranks the pinned tools.
  (Phase 72)
- **The full-network Stockfish is fetched from its recorded address.**
  The 113 MB network was copied into every web deployment; it is now
  fetched by the browser from the same package the installer uses, held
  to a recorded SHA-256, and the deployment carries 36 KB of worker
  script instead. Nothing changes for the person choosing it, except
  that a wrong file is refused at once rather than after a five-minute
  timeout. (Phase 72)
- **The Companion panel tells the truth about where you are.** On
  `kingfisherchess.app` it says native engines are the Mac application's
  and why; in the Mac application it says the companion is built in; on
  a checkout it gives the terminal steps. The engine selector says "Mac
  app only" on the web instead of "needs the companion". (Phase 72)
- **The landing skips itself before it paints** for a browser whose
  owner asked it to, instead of after the page has loaded. (Phase 72)
- **The command palette knows every page and every settings section**,
  plus _Back up my work_ and _Open the tour_; "review" and "companion"
  find what they name. (Phase 72)
- **The tour draws each section with the sidebar's own icon.** Five
  steps had icons the sidebar uses for other sections. (Phase 72)
- **A synced game says whose it was.** "You played White" / "You played
  Black" in the title strip for games from your linked accounts, at
  every width, for stored games too. (Phase 72)
- **Account sync reports progress and can be cancelled.** "Downloading
  games…", "Importing 120 of 3,400 games…", and a Cancel button that
  keeps what has already landed. (Phase 72)
- **The Databases page says what each source is.** Each data source
  shows its own one-line description, so the three Lichess sources
  (Masters, Rated Games, by player) read as three populations rather
  than one source listed three times. (Phase 72)
- **Sparkle's update window gets a summary, not the changelog.** From
  the next release, the notes beside "Install Update" are the entry's
  opening paragraph and one line per change, with a link to the full
  changelog. (Phase 72; affects releases after 1.2.1)

## 1.2.1 — 2026-09-19

Kingfisher 1.2.1 carries every change below to the Mac application; the
web at `kingfisherchess.app` has shipped each one as it landed. The
Mac 1.2.0 build still drew the previous Training icon and lacked the
Phase 70 auto-backup fix.

- **The Training icon is a knight you can recognise.** The sidebar,
  the Recent page, the tour and the workspace tool strip all draw
  Training from one icon, and that icon was a column with a curve on
  it that read as a desk lamp or a snail at the size the sidebar uses.
  It is now a knight silhouette — muzzle, ear, neck — on the same
  plinth as the Endgame king, drawn at the same stroke as every other
  section icon, and checked at 16, 21, 24 and 32 px in both themes.
  (Phase 71; the Mac application picks this up at its next release.)
- **The Studio is one step away for a returning player.** A browser
  that has opened the Studio before sees _Continue in Studio →_ under
  the landing's headline, and can choose to open the Studio straight
  away on future visits (`/?stay` shows the landing again and undoes
  the choice). `kingfisherchess.app/studio` is a permanent alias for
  the Studio. First-time visitors see the landing exactly as before.
  See `docs/product/studio-access.md`. (Phase 71)
- **The landing's screenshots are the current application.** The hero,
  the Research image and the Engines image were captures from before
  1.2.0 — the removed toolbar, the wooden board, the old Training
  icon, and a "Research" picture that was actually the Theory Book.
  All three, and the social-sharing card, are now made from the
  running application by one script (`scripts/landing-captures.mjs`)
  and weigh half what the old set did. (Phase 71)
- **The landing's header is centred and folds on narrow screens.**
  The section links sat 26 px right of the page's centre at every
  desktop width; they are now centred on the page, and below 900 px
  they fold into a menu that works without JavaScript. The page also
  gains its two signature details — the mark's board tile before each
  section label and the Studio's amber rail on each principle — and
  the Studio's own dark surface as its ink. (Phase 71)
- **The privacy page and the claims register name the landing's two
  keys.** The landing began reading `kingfisher.studio.visited` and
  `kingfisher.landing.auto-open-studio` to offer _Continue in Studio_,
  but the privacy page still described browser storage as the
  application's alone, and `docs/product/public-claims.md` had no row
  for the new `/studio` address or for what is remembered. Both now say
  exactly what is stored, by whom and when — a first visit to the
  landing writes neither key. (Phase 71)
- **A complete favicon set.** The site now serves a 96 px PNG icon
  alongside the .ico and SVG (the size search engines make result
  icons from), and the Apple touch icon no longer has transparent
  corners that iOS painted black. Search engines refresh cached icons
  on their own schedule. (Phase 71)
- **The tour opens again — from Settings, and only from there.** Phase
  61 stopped the sidebar tour opening on launch and unmounted it; Phase
  62 added _Open the tour guide of the website_ to Settings → Help,
  which set a flag nothing rendered. The dialog is mounted again and
  that link opens it, with ←/→ and Esc as before. The _Don't show on
  launch_ checkbox is gone with the preference behind it, which had
  meant nothing since Phase 61; an older profile drops the key on its
  next load. (Phase 71)
- **The backup reminder honours your schedule.** The status bar's
  backup indicator turned amber after seven days whatever
  _Auto-backup schedule_ said; it now turns at the number of days you
  set, which the auto-backup cycle was already using. (Phase 71)

- **Auto-backup now records which reference packs were installed.**
  Scheduled backups (on launch and on the cycle) and the manual
  "Back up now" button in Settings → Database previously wrote a
  workspace backup with `referenceSources: []`, even when reference
  packs were installed. A restore therefore had no way to tell the
  user which packs had been answering every database question, and
  the "Missing sources" notice after restore could never appear.
  The manual export download already captured this; the three other
  backup paths now do too.

## 1.2.0 — 2026-09-17

Phase 67 — the toolbar is gone and the Training icon is recognisable.

- **Toolbar is gone.** The Analyse button used to sit in a thin
  toolbar row above the board, eating 28 px of vertical space and
  creating a chain of layout regressions across Phase 62 / 63 /
  65 / 66 (see `docs/product/postmortem-board-tiny.md` for the
  full story). The toolbar is removed; the engine panel's own
  Analyse button is the single source of truth for starting an
  analysis. The board now fills its grid.
- **Board grid has no third row.** The grid is `eval-bar | board`,
  full stop. The grid's height equals the board's width; the eval
  bar's column is the same height. The layout math lives in
  `board-grid.ts` and is pinned by 13 unit tests in
  `board-grid.test.ts`, plus four icon tests in
  `icons.test.tsx`. A future change that re-adds a row above the
  board fails those tests before it ships.
- **Training icon redrawn.** The Phase 62 Recall icon was a
  17-point polygon that did not read as a chess knight at any
  size the sidebar uses. Phase 67 redraws it as the knight every
  chess set draws: a base, a chest that curves into a neck, a
  forehead that slopes up to an ear, and a muzzle that points
  right and ends under a clear eye. The icon test asserts the
  path contains the muzzle-and-ear curves, so a future "let me
  simplify this back to a rectangle" loses the test first.

Phase 66 — board still tiny after Phase 65.

- **Board now has a definite grid height.** Phase 65 moved the board
  into the `1fr` column, which fixed the column assignment but not the
  row: the grid lived inside a flex parent with `items-start`, so the
  grid sized to its content (the toolbar row) and the `1fr` row had 0
  leftover space. `aspect-square` on the board frame then drew a
  24×24 board. The grid now gets an explicit `height: frameSize + 28`,
  the toolbar row is fixed at 28 px (`min-h-7`), and `grid-rows: 28px
1fr` resolves to a 28-px toolbar over a `frameSize`-tall board row.
  The toolbar's height is now a constant (`TOOLBAR_HEIGHT = 28`) so
  the grid template, the explicit height and the toolbar's `min-h-7`
  cannot drift apart.
- **Explicit grid placement.** The toolbar and the board frame now
  declare `grid-row` and `grid-column` inline. The toolbar is row 1
  and spans both columns when the eval bar is on; the board is row 2
  and col 2 (col 1 when there is no eval bar). `grid-auto-flow` no
  longer decides where the children sit, so future reorders of the
  JSX cannot regress the layout.
- **Resize observer subtracts the toolbar.** `clientHeight` measures
  the whole container, but only `clientHeight − 28` belongs to the
  board row. The ceiling on `frameSize` is now
  `min(boardCap, clientWidth − barSpace, clientHeight − 28)` so the
  grid never overflows the column.

Phase 65 — two layout regressions from Phase 62 / Phase 63.

- **Board sits in the 24-px eval-bar column when the eval bar is on.**
  Phase 62 added a toolbar row above the board and Phase 63's hotfix
  switched the grid to `grid-rows-[auto_1fr]`. With the eval bar
  visible, the auto-placed flow sat the eval bar in row 1 col 1, the
  toolbar in row 1 col 2, and the board in row 2 col 1 — the 24-px
  eval-bar column. `aspect-square` then drew a 24×24 board. The toolbar
  now spans both columns (`grid-column: 1 / -1`), the eval bar lands
  in col 1 of row 2, and the board — the `1fr` cell — sits beside it
  at the size the route had been giving it all along. The fix is a
  no-op when there is no eval bar (one column to span).
- **Inline rename input overflowed the header.** Phase 63's rename
  control put `flex-1` directly on the `<input>`, which made the input
  grow past the wrapper in a flex row, pushing the save indicator and
  the Save-to-study button off the right edge and clipping the left
  border. The input now sits inside a `block min-w-0 max-w-full`
  wrapper, which is the same width the title span had — the rename
  box is the same size as the title it replaced.

Phase 64 — one Mac-desktop fix.

- **Sidebar logo has the design inset in full screen.**

Phase 63 — eight fixes. Shared source; available on the web, pending a Mac release.

- **Backup export downloads reliably.** The previous anchor was
  built in memory, clicked, and had its URL revoked on the next line —
  Firefox refused to follow a click on a detached anchor and Safari
  released the blob before the click dispatched. The anchor is now
  attached to the document before `.click()`, the URL revoke is queued
  in a microtask that always runs after the click, and the success
  toast now reports the file size in KB.
- **Diagnostics "Test result:" header.** Each database row in the
  Settings diagnostics now carries a status badge (Idle / Testing… /
  Healthy / Sign in / Error / Unreachable / etc.) so a click on Test
  is visible even when the message below stays "Not tested yet".
- **Companion setup overhaul.** The prose in Settings → Companion
  now spells out that Stockfish 18 already runs without setup, names
  the engines the companion adds (Lc0, Stormphrax, Viridithas,
  Halogen, PlentyChess, Stockfish 19 + local Syzygy), and links to
  the install guide. The empty state in the Engines panel mirrors the
  same list. The 4-step "How to start" panel is open by default.
- **Palette preview shows the difference.** Settings → Appearance
  now draws the four brushes as large chips with their hex underneath
  and a one-decimal explainer; the eval bar is intentionally absent
  (its white/black halves are structural, not chromatic, so it does
  not need a colourblind variant).
- **Linked game knows whose side you're on.** Opening a Lichess or
  Chess.com game now compares the PGN `White` / `Black` headers
  against the user's linked accounts. If one matches, the board
  opens on that side and the workspace title strip shows
  "Playing as White" / "Playing as Black". Master and replay games
  (no match) keep the default orientation.
- **Inline rename for untitled analyses.** Clicking the title in the
  workspace header turns it into an input (Enter to commit, Escape
  to cancel, click-out to commit). Database and reference games
  pull their title from PGN headers and study chapters from stored
  metadata; renaming those still happens through the source's own
  rename dialog, which is the path that propagates the change.

Phase 63 hotfix — board collapsed to a 0×0 strip because the new
toolbar row gave the board's `aspect-square` a 0×0 parent. The board
grid now uses `grid-rows-[auto_1fr]` so the toolbar row sizes to its
content and the board fills the remainder; no layout regression on
the previous chrome.

Phase 62 — twelve fixes across the workspace. Same source, web and
Mac pick everything up at the same time.

- **Tour still openable from Settings.** The first-run tour is no
  longer shown on launch; a new "Open the tour guide of the website"
  link in Settings → Help opens it on demand.
- **Tour first-step icon matches its label.** The tour used to open
  with the Analysis (Board) icon next to the "Recent" step. The
  Recent step now shows the Clock icon (the same one the sidebar
  uses for Recent), and the detail text describes what Recent does.
- **"Analyse" button no longer covers pieces.** The yellow Analyse
  button used to sit `absolute bottom-3 right-3` over the rook on
  h1. It now lives in a thin toolbar row above the board frame, so
  it never overlaps a square.
- **Openings and Training icons redrawn.** The pawn lost its
  disconnected two-tier foot and now reads as a single silhouette;
  the knight lost its abstract L-shape and now reads as a horse
  head (muzzle, ear, eye, base) at the 21 px sidebar size while
  keeping the asymmetric head-on-column cue at 16 px.
- **Kingfisher mark + wordmark are navigation.** Clicking the mark
  or the wordmark in the sidebar header returns to the Analysis
  page; the parent header is still the macOS window-drag area, but
  the link itself fires on click.
- **Right-side dock spacing.** The tab strip used `ml-auto` to
  push the "More" button to the far right of the row, leaving a
  wide blank band between the last shown tab and More. The margin
  is now small; More sits next to the tabs with the divider.
- **Evaluation graph toggle is visible.** The toggle now shows an
  empty strip ("evaluation graph is on, draw a column for every
  move the engine has scored") when the toggle is on but no
  moves have been evaluated yet, instead of rendering nothing.
- **NAG symbol tooltips in the move list.** Hovering `!!`, `?`,
  `±`, `∞` or any other NAG glyph in the move list now shows the
  chess.com-style label.
- **Planning idea documented.** A new `docs/product/planner.md`
  records the concept of a tournament-and-study schedule workspace.

Phase 61 — the "What should we call you?" prompt and the first-run
tour are gone. The sidebar no longer asks for a display name and no
longer says "Welcome back, …"; the app opens straight into the
workspace. The "Replay the first-run tour" link in Settings has
been removed with them. Existing `displayName` values are kept in
storage (Settings → Profile still edits them) but the prompt that
created them is not shown. The `tourShowOnLaunch` preference is
kept for storage compatibility and has no effect. Same source, web
and Mac pick everything up at the same time.

Browser verification follow-up:

- Tour dismissal now survives reload; launch reads hydrated preferences.
- Linked accounts accept mixed-case Lichess and Chess.com usernames.
- Scheduled backups store portable preferences, excluding credentials, instead
  of attempting to clone the database connection.
- The AI assistant opens without requiring the separate native companion
  service; the configured assistant endpoint is sufficient.
- The engine toolbar wraps its controls instead of collapsing the engine
  selector while analysis is running in a narrow panel.
- Install troubleshooting now agrees with the notarised first-launch guide.
- The shared-source changes below reach the Mac application only in a new
  packaged release; the published 1.1.9 does not update with the website.

Phase 60 — two follow-ups from the bug-hunt pass. Shared source; available on the web, pending a Mac release.

- **"Back up now" is decoupled from the auto-backup toggle.** A
  one-off backup writes regardless of whether the schedule is on.
  When the schedule is off, the success toast reminds the user that
  the next one is not automatic.
- **Companion "Ask" cannot double-fire.** A fast Enter + click (or
  two Enters in the same frame) used to start two assistant calls
  before `isPending` could flip. A ref-based latch closes the gap;
  the latch releases on success or error so a follow-up question
  still works.

Phase 59 — six fixes, the eval bar's one-decimal format lands
everywhere it should have. Shared source; available on the web, pending a Mac release.

- **Engine panel footer reads `+0.3`, not `+0.34`.** The
  score-swing figure and the MultiPV gap in the engine panel footer
  used to keep the old two-decimal format. They are one decimal now,
  in line with the eval bar and the pinned-line labels.
- **Engine compare prose is one decimal.** "Both prefer the same
  move, 0.34 apart" is now "0.3 apart".
- **Calibration in the decision journal is one decimal.** The
  "your estimates sat X pawns above/below the evidence" line.
- **Storage section honours TanStack Query v5.** The collection
  description's loading branch now reads `schema.isPending` instead
  of the deprecated `schema.isLoading`.
- **Endgame library's empty state opens Settings.** "Install from
  Settings → Companion" used to be plain text; it is now a button
  that opens Settings → Companion so the user lands on the Tablebases
  pane without searching for it.

Phase 58 — bug-hunt pass, twelve fixes, the eval bar now reads the
way lichess reads it. Shared source; available on the web, pending a Mac release.

- **Status bar backup indicator opens Database, not Appearance.**
  Clicking the pill now lands on the section it has been promising to
  land on since Phase 57.
- **"Back up now" lives in Settings → Database.** The status-bar tooltip
  has been promising the action since Phase 57; the button is here.
  Phase 60 subsequently removed the requirement to enable auto-backup.
- **First-run tour shows the same Training icon as the sidebar.**
  New users see the Phase 57 L-shape silhouette in the tour and the
  same L-shape in the navigation.
- **First-run tour removes a redundant subtitle.** The tour's
  step header used to render the section label twice; the second
  copy is gone.
- **First-run tour's Esc handler actually closes.** Esc dismisses
  and marks the tour as seen, whether the dialog or the keyboard
  listener fires first.
- **Evaluation bar reads `+0.3`, not `+0.34`.** Lichess's standard;
  the eval graph and pinned-line labels move with it.
- **Engine panel and Notes panel have keyboard shortcuts.**
  `Shift+E` opens the engine panel (without conflicting with `E`,
  the engine start/stop binding); `N` opens notes. Both bindings
  are listed in the Shortcuts dialog.
- **Lichess and Chess.com usernames are validated as you type.**
  Letters, digits, hyphens and underscores; the Link
  button stays disabled and a one-line hint appears until the
  input matches.
- **Chessboard comment cleaned up.** A reference to a "double-tap
  reset" that was never implemented is gone.

Phase 57 — eleven enhancements, a defensive bug-hunt pass, and a
hooks-rules fix that the lint caught on the very last re-run. Shared
source; available on the web, pending a Mac release.

- **A Training icon that survives the 16 px collapsed rail.** The
  Phase 56 knight's mane, snout and eye all collapsed into the same
  generic piece silhouette as the king and the pawn at sidebar size.
  The new silhouette is an L-shape — head, snout, neck — that no other
  piece on the sidebar uses, so the asymmetry carries the meaning.
- **Auto-backup is now user-controllable from Settings → Data.** Three
  rows: turn the cycle on or off, set the schedule (1, 3, 7, 14, or 30
  days), and choose how many snapshots to keep (1, 3, 5, or 10).
- **Engine affordance stop button is 44 px on touch devices.** Desktop
  keeps the 28 px button; phones and tablets get the Apple-HIG-sized
  tap target without changing the desktop layout.
- **Engine pill carries the engine name.** A user with Stockfish and
  LC0 side by side now sees "Stockfish · depth 18" and "LC0 · depth 12"
  rather than two indistinguishable "Engine · depth N" pills.
- **Status bar's backup indicator has a positive accent for "today".**
  Green when the backup is fresh, grey for recent non-today, yellow
  for overdue, red when there has never been one.
- **Move-list active row gets an inset ring on touch.** The current
  node stays visible under the finger on phones and tablets, even when
  the surface colour matches.
- **Position-search empty state names what was searched.** Pasting a
  FEN and getting no hits now reads "This position is not in your
  games, studies, repertoire, training or endgames yet." instead of
  the generic "No matching command or item."
- **Settings dialog filters the section rail by query.** A search input
  above the left rail narrows the list by section label, keywords and
  description; clearing the input restores the full list.
- **Pinch-zoom persists across sessions.** The board's last zoom is
  keyed by FEN in localStorage and read back on mount, so the same
  study remembers its scale. One write per gesture, not per frame.
- **Privacy page reads as a current rule.** "There is no cloud sync
  today" replaces the previous "Cross-device Sync is not currently
  available", which read as a sentence about a future feature rather
  than about the application as it ships.
- **First-run tour has keyboard navigation.** Left/Right arrows step
  through the screens, Esc closes and marks the tour as seen, the
  shortcut hint sits in the dialog's title row.

Bug-hunt pass — four real defects caught while re-running the gates:

- `useAutoBackup` and the chessboard's pinch-zoom persistence now
  wrap their localStorage reads and writes in try/catch so private
  mode or quota-exceeded do not break the cycle, the gesture, or
  the tour.
- Settings dialog's section filter now jumps the right panel to the
  first visible section when the current section is filtered out,
  so the rail and the panel never disagree.
- The first-run tour's keyboard handler now lives above the early
  return, so the React rules-of-hooks lint is happy across the
  open → closed → open transition.

Phase 56 — eleven enhancements and a fixed Training icon. Same source,
web and Mac pick everything up at the same time.

- **A clearer Training icon.** The Phase 55 knight blurred into a blob
  at sidebar size; the Phase 56 replacement is a flat geometric
  profile — an ear, a mane line, a snout, an eye, a body, a base.
- **Privacy page is now accurate.** Describes, feature by feature,
  exactly what goes to Lichess and Chess.com, and names the local
  profile for what it is — one row in IndexedDB, no cloud.
- **Engine start is on the board.** A small "Analyse" button in the
  bottom-right of the board becomes "Engine · depth N" with a stop
  control when running.
- **Auto-backup runs on a schedule.** A new `backups` IndexedDB store
  holds the last few snapshots; the status bar shows when the last one
  ran; Settings → Data still exports any backup by hand.
- **Move list rows are finger-tap-sized on touch devices.** 44 px hit
  zone on phones and tablets; 34 px on desktop.
- **"Pin best" button** in the Engine panel header pins the top line
  in one click.
- **Endgame empty state** explains what the tablebase panel does and
  how to install Syzygy.
- **Content search indexes chapter comments**, not only chapter
  titles.
- **"Find this position in my work"** in the move context menu — opens
  the command palette with the FEN prefilled.
- **Pinch-to-zoom** on the board between 1.0× and 2.5×.
- **First-run tour** is opt-out, not opt-in. "Don't show on launch"
  hides it; "Replay the first-run tour" in Settings → Help and
  feedback brings it back.

Phase 55 — eleven items from the owner's report land together. None of
these require a new Mac release; the web and the Mac share the same
source and pick the changes up at the same time.

- **A local profile with a name the user picks.** A new "Your name"
  field on the existing profile record. The first time the workspace
  opens, the sidebar shows a one-line "What should we call you?" prompt;
  once a name is set, a small "Welcome back, {name}" greeting sits at
  the bottom of the navigation. The profile lives in IndexedDB on the
  web and in the desktop user-data directory on macOS; nothing is sent
  to a server because there is no server. Cloud sync is deliberately
  out of scope.
- **Evaluation bar slimmed.** Width 32 px → 24 px (lichess-like),
  softer border, lighter label. The number it shows is Stockfish 18 at
  the default depth of 20; the depth is in the title so the user can
  see what produced it.
- **Rigid board flip.** A flip used to slide every piece across the
  board on its way to its mirror. It is now one rigid `rotateY(180deg)`
  on the board layer, with pieces snapping to their mirror squares; the
  rotation drives the whole motion.
- **Training's icon is a knight** (the piece puzzles are made of),
  where it used to be a spaced-repetition card stack that read as a
  notebook. The Openings pawn's foot is also slimmer — it had been a
  14-wide mushroom under a 10-wide body.
- **Companion setup, in plain English for web users.** A four-step
  collapsible guide now sits next to the `npm run companion` command on
  the Companion settings page. The desktop shell already starts the
  companion for its users, so the guide is web-only.
- **The assistant tab is no longer buried.** It moved from the
  second-to-last slot on the Analysis tool list to the second, beside
  Engine and Explorer. Settings → Assistant still carries the model,
  endpoint and key.
- **Lichess and Chess.com account linking** already worked with a
  username and no sign-in; this phase re-verified the path against the
  live public Lichess service and the in-house sync tests.
- **macOS full-screen brand has breathing room.** The sidebar brand
  used to flush to the corner in full screen; it now has 8 px of
  padding there. Windowed behaviour is unchanged.

## 1.1.9 — 2026-09-15

One defect in the Mac application, found by the release gates for 1.1.8
within the hour, and one release.

- **A launch that names its own profile leaves the update's relaunch
  alone.** After an update is installed, Kingfisher hands the profile it
  was running on to the instance that relaunches, through one small file.
  A Kingfisher started with an explicit `--user-data-dir` in the five
  minutes after an install took that file, opened the updated instance's
  profile instead of its own, and the real relaunch — which arrives with
  no arguments — found nothing and opened the default profile. Only a
  launch that names a profile could do this; a double-click never does.
  It now leaves the file for the relaunch.
- **`release:mac:publish` refuses a stale transition feed.** The feed the
  installed 1.1.0–1.1.7 read is regenerated for every release and checked
  against the release's own archive before anything is uploaded.

Everything in 1.1.8 — Sparkle, its window, the signed feed — is
unchanged.

## 1.1.8 — 2026-09-15

One change, underneath: the Mac application's update engine is now
**Sparkle** ([sparkle-project.org](https://sparkle-project.org/)), the
update framework Mac applications use, replacing the `electron-updater` /
Squirrel.Mac pipeline that shipped in 1.1.0–1.1.7.

- **What you see is Sparkle's own update window.** _Kingfisher → Check
  for Updates…_ asks the release feed and, when a newer version exists,
  Sparkle shows it with its release notes: **Install Update** downloads
  and verifies it, **Install and Relaunch** replaces the application and
  reopens it with your work where you left it. **Skip This Version** is
  honoured. Nothing is downloaded until you click.
- **No password or Touch ID prompt.** Sparkle replaces the bundle with
  your own permissions; the "Kingfisher is trying to add a new helper
  tool" prompt belonged to the previous engine.
- **Every update is signed.** The archive carries an EdDSA signature that
  the application checks against the key baked into it before anything
  is installed, and Sparkle also refuses a bundle whose code signature
  does not match the running one. Your work is confirmed saved before
  the application is replaced, as before.
- **The one quiet look at launch** (since 1.1.2) stays: five seconds after
  Kingfisher opens it asks the feed once, shows nothing and downloads
  nothing, and relabels the menu item when a newer version exists.
- **Updating from 1.1.7 or earlier works as before.** Those versions ask
  the previous engine's feed, which every release still carries; their
  last update through it may show the helper-tool prompt once, and the
  version it installs never will again.

## 1.1.7 — 2026-09-14

One defect, found by the owner within minutes of 1.1.6, and one release.

- **Mac: an update's relaunch reopens the profile that installed it.** The
  update engine relaunches Kingfisher with no arguments, so a Kingfisher
  running on a non-default profile came back on the default one — the
  owner's own work. The update harness had done exactly that in three
  phases: a freshly built 1.1.5, then a 1.1.6, each opened the owner's real
  profile for eight seconds and recorded itself there, and the owner's
  installed 1.1.4 greeted them with "Kingfisher was updated to 1.1.4.
  Previously 1.1.6." before they had updated anything. The shell now hands
  its profile to the relaunch through the updater's own cache directory
  (never through a profile), the relaunch adopts it, and the harness
  asserts that the owner's default profile was not opened — the check that
  was missing.
- **Going backwards is never called an update.** A launch of an older
  version on a profile is recorded without a notice; the next real update
  is still announced from the version that actually ran last.

## 1.1.6 — 2026-09-14

From the owner's Phase 53 round of fourteen items, in two passes: the
first landed eleven, the second — a control pass over the first —
finished the rest, corrected three of the first pass's answers, and
found two defects on the way.

- **The web has the full-strength Stockfish.** A browser cannot run a
  native engine, so a person at kingfisherchess.app had one engine and
  it was the 7 MB lite build with the small evaluation network — weaker
  than the Stockfish a Mac user runs natively. A second browser row,
  **Stockfish 18 (full network)**, carries the full-size network the
  native binary uses: 113 MB, fetched the first time it is chosen and
  kept by the browser afterwards, no companion. Web only — the Mac
  application has native Stockfish 19 and leaves it out. Measured
  with a real search: depth 21 in 4.4 s at 767 k nodes/s.
- **The Starter Reference is a third larger.** Version 4 of the
  bundled pack covers four years of broadcasts (2022-09 → 2026-08)
  instead of three and keeps up to 300 scores a player instead of 200:
  206,451 games (from 177,511), 300,413 positions (from 253,687),
  38,749 openable scores (from 27,521), 13,738 players (from 12,685),
  at 24.3 MB (from 18.5). Carlsen's page holds 300 scores from 706
  games. Twelve more archives cost 73 MB in the download cache.
- **The command palette answers what you typed.** "opencarlsen" used to
  match _Run two engines on this position_ because any scattered
  subsequence counted; now a word has to appear whole, or nearly so
  (one dropped letter in two, so "anlysis" still finds _New analysis_),
  in the title or its keywords. Results are gathered by section —
  Players, then Games, then Openings, each in rank order — so the
  divider appears once per section instead of on every other row.
- **Data sources are never cut off.** In the Databases rail the three
  Lichess sources read "Lichess M…", "Lichess R…", "Lichess b…" because
  the state label sat beside the name. The state now sits under it and
  the name gets the whole line; the companion's storage line says
  "1.2 GB" rather than a raw byte count.
- **The header fits an iPad.** The first pass gave Position and Set up
  their labels from 430 px and left the toolbar's three labels where
  they were; on an iPad the row was 835 px in a 796 px header and a
  long document title was painted under "Position". New, Import and
  Export keep their labels from 1080 px, the title is clipped in its own
  box rather than over the controls, and a test now measures the whole
  row at three sizes.
- **Dragging the window costs the board nothing.** The first pass
  granted the drag with a 40 px empty strip above every workspace. The
  route headers — the toolbar row every page already has — are the
  drag region instead, with every control in them opting out, so the
  whole top edge of the window moves it the way a native toolbar does.

- **The brand sits in the corner in full screen.** The 14 px design
  inset that survived Phase 48 collapsed the brand 14 px from an edge
  with nothing on it. The Mac shell's `--sidebar-brand-left-padding`
  variable now reads `--titlebar-safe-w` normally and falls to 0 for
  the duration of full screen, so the brand flushes left when the
  traffic lights are gone and moves back when they return.
- **iPad screens see Position and Set up.** The labels were gated above
  1500 px, which left every iPad and most laptops with icon-only
  buttons. Both now appear at 430 px (`xs`) and Search commands at 900 px
  (`mid`) so the toolbar fits at every size the workspaces ship at.
- **Three workspace icons redrawn.** Opening is a pawn, Endgame is a
  king with the cross, Training is two stacked cards with a refresh
  loop — every one a chess piece or a metaphor for one, and every one
  distinct from its neighbours in the sidebar.
- **The Databases page is less crowded.** The right rail's storage
  summary collapsed per-collection listings into a single line, and the
  Lichess catalogue source was renamed from the bare "Lichess" to
  "Lichess Rated Games" so the two Lichess sources read as
  complementary ("Lichess Masters" for curated theory, "Lichess Rated
  Games" for popularity statistics), not as duplicates.
- **The native Stockfish is named correctly.** The download catalogue
  has been pointing at `sf_19` for two phases; the registry's display
  name still said "Stockfish 18 (native)". Renamed to "Stockfish 19
  (native)" and updated the registry note to mention the sf_19
  download. The browser engine stays at Stockfish 18: no public
  WebAssembly build of sf_19 exists yet (`nmrugg/stockfish.js` tops
  out at v18, and the one Stockfish 19 WebAssembly that exists carries
  no network and a different interface — `docs/ENGINES.md`), so the web
  build cannot move with the native one. The gap is recorded in the
  registry note rather than fudged.
- **The command palette has section dividers.** The 74 px in-row
  uppercase group label is gone; a section header stands above each
  section instead, and the row is the title and shortcut alone.
- **The review queue orders by staleness.** The unreviewed queue
  ordered newest-first, which is the order the inbox grew in. It now
  orders oldest-first — the position the player has been putting off
  the longest sits at the top. Reviewed rows still order newest-first,
  because the column is then a history, not a to-do list. Rows older
  than seven days carry a small "Waiting Nd" tag, so a busy player can
  see which positions are slipping.
- **The Recent page's Games row carries an "ago".** Every other row on
  the page already said _when_ the player was last there; games said
  only what the game was, not when the player brought it in. Both
  halves sit on the meta line now ("Wch 2024 · 1d ago"). When a game
  has no event and no date the imported-time alone is the meta.
- **Preparation can ask for twice as many opponent games.** The Recent
  N cap was 1,000; it is now 2,000, which is the Lichess-side query
  ceiling. The default stays at 200, so a casual session is unchanged.
- **Preparation dossier gains a "Recent form" tab.** The dossier asked
  Plays, Changed, Move orders. The one it never asked was how the
  opponent has been doing recently — a strip of W / D / L for the
  last twenty games, newest on the left, with the tally underneath.
  It is an observation, not a verdict, and the section says so.
- **Starter Reference catalog notes the upgrade path.** A user who
  reads the catalog and decides 24 MB / 206,451 games is too small
  now sees the bigger packs in the same list — Elite OTB Reference
  (407,538 games, 339 MB), the two Recent Theory Reference variants,
  High-Rated Online Reference. The trade-off is one row away rather
  than one document away.

## 1.1.5 — 2026-09-14

From the owner's twelve reports on 1.1.4. Everything below is in both the
web application and the Mac application; the Mac 1.1.5 is built from the
same source revision as the web deployment.

- **The evaluation bar can be read.** It is wider, the figure in it is
  the one the engine panel shows (two decimals, or one past ten pawns),
  and hovering it says the depth, the engine, and whether the reading is
  live or stored. A running engine now **follows the board**: play a
  move and the search restarts on the new position with the same
  settings, and stops when you stop it — instead of stopping on every
  move and leaving the bar blank. Review before reveal and Training
  switch following off and stop the engine, so nothing runs behind the
  curtain.
- **The evaluation graph is a graph.** Titled, scaled to at least forty
  plies so a short game does not fill the strip with three blocks, with
  White above and Black below the equality line and a caption saying how
  many plies are analysed. It appears on both identities whenever a game
  has stored evaluations; it never appeared on the web only because the
  game there had none.
- **A Reset moves button** beside the move controls clears the move tree
  and keeps the position. One undo (⌘Z) brings the moves back.
- **Review's journal uses the one board.** Candidate moves are recorded
  by playing them on the board itself — the board stays on the position
  and draws each candidate back as an arrow, the first in blue as your
  choice — with a Record/Play switch and a notation field; the second
  210px board in the dock is gone, and the panel's text no longer touches
  its edges. A concealed board also accepts moves again: it hid the legal
  hints and, by the same switch, the ability to move.
- **Annotation colours change something you can see.** Colour-blind now
  repaints the green/red pair behind every verdict — `!!`/`!` in green,
  `?`/`??` in red, `!?`/`?!` in amber in the move list — as well as the
  four brushes, and Settings shows the result beside the switch.
- **Three tournament-grade piece sets**: Pirouetti, Kryukov (the classic
  book-diagram set) and Sophia, all with recorded licences. The picker
  lists tournament and diagram sets before decorative ones.
- **Settings → Profile no longer suggests the owner's own name.**
- **More games behind every player.** The bundled reference (version 3,
  through August 2026) keeps full scores for games rated 2500+ and up to
  200 a player instead of 2600+ and 120: 27,521 openable games, from
  10,707, for 6 MB more on disk.
- **A sparring partner in Preparation.** With an opponent loaded, the
  Sparring tool in the dock plays their own moves for as long as the
  position is one their selected games reached — chosen as often as they
  chose them, with the count beside each move — and hands over to the
  engine, saying so, when the game leaves their practice. It plays on the
  main board, so the game is in the move tree. No style is inferred.
- **Analysis no longer fails hydration.** The engine selector rendered a
  platform note on the client that the server had not, and React rebuilt
  the whole page on every visit; on the Mac that rebuild also wiped the
  reservation for the window buttons, which is why the traffic lights sat
  over the Kingfisher mark again on some launches. Both are fixed: the note
  arrives after hydration, and the reservation is restated from the
  application as well as before first paint.
- **Mac: the update dialog shows what's new in three lines** and links to
  the full release notes, instead of the whole changelog in a scroll box.

## 1.1.4 — 2026-09-13

A small release on 1.1.3, in both the web application and the Mac
application, made from the owner's second look.

- **A `/favicon.ico` exists.** Browsers request it by convention whatever
  the page links, and every such request answered 404 — harmless to the
  user, but the intermittent failure of the browser soak test on an
  unattributable 404 turned out to be exactly this. The app icon, in ICO.
- **Engines that do not exist for your machine say so.** The engine
  selector marks Berserk, Obsidian and Koivisto "Windows only" (Koivisto
  "Linux and Windows only") instead of "needs the companion", and
  Settings → Engines carries a "Not offered on macOS" note naming them
  and the reason: those projects publish builds for those platforms
  only. A Mac user who found six of nine native engines used to conclude
  three were broken.
- **The landing's download card is shorter.** The paragraph under the
  macOS download that repeated the install guide — where your work lives,
  how to replace the app, how Check for Updates behaves — is gone; the
  install guide, linked beside the download, says all of it.

## 1.1.3 — 2026-09-13

Every item below is in both the web application and the Mac application;
the Mac 1.1.3 is built from the same source revision as the web deployment.

- **Every board page is the Analysis page.** Studies, Repertoire,
  Openings, Preparation, Review, Training, Endgame and Opening Files now
  render the same frame Analysis does — the board with the move tree
  under it, the resizable tool dock beside it, and the position menu,
  position setup, command search, theme and settings in the same places
  on every page. What a page adds is only what makes it that page: its
  own list in a rail on the left that folds to a strip, its own actions,
  and its own panel in the dock. Review's journal no longer sits in a
  fixed 360px column; Studies with no chapter no longer shows a blank
  column beside an empty board.
- **Set up a position from any page.** Adding and removing pieces —
  the start of any endgame study or "what if" — was reachable from
  Analysis only, two menus deep. Every board page now has a **Set up**
  button in its header, and the Position menu beside it.
- **The More menu opens.** Pressing More on the tool dock used to show
  one item and scroll the tab row sideways so the pinned tabs vanished;
  the menu was being clipped by the row it lived in. It now lists every
  tool, and tabs that do not fit the dock's width move into it instead
  of scrolling out of sight.
- **The default board is Midnight**, on the web and in the Mac
  application. A profile that never chose a theme moves to it once;
  anyone who preferred Walnut picks it again in Settings → Board.
- **Choose the engine on the engine panel.** The one-engine panel now
  has the engine selector; it used to be reachable only by switching to
  Two engines. Every option says whether it can start here — a native
  engine needs the companion and needs to be installed — and a panel
  that cannot start its engine offers the Settings page that fixes it
  rather than a command line.
- **Clear the move tree** without losing the position: in the command
  palette, the Export menu and the Position menu. `New` still resets to
  the initial position; this keeps the endgame you set up and removes
  the lines you tried.
- **Clicking a selected piece again deselects it**, and its legal-move
  dots go away.
- **"Open on the board" opens the opening**, at the end of its line;
  it used to open at the initial position with the moves in the list.
  "Open this position in Explorer" now opens the Explorer on the
  position; the command had navigated to the library.
- **Preparation searches the reference sources.** Typing an opponent's
  name offers the player library — Carlsen with 452 games in the
  installed reference, not "no matching local games" — and the report is
  built from those games and your own, each source counted on its own
  line. A free-typed name still searches imported games for an
  unlisted opponent.
- **A repertoire with no positions shows a board**, oriented for its
  colour, with **Add to repertoire** in its header, its rail and a
  banner — the button the empty state told you to find.
- **Players are one row each.** "Erdogmus, Yagiz Kaan" (IM, from the
  games) and "Yağız Kaan Erdoğmuş" (GM, from Wikidata) were the same
  person twice: the Turkish dotless ı survives accent folding, and the
  roster's aliases were only tried in one word order. Two packs filing
  one player under two spellings are merged too, the roster's current
  title wins, and rows now say where the player is from.
- **"Test connection" on a Lichess source becomes "Connect Lichess"**
  when what the source needs is a sign-in; testing a source with no
  token re-ran the test and said the same thing.
- **Linking a Lichess account says what is wrong.** Lichess now serves
  game exports only to signed-in clients and answers anonymous requests
  with 404, which Kingfisher reported as "no account called …" for
  accounts that exist. It now checks the public profile and says to
  sign in. Enter links the account. In the Mac application, **Sign in
  with Lichess** opens in a window of its own and returns to the
  application; it used to open the system browser, where the sign-in
  could never complete.
- **"Storage is not protected" explains itself.** A declined request
  opens a note saying which browsers protect a site when (installed as
  an app, bookmarked, asked once), offers **Install as an app** when the
  browser has offered it, and a backup either way — instead of a toast
  saying the runtime declined.
- **Settings is wider**, with the sections down the left, and the
  engine choice you make is the engine you get after a reload; it had
  been saved and not applied.
- **188 more variation briefs**, one for each variation a strong player
  meets — the Sozin, the Moscow, the Grand Prix, the Ragozin, the
  Petrosian King's Indian, the Chebanenko, the Kieseritzky — and eight
  existing briefs corrected against the dataset's own lines (the
  Caro-Kann Exchange's minority attack is Black's, the Berlin does not
  "ignore a threat to the knight"). `docs/data/variation-briefs.md`
  lists them.

- **The website counts page views and load times.** Vercel Web
  Analytics and Speed Insights, served from this origin: page path,
  referrer, and what the request already carries (country, browser and
  OS family, device class), and the load timings the browser computes
  (Core Web Vitals) with connection type and device class. No cookie, no
  identifier stored on the device, query strings and fragments stripped
  so a position in a URL never leaves the browser, nothing about your
  chess. The privacy, security and terms pages, README and the launch
  kit now say exactly this instead of "no telemetry"; the Mac
  application, built off Vercel, loads none of it.
- **Your work is asked to be kept, without you asking.** The first time
  a session saves something — a move in an untitled analysis counts —
  Kingfisher asks the browser to mark its storage durable, so months of
  studies are not left in storage the browser may evict under pressure.
  Until now that request was made only when you noticed and clicked
  "Storage is not protected". Chromium answers from its own rules with
  no prompt; Firefox asks once; a refusal is not repeated. The indicator
  in the sidebar reflects the answer either way.
- **One public address.** Kingfisher now lives at
  <https://kingfisherchess.app/>: the landing page at `/`, the
  application at `/analysis` and the other routes, exactly as on
  `localhost`. `kingfisher-chess.vercel.app` redirects there; the
  application's previous `vercel.app` address was retired the same day,
  before the first announcement. The Mac application is unaffected; its printed
  links follow the redirect.

## 1.1.2 — 2026-09-13

A maintenance release that brings the public Mac application back to
the same source revision as the web application. 1.1.1 (build 494,
`6df79f8`) predated every fix below; the web deployment had carried the
first three since `ca329f7`. 1.1.2 is offered through _Kingfisher →
Check for Updates…_ and from the landing page.

### Corrections

- **Send feedback sends.** The dialog's request failed in every browser
  with "Illegal invocation" before it left the page — the built-in
  `fetch` was being called as a method of the sink object, which Node
  tolerates and Chromium and WebKit refuse — so no feedback sent from
  the application has ever reached the inbox; only a direct request to
  the route did. The request also carried no fill-time stamp, so the
  route would have refused it as too fast, and "Include current
  position" attached nothing. All three are fixed, and a browser test
  now drives the real dialog.
- **A PGN worker no longer loads another worker's module.** The service
  worker could answer a cached navigation with the wrong worker's
  bootstrap; it now serves each request its own URL.
- **A shortcut can be rebound in Safari.** The capture control is focused
  before it listens, which Safari requires.
- **"1 prepared position", not "1 prepared positions"**, and the same for
  one gap in the repertoire.

### macOS

- **No more Touch ID or password prompt on every update.** Squirrel.Mac's
  helper-tool prompt fired on every _Install Update_ (Squirrel.Mac #192,
  #247). Kingfisher now sets `SquirrelMacEnableDirectContentsWrite` in
  its own defaults domain on first launch, so the update engine writes
  the bundle directly. The first launch after a fresh install may still
  prompt once; every update after that is silent. SHA-512 verification,
  Developer ID signing and notarisation are unchanged.
- **Release notes appear inline in the update dialog**, rendered from the
  GitHub release body with a renderer that never passes HTML through.
- **A quiet background check on launch.** Five seconds after start-up the
  application asks the release feed once; if a newer release exists, the
  _Kingfisher_ menu's _Check for Updates…_ item re-labels itself to _An
  Update Is Available…_. No badge, no banner, no notification, and no
  further polling. The explicit click is unchanged.

## 1.1.1 — 2026-09-13

A maintenance release: the polish made after 1.1.0 and the corrections
found while certifying the product for users, bringing the public Mac
application and web application to the release source at `6df79f8`.
The fixes made after it are listed under 1.1.2. Nothing in the 1.1.0 release was replaced; 1.1.1 is offered
through _Kingfisher → Check for Updates…_ and from the landing page.

### Corrections

- **The evaluation bar says the same side is better after the board is
  flipped.** With Black at the bottom the bar had drawn a white band
  with Black's share of the height, so a position White was winning
  read as one Black dominated. The band at the bottom is now the bottom
  side's, in its own colour; the label sits in the leading side's band;
  mate saturates and prints M3. The two-engine panel says which engine
  drives the bar (the first one, only).
- **A surname finds the person you mean.** "Kasparov" is Garry before
  Sergey, "Karpov" Anatoly, "Fischer" Bobby, "Tal" Mikhail, "Firouzja"
  Alireza, "Lasker" Emanuel, "Ding" Ding Liren — each had answered a
  titled namesake first. "MVL" and "Nepo" work.
- **The Theory Book locates a line by its positions.** A Catalan
  reached by 1.Nf3 d5 2.g3 was labelled King's Indian Attack; the panel
  now agrees with the board's own classifier, and its crumbs are the
  named positions you actually passed through.
- **A bare clock comment no longer doubles on every PGN round trip.**
  Every Lichess or chess.com export re-imported after an export had
  carried `[%clk …] [%clk …]` on every move.
- **The system requirement is stated correctly: macOS 13 (Ventura) or
  later.** The 1.1.0 release page and bundle said macOS 11; the
  Electron runtime inside the application does not start below 13.
- **The install page no longer tells users of a notarised build to
  right-click → Open**, and no longer calls the application a Preview.
- **No hydration warning on a Firefox reload**, from the storage-status
  button's remembered disabled state.
- **The public pages say "Kingfisher's", not "Kingfishers"** — fourteen
  possessives had lost their apostrophes.

### macOS

- **Full screen uses the whole corner.** In full screen macOS hides the
  window buttons, and Kingfisher's mark and wordmark now move into the
  space they leave, coming back behind them when the window returns.
  The state comes from the window itself, never from its size.
- **Check for Updates reads more cleanly.** One apostrophe throughout,
  and the "available" notice says what happens next instead of
  repeating itself.

### Everywhere

- **The command palette's search field has one focus ring.** The icon
  and the field are one control with one border; the clipped gold
  outline that sat around the text alone is gone, and the results align
  with the field above them.

### Landing

- **The landing shows the product.** A capture of the current analysis
  workspace — a real search, its arrow on the board — sits under the
  headline, and the macOS download card states its trust in Apple's own
  terms: signed with a Developer ID certificate, notarised by Apple.

## 1.1.0 — 2026-09-12

The first release signed with a Developer ID certificate and notarised
by Apple: the DMG opens and the application starts with a normal
double-click, with no right-click workaround. Everything since 1.0.0 —
the desktop repairs, the updater, Game Review, the two-engine
comparison, the data and search improvements — ships in it. The public
1.0.0 predates the updater and is signed differently, so it cannot
update itself; replace the application by hand once, and the work in
`~/Library/Application Support/kingfisher-desktop/` is kept. From 1.1.0
on, _Kingfisher → Check for Updates…_ installs the next release.

### Apple trust and the packaged build (Phase 47)

- **Signed with Developer ID and notarised.** The application, every
  nested helper and the disk image carry a `Developer ID Application`
  signature with the Hardened Runtime, and Apple's notarisation ticket
  is stapled to both the `.app` and the `.dmg`, so Gatekeeper's answer
  is available offline. Notarisation is Apple's malware screening, not
  an endorsement.
- **A build cannot ship incomplete.** The list of what the packaged
  application must contain is one file, the build refuses to sign a
  bundle missing any of it, and the freshly built application is
  launched — web server, companion, engine catalogue — before a DMG is
  made from those bytes. "Kingfisher could not start" from a missing
  `server.js` is structurally impossible for a published build.
- **Fewer entitlements.** `disable-library-validation` and
  `allow-dyld-environment-variables` are gone; they were granted for
  the engines, which are separate processes and never needed them.
- **The update window is a native panel.** Small, with the system
  title bar, one default button per state, keyboard-complete, and
  plain language for every state including the failures. Nothing
  internal — paths, manifest names, headers — is ever shown.
- **Engine arrows redrawn.** A slim, filled arrow that points at the
  destination instead of covering it; Engine A solid blue, Engine B
  amber and dashed with an outlined head; when both engines choose the
  same move there is one two-tone arrow, not two. The tooltip sits by
  the arrow's head. The board stays playable under an arrow, and the
  arrows fade while you move a piece.
- **A titled-player roster.** Every GM, WGM, IM and WIM Wikidata
  records — 8,339 people, with the spellings and nicknames they are
  found under — is searchable in the player library and the command
  palette, each shown as a person the installed sources may hold no
  games for. Nothing on the roster is a game.
- **Opening search answers to the names players use.** QGD, KID, KIA,
  QID, "Sicilian Defence", "Kings Indian", "Gruenfeld", "Spanish";
  "Berlin" is the Ruy Lopez line, "Sveshnikov" is the Sveshnikov and not
  the Anti-Sveshnikov, "Dragon" is the Sicilian; one hit per name; a
  typo still finds the opening and a resemblance no longer does.
- **Halogen 16.8.0** replaces 16.0.0, which could die at its own depth
  limit on a trivial endgame.

### Desktop reliability

- The packaged macOS application contains the application again. Every
  build from the polished-DMG work onward had been a shell with no web
  server and no companion inside it: it launched, showed "This build is
  incomplete" and exited. The bundle contents are now pinned by test,
  the DMG verifier refuses a bundle that cannot launch, and the whole
  packaged gate (`npm run desktop:certify`) runs against the real
  `Kingfisher.app`.
- _Kingfisher → Check for Updates…_ works. The dialog's buttons reached
  nothing in the main process, and the update engine underneath was
  never loaded; both are fixed, a failed check says one sentence a
  person can act on, and a preview build says which build it is and
  opens the download page instead of asking a feed it cannot use.
- The board can be played while an engine is analysing. The engine
  arrow's hover layer had been swallowing every click and drag on the
  board since the arrow tooltip was added.
- An engine's `bestmove` is checked against the position it was asked
  about; an illegal answer is dropped rather than drawn.
- The companion no longer exits on a malformed pairing token — one
  loopback request with a non-ASCII token of the right length used to
  take every engine and open database down with it — and it stops
  reading a request body at its limit instead of after it.
- Double-clicking a `.pgn` offers Kingfisher again; the file
  association had been lost with the bundle contents.
- The bundled three-piece Syzygy tables are real tables again, verified
  against the publisher's digests; four had been replaced by stubs.

### Distribution

- Every packaged build carries a build number, its commit and its
  channel (`stable`, `preview`, `dev`) in the bundle and in
  _Settings → Diagnostics_, so a report about "1.0.0" can be matched to
  the bytes the person has.
- The macOS download offered on the landing page is described by one
  file, `src/release/macos-download.json`; the landing, the install
  guide and the checks all read it. `npm run desktop:public:verify --
--full` downloads the public DMG and verifies every byte, its
  signature and its notarisation state against that description.
- A **preview channel**: the current source, published as a GitHub
  pre-release under its own tag with a filename that carries the build
  number, so the landing always offers the current build without a
  version bump and without replacing any published bytes. The stable
  updater cannot see previews.

### Documentation corrections

- The profile directory is `~/Library/Application Support/kingfisher-desktop/`,
  not `…/Kingfisher/`; the landing, the install guide and the
  maintainer docs said the latter.
- The security policy and the public-claims register no longer describe
  a signed, notarised 1.1.0 as if it existed; the trusted release is a
  runbook, and every current document says which build is public.
- Every Markdown file in the repository is now classified in
  `docs/README.md` as current, operations, records or historical.

### Engine best-move arrows and a cleaner FEN line (Phase 42)

- The board now draws the engine's recommended move as a clear,
  single arrow: solid blue for the primary slot, dashed orange for
  the second engine. When two engines agree on the same move, the
  arrows are nudged parallel so the user can _see_ the agreement.
  When they disagree, both arrows are visible. The colour is paired
  with a line style, so a colour-blind user can still tell them
  apart.
- A stale engine result never paints an arrow on the new position.
  The board's best-move layer is filtered by exact position match,
  and the engine arrow disappears the moment the engine is stopped,
  paused, or crashed.
- The status bar's permanent full-FEN string is gone. A compact
  **Copy FEN** button copies the canonical current position; the
  full value is shown on hover for users who actually need to read
  it. Clipboard failure is shown as "Could not copy FEN" rather than
  a silent error.

### Game Review deepening and a shared source comparison (Phase 42)

- Strategic transitions — "Black creates a protected passed pawn",
  "the e-file becomes open" — are now attached to critical moments,
  derived from the board facts before and after the move. They do
  not mark every structural event; the engine still treats a pure
  opening move as a quiet move.
- The same **Compare Sources** surface the Explorer uses is now
  available from the Review queue, defaulting to Elite OTB and
  Recent Theory. Each source is shown as its own column with its
  own games and its own score; the populations are never merged
  silently.

### Auto-deploy and a tidier workspace (Phase 42)

- The Studio's auto-deploy, which Phase 41 had to do by hand, is
  fixed: a new GitHub Actions workflow on every push to `master`
  deploys the Studio to Vercel using a Personal Access Token in
  repository secrets. The Studio hostname (`kingfisher-roan`) is
  unchanged.
- `npm run deploy:status` reports, in one row per project, whether
  each Vercel production deployment matches `origin/master`. "Studio
  is BEHIND master by N commits" is now a question with an answer.
- The legacy `kingfisher-phase29-audit-storage` worktree is
  archived (48 MB of source) under
  `~/Library/Caches/Kingfisher/legacy-archive/`, out of iCloud sync
  and out of `~/Desktop/Projects/`. `npm run workspace:audit` keeps
  the layout honest from here on.

### Direct in-app feedback (Phase 40)

- A visible **Feedback** button now sits at the bottom of the
  sidebar (mobile: in the drawer; collapsed: as a tooltip).
  Cmd+K commands _Report a problem_, _Report a data issue_,
  and _Send feedback_ open the same dialog. _Settings → Help
  and feedback_ does too. One form, one architecture, no
  GitHub tab-switching for the default path.
- The submission carries a category (one of five), the typed
  message, optionally the current FEN (off by default), and
  optionally a short technical-information block (off by
  default and previewable before send). Nothing else —
  studies, PGNs, notes, repertoire, training answers, and
  database paths never leave the browser.
- `POST /api/feedback` is the new server sink. It enforces
  same-origin, content-type, a 64 KB body ceiling, a
  per-IP rate limit, a minimum form-fill time, and a honeypot.
  When the operator has configured the secure feedback
  repository and a fine-grained token, submissions land
  there server-side; the renderer never sees the token. When
  the secure sink is not configured, the submission is
  validated and acknowledged, and the dialog offers an
  "Open GitHub feedback" button as a user-initiated fallback.

### Honest feedback (Phase 41)

- The feedback route no longer claims success when no durable
  sink is configured. `POST /api/feedback` returns `503` with
  `code: "unconfigured"` so the modal renders the explicit
  fallback surface ("Direct feedback is not currently
  configured — Copy feedback or Open GitHub feedback"). The
  "Your feedback was sent" message now only appears when the
  route actually delivered. The same code is also reachable via
  `useFeedback().probeDirectSubmission()`, so any surface that
  embeds the modal can branch on it without a separate fetch.
- `POST /api/feedback` distinguishes 503 (unconfigured) from
  502 (delivery rejected by an _available_ sink) from
  429/400/403/422 (rejected by validation). The sink tests
  pin the contract.

### Mark for review — durable, transposition-aware (Phase 41)

- The **Mark for review** button at the top of a reviewed
  position writes a durable review item that survives reload,
  backup, and restore. Re-marking the same position from the
  same game refreshes the note; re-marking the same canonical
  position from a _different_ game (or a different move order
  that reaches the same position) appends a `MarkedFromGame`
  occurrence rather than creating a duplicate item. The item's
  identity key is `marked:${positionKey}` so the work item is
  one per canonical position; the occurrences list keeps the
  "I reached this from three of my games" context.
- After marking, the header switches to **Marked for Review /
  Open / Remove mark**. Removing the mark clears the item;
  re-marking the same position creates it again.

### Strategic feature transitions (Phase 41)

- Game Review now attaches deterministic "what changed"
  statements to critical moments: created passed pawn, created
  protected passer, created connected passed pawns, newly
  isolated pawn, doubled pawns, backward pawn, newly opened
  file, newly semi-open file, rook on a newly open file,
  bishop pair gained/lost, kingside pawn shield collapsed by
  two or more. Each statement is a board fact — the user can
  read it without knowing chess jargon and without knowing what
  the engine thinks.
- The detector compares file-by-file (not square-by-square) so
  a normal one-square pawn advance does not produce a fresh
  transition. The "no false positives for normal pawn moves"
  brief item is a passing test.

### Multi-source comparison (Phase 41)

- A new `SourceComparison` normalizer turns raw per-source
  counts into a uniform row-per-move shape with an explicit
  `SourceAbsence` (`zero-games` / `unavailable` / `not-loaded`
  / `unsupported-filter` / `network-failed`). The renderer
  never sees a "0" that means "source unavailable" — chess-data
  correctness per the brief.
- Trend claims are gated by `meetsTrendSampleThreshold` (50
  games minimum, both sides). Three games is not a trend even
  when the raw percentage delta is large.

### Clock parsing (Phase 41)

- The PGN clock parser already handled `[%clk H:MM:SS]`;
  Phase 41 adds a dedicated `chess/clock.ts` module for the
  derived facts: `thinkTimeSeconds` (refuses zero/negative),
  `isTimeTrouble` (move≥20 AND remaining<initial/3 AND
  increment<30 — refuses to label 5+0 bullet or 30+30 rapid
  as "time trouble"), and `parseTimeControlTag` (handles
  `300+0` / `5400+30` / plain seconds; returns null for the
  ambiguous `40/5400+30:3600` moves/seconds form rather than
  guessing).

### Calculation training (Phase 41)

- A distinct training item type with full provenance. The
  source kind `'game-review'` joins `'study' / 'game' /
'repertoire' / 'analysis'`. The answer's truth source is
  recorded on every item (`engine-candidates` /
  `user-selected` / `tablebase`), so the renderer can label
  the answer accurately and never hide that the answer came
  from engine analysis.
- `gradeCalculationPick` scores by rank + delta-centipawns +
  acceptable-band. It refuses to mark engine-second-line
  within the band as wrong, and it treats exact-tablebase
  winners as winning without penalising alternate winning
  moves. Repertoire training is unchanged.

### Game Review — evidence-based critical moments (Phase 40)

- A new `runGameReview` driver walks the canonical game
  tree, asks the engine for evidence at every position, and
  ranks critical moments by evidence (mate transitions,
  evaluation swings, reference departures, repertoire
  deviations). No fake accuracy, no "Brilliant!!" label.
- Three budget presets: `quick`, `standard`, `deep`, with
  per-ply depth, multi-PV, and time bound. Progress and
  cancel are honoured; partial cancellations are clearly
  reported, never silently passed off as complete.
- `buildCandidateComparison` surfaces played move, engine
  candidates, reference moves, repertoire moves, personal
  database count, and tablebase WDL as distinct evidence
  sources, side by side — not merged into a single ranking.
- Repertoire deviation is keyed on the canonical FEN, so a
  move order that transposes into the user's preparation is
  recognised as in-prep.

### Test discipline (Phase 40)

- **Zero skipped automated tests.** Phase 39 shipped 11
  skipped tests covering visual baselines, the Syzygy probe
  helper, real reference packs, single-source explorer
  switching, and explorer-cache injection. Each is replaced
  by an active deterministic assertion.
- `npm run test:no-skips` is a new static gate that fails
  the build the moment any future commit reintroduces
  `test.skip`, `it.skip`, `describe.skip`, `xit`, `xtest`,
  `xdescribe`, `test.todo`, `it.todo`, `describe.todo`,
  `test.fixme`, `it.fixme`, `test.skipIf`, `test.runIf`,
  or a conditional `describe.skip` reference.
- Final automated state: 2624 passing, 0 skipped, 0
  failing.

### Installable web app (Phase 34)

- The studio origin (`kingfisher-roan.vercel.app`) is now an
  installable Progressive Web App. Chromium-family browsers
  offer the standard "Install" affordance and the application
  now exposes a small "Install Kingfisher" card in
  _Settings → Diagnostics_. A `beforeinstallprompt` is captured
  for the studio origin only — the marketing origin
  (`kingfisher-chess.vercel.app`) does not advertise itself
  as a PWA.
- A small same-origin service worker caches the application
  shell (hashed `_next/static/*`, manifest, icons). Reference
  data is **not** cached by the worker; the IndexedDB streaming
  cache remains its sole owner. The cache name is keyed by
  build identity, so a web deploy invalidates old shell
  caches without a Kingfisher version bump.
- A new "A Kingfisher update is ready. [Reload]" banner appears
  above the workspace when a new service worker is installed.
  The Reload button is disabled while a save is in flight, and
  the new worker never auto-activates.
- The marketing origin remains indexable. The studio origin now
  sends `X-Robots-Tag: noindex, nofollow, noarchive` on every
  response so search engines keep working application
  surfaces out of their index.

### macOS update discovery (Phase 34)

- A manual **Check for updates** action is wired into the
  macOS application's _Settings → Diagnostics_ panel. The
  check is one HTTPS request to the public Kingfisher release
  metadata, validated against SHA-256 and DMG-name
  constraints. Verdicts are _up to date_, _newer available_
  (with a link to the verified release page), and _unable to
  check_ (with a human-readable reason).
- Auto-update and silent binary replacement remain off. The
  macOS Preview is not notarised; the user always opens the
  release page in their own browser and downloads, verifies
  and installs by hand.
- The landing-page macOS card now mentions the upgrade
  workflow: "Already using Kingfisher? Download the latest
  DMG and replace the app in Applications. Your local
  Kingfisher work is stored separately and is preserved."

### Critical hotfix shipped (in production at 1.0.0)

- **Landing page no longer freezes the scroll.** A `body { overflow:
hidden }` rule was preventing scroll on the marketing page; the fix
  is a one-line CSS change deployed at master `4793827` without a
  version bump. This is the only Phase 29 change in production.

### Data

- **Visible chunk reuse.** When a reference pack is updated, the install
  progress now reports how many bytes were saved by re-using chunks
  already on disk — the same number the content-addressed store sees,
  not a rounded estimate. _120 MB of 324 MB · 204 MB reused from the
  previous install._
- **Categorised build reports.** Every reference pack build now writes
  a `build-report.json` next to its manifest. Every rejection reason
  the worker counts — bad result, too short, non-standard variant,
  missing player, missing rating, below the rating floor, above the
  rating ceiling, bot match, online event, illegal moves — is recorded
  individually, so a giant unexplained gap between the input game
  count and the retained game count cannot ship silently.
- **Freshness on the catalog rows.** The Recent Theory and High-Rated
  Online catalog rows state their filter and date window so the choice
  of "recent" is visible before install, not hidden in a document.
- **Use a pack online, with cached chunks.** A catalog pack that is not
  installed can now be queried online. The Explorer fetches the
  required shards, verifies each against the manifest's SHA-256,
  caches the verified chunks in a byte-budgeted LRU, and answers
  later queries from the cache. Cached chunks are reused when the
  same pack is later installed, so a research session does not
  download what the user has already fetched.
- **Project size, not a blocker.** `.real-scale`, `.archive-cache`,
  `.packs`, `.engine-build`, and `.engine-fleet` now live under the
  OS user-cache directory by default. A normal `git clone` no longer
  ships five-plus gigabytes of generated cache.

### Opening research

- **Trend with a sample-size label.** The Explorer Recent column shows
  the trend arrow only when the move has enough games to support one.
  Below the threshold, the column says _small sample_ in plain text
  and prints the recent games count next to it, so 3 of 7 never looks
  equivalent to 3,000 of 7,000. The header tooltip spells out the
  threshold and the rise/fall/steady rule.
- **Speed facet for the Explorer.** A Speed segmented control
  (All / Classical / Rapid / Blitz) appears on sources that
  distinguish speeds — Lichess, the user's own games, and any
  streaming pack. Reference packs that were built from a single
  speed window do not show the facet, because the facet would
  be a filter over the wrong axis. The active speed is part of
  the Explorer query key, so a result and its cache reflect the
  choice.
- **Repertoire coverage against a reference source.** The Repertoire
  workspace has a new panel that picks a reference source (Elite OTB,
  Recent Theory, High-Rated Online) and lists the high-frequency
  opponent replies the repertoire has not decided, with the games
  count and share for each. Transpositions collapse to one entry.

### Players

- **What has this player changed?** Each colour's section in a profile
  gains a Career vs Recent openings table. Each row shows the career
  share, the last-12-months share, and the percentage-point change
  between them. Rows below ten combined games are dropped, so a
  3-vs-0 comparison cannot look like a confident finding. The two
  columns are independent; recent is reported as — for openings that
  exist only in the career window, never as a fake zero.

### Training

- **Data-driven training generation.** A coverage report can be turned
  into a list of training prompts — position-keyed, deduplicated by
  canonical position, and provenance-tagged with the source the gap
  came from. The solution is intentionally left empty: the
  reference data tells the player _what_ to train; the player's own
  repertoire move is the answer.

### Continuity and errors

### Workflow speed — Phase 31

- **One search box, one parser, one ranking.** The command palette
  now reads from the same front door for every entity. `Cmd+K`
  finds openings, players, studies, chapters, repertoires, games,
  databases, opening files, training, decisions, themes, tags, and
  commands with the same subsequence ranking. No provider is hidden
  behind a different palette; there is exactly one.
- **FEN and move-sequence recognition in the search box.** A pasted
  FEN opens position search. `1.e4 c5 2.Nf3 d6` is parsed safely,
  refused to guess on the first illegal move, and offered as
  Explorer / Analysis / Databases actions on the reached position.
  Long pastes (over 240 characters) are pointed at the PGN
  importer rather than crashing the providers.
- **Open in … is one table.** A small action registry serves the
  Analysis toolbar, the Study tab, the Repertoire page, the
  Explorer and the search palette, so a player who learns
  "Open in Analysis" once has learned it everywhere.
- **Recent work shows when and where.** The Continue card on the
  recent workspace now reports the last-opened time and ticks it
  once a minute, so a card left on screen does not silently age
  into a lie. The cursor inside a study chapter or game is the one
  the user left, with the engine, modals and in-flight requests
  explicitly _not_ restarted.

### Data scale — Phase 31

- **lastAccessed-indexed eviction.** The persistent streaming
  cache walks the `lastAccessed` index instead of scanning every
  record. Eviction is O(1) on the size of the cache. Benchmark
  measured 10k and 50k records: insert ~85–100 ms, touch-all
  ~50 ms, oldestEntries 0.3–1.5 ms, evict ~13 ms regardless of
  cache size.
- **Honest storage-quota warning.** A 5 GB pack install on a 6 GB
  device now pauses behind a confirm dialog that shows the
  browser's reported free space. The dialog does not block the
  install — that is a user choice — and the catalog row says
  "Use online to avoid downloading the full pack" for any source
  that is 1 GB or larger, so the online path is the recommended
  default for huge sources.

### Public release — Phase 32

- **Master convergence.** The complete Phase 31 work
  (universal search, FEN / move sequence recognition,
  Open in … action registry, lastAccessed-indexed cache
  eviction, storage-quota warning, recent work polish) is
  now on `master` as of `c341718`. The pre-Phase 31 master
  (`042ba36`) is no longer the canonical mainline.
- **Production deployment.** The web product is live at
  <https://kingfisher-roan.vercel.app> and the marketing
  surface at <https://kingfisher-chess.vercel.app>.
  `/analysis`, `/openings`, `/players`, `/databases`,
  `/repertoire`, `/training`, `/settings` all return 200
  with the new code; the public link check reports
  20/20 endpoints live.
- **README quickstart.** Three steps to a professional
  workflow: open Kingfisher, press <kbd>Cmd</kbd>+<kbd>K</kbd>,
  type and Enter. The quickstart lists `Najdorf`, `Carlsen`,
  `1.e4 c5 2.Nf3 d6`, FEN paste, study title, and `recent`
  as the first six things worth trying. Position search
  ("Search this position"), Continue with last-opened,
  online vs offline reference data, and local persistence /
  backup are documented in the same place.
- **Help and feedback.** Settings → Diagnostics gains a
  "Help and feedback" group with external links to the
  GitHub issue templates, the community discussion, the
  changelog, and the security policy. A new `data`
  issue template asks for the source name, the question
  the player wanted answered, the actual answer, and the
  source state — so a maintainer can reproduce without a
  private PGN.
- **Kingfisher 404.** A bad studio URL no longer lands on
  the Next.js framework default. The 404 page offers
  "Open a fresh analysis", "Search Kingfisher" (which
  opens the universal palette via a window event), and
  "Open the landing page" as the three recovery actions.
- **Synthetic huge-source fixtures.** A new
  `src/reference/synthetic-huge-sources.ts` declares 1 GB,
  5 GB, and 20 GB fixtures with no payload. The catalog
  row, the storage-quota confirm dialog, and the
  `verdictForInstall` code path are exercised in a real
  browser without downloading a real pack.
- **Deployment model.** Push-to-master auto-deployment is
  not yet wired on the Vercel account. The Phase 32
  release used `vercel deploy --prod --yes` via the
  authenticated CLI. Future pushes will continue to
  deploy through the same CLI until the GitHub
  connection is set up; the one-click import path
  documented in `docs/deployment.md` is the recommended
  replacement.

- **"Saved on this device" status, in the sidebar.** A quiet
  indicator reports whether the browser considers the IndexedDB
  origin durable. If it does not, the user can click to ask the
  browser for that protection. The copy is careful to never imply
  cross-device backup, because no such backup exists.
- **Errors the user can read.** A fetch failure, an aborted request,
  a SQLITE_BUSY, an ERR_CONNECTION_REFUSED — they all surface in
  the UI as plain English with a short next step. The raw
  exception still appears in Diagnostics for the power user.

### Professional macOS experience (as designed in Phase 36, shipped in 1.1.0)

- **Developer ID signed.** The macOS binary is signed with a
  `Developer ID Application` identity, with a secure timestamp
  and the macOS Hardened Runtime enabled. The signature chain
  covers the outer `.app` and every nested executable —
  Electron Framework, the `Kingfisher Helper` family, the GPU
  and plugin helpers, and the bundled engine binaries.
- **Notarised by Apple.** The notarisation ticket is stapled
  to the `.app` and the `.dmg`, so a normal double-click is
  all the first launch needs. There is no right-click → Open
  workaround and no system-wide setting to change.

  The public claim is **Developer ID signed and notarised
  by Apple**, not "Apple approved" or "Apple certified".
  Notarisation is an automated security/signing check, not
  a product endorsement.

### Seamless secure updates

- **In-app auto-update.** _Kingfisher → Check for Updates…_
  in the macOS application menu now offers a one-click
  **Install Update** flow: download, verify, save barrier,
  engine shutdown, install, and relaunch. The previous
  _open the verified DMG by hand_ step is no longer the
  normal path; the polished DMG is still produced as the
  manual fallback.
- **Save barrier.** Before the install runs, Kingfisher asks
  the renderer to flush any in-flight writes. If the renderer
  reports a failed save, the install is **aborted** and the
  verified update remains cached for a retry.
- **Signature-continuity check.** The updater refuses to
  install a candidate whose Developer ID identity does not
  match the running app, refuses a downgrade, refuses an
  HTTP feed URL, and refuses a host outside the production
  allow-list. Eleven mutation tests pin these guards in
  source.
- **No background polling.** Check for Updates is the only
  thing that issues a network request to the release host.
  The updater does not run on a timer and does not run on
  launch.

### Reliability and security

- **State machine, not status flag.** The updater has a
  real state machine — `idle` / `checking` / `up-to-date` /
  `available` / `downloading` / `verifying` / `ready` /
  `waiting-for-save` / `installing` / `restarting` / `failed`
  / `canceled` — and the dialog renders a different copy for
  every state.
- **Single-flight.** A second click of the menu item during
  a check or a download is a no-op, not a second
  install. The check promise, the install promise, and the
  save-barrier response are each single-flight.
- **Cache pruning.** The update cache is bounded; the most
  recent verified candidate is kept, older downloads are
  unlinked.

### What stays the same

- The version stays at 1.0.0 throughout Phase 36 development.
  The bump to 1.1.0 happens in one release commit once the
  release gate passes.
- The application is still a desktop companion to the web
  Studio; the in-app update flow does not introduce any
  background service and does not introduce any analytics.
- The reference data is unchanged. Recent Theory v2 remains
  the live dataset; the `data:recent:status` command reports
  the next candidate window without rebuilding.

## 1.0.0 — public stable release

The first stable public release of Kingfisher. The web application is
production-stable; the macOS desktop application is signed and ships as
a **Preview** until notarization is available. The landing page now
serves at the production web origin (`https://kingfisher-chess.vercel.app/`)
and the studio is one click away.

### What is in this release

- **Web is stable.** Production deployment at
  <https://kingfisher-chess.vercel.app/>. The landing page is the
  first surface; the studio is one click in. Starter, Stockfish,
  Opening Explorer, Players, Databases, Studies, Repertoire, Settings
  — all working.
- **macOS is Preview.** Apple Silicon DMG (`Kingfisher-1.0.0-arm64.dmg`),
  code-signed, checksum published. Not notarized yet — see the
  installation guide for the right-click / Open path.
- **Reference data is published.** Elite OTB (407,538 games), Recent
  Theory (44,200 games), and High-Rated Online (305,169 games) all
  install from the public data mirror. Kingfisher Starter (172,376
  games) ships with the application.
- **No account, no telemetry, no subscription.** MIT-licensed source.

### What users notice

- A landing page that is informative and direct: what Kingfisher is,
  why it is different, how to launch the web app, how to install
  macOS, where the source lives.
- A one-click path from landing → web app.
- The web app works in a fresh private profile. Studies, repertoire
  and preferences persist across reloads.
- The macOS binary still works on Apple Silicon and survives
  quit / relaunch with all user data intact.
- GitHub issues and discussions are the public support channel; the
  in-app diagnostic report redacts OAuth tokens and personal paths.

## 1.0.0-rc.5 — public preview live

The web application and landing page are now public. This release adds a real
`/settings` deep link, points every current entry point at the production web
origin, and tightens the public-release security and deployment checks.

The macOS preview remains Apple Silicon-only and not notarized. Its release
artifact is signed, checksum-published, and validated on macOS.

## 1.0.0-rc.4 — public preview release

The first public release of Kingfisher. The product is on the web and
on macOS, the public landing page is live, and the optional reference
data is published.

### What is in this release

- **Public landing page.** A single, calm, fast page that explains
  what Kingfisher is, what the optional reference data is, and how
  to get it. Live at <https://mardakurt.github.io/kingfisher-data/>.
- **Optional reference data is published.** Elite OTB (407,538
  games), Recent Theory (44,200 games) and High-Rated Online
  (305,169 games) now install from the public data mirror. Kingfisher
  Starter ships with the application as before.
- **macOS preview build.** Apple Silicon, code-signed, `1.0.0-rc.4`.
  Not notarized — Gatekeeper refuses a first launch; the install
  guide walks through right-click → Open. Full guide:
  [`docs/release/install-macos.md`](docs/release/install-macos.md).
- **Web build.** The same application, served as a Next.js
  production build. The Stockfish engine is in the page; no
  install. The first time you open it, the bundled Kingfisher
  Starter installs itself.
- **Source-comparison Explorer.** Every reference source keeps its
  own licence, provenance and counts. The Explorer never produces a
  combined "truth" score that quietly blends them.
- **Diagnostics that are answerable.** Settings → Diagnostics now
  has a _Copy support information_ line and a _Copy full diagnostic
  report_ button, both with credentials redacted at write time. The
  log file is local, rotated, and never uploaded.
- **Local-first.** No account, no telemetry, no upload. Studies,
  repertoire, training and notes are stored locally. Restoring from
  backup does not require contacting a server.

### Known limitations

- **macOS preview is not notarized.** A Developer ID Application
  certificate will move the macOS build from "preview" to "release".
  Until then, the install guide is the right-click-Open dance.
- **No auto-update.** Open Help → Check for updates, or browse the
  releases page.
- **Windows and Linux build but are unsupported.** They have not
  been launched. The README and the install guide say so. Do not
  expect a Windows or Linux download to be the supported path.
- **macOS Intel builds but has not been launched.** The supported
  desktop platform is Apple Silicon.
- **No auto-update for the reference data either.** A new pack
  version replaces the catalogue pointer; existing installs
  continue to use the version they have until they re-install.
- **No games before 2020 in any first-party source.**
- **Chess960 is not supported, deliberately.**
- **Local Syzygy needs tables the user supplies.**

### Where to report problems

- **Issues:** <https://github.com/mardakurt/kingfisher/issues>
- **Discussions:** <https://github.com/mardakurt/kingfisher/discussions>
- **In-app:** Help → Report a problem copies a redacted support
  report to your clipboard. Paste it into the GitHub issue.

## 1.0.0-rc.3 — closed beta

The build that the closed-beta testers received. Web and macOS
Apple Silicon, code-signed but not notarized, with the Phase 22
closed-beta readiness work. Superseded by `1.0.0-rc.4`.

## 1.0.0-rc.2

Phase 21 follow-up. Web and macOS Apple Silicon, code-signed.

## 1.0.0-rc.1

The first release candidate, published for the closed beta.

## Earlier

The development history is recorded in `docs/reports/phase-*.md`. The
list above is the user-facing summary.
