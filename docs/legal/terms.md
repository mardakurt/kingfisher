# Terms

Kingfisher is open-source software published under the
[MIT licence](../../LICENSE). This page is the human-readable
summary of what you can and cannot expect from the product.

The full source of truth is the
[LICENSE](../../LICENSE) file. If anything on this page
contradicts the licence, the licence wins.

## The software is provided "as is"

Kingfisher is provided **as is**, without warranty of any
kind, express or implied, including but not limited to the
warranties of merchantability, fitness for a particular
purpose and noninfringement. In no event shall the authors or
copyright holders be liable for any claim, damages or other
liability, whether in an action of contract, tort or
otherwise, arising from, out of or in connection with the
software or the use or other dealings in the software.

That is the MIT licence's own wording, in its own words. It
means exactly what it says.

## No warranty of correctness

Kingfisher is a chess research tool. The engine analysis it
shows is the engine's view, the reference data it queries is
the data the upstream published, and the assessment you reach
with it is your own. Kingfisher does not certify that a move
is good, that an opening is "best", that a result is
"correct", or that any number it displays is a fact about a
chess position rather than a measurement of how a population
played it.

A statistic labelled _15,432 games_ is a count of games in a
specific upstream archive. A statistic labelled _Wins 53% · 4,200
games_ is a sample statistic on that count. Kingfisher does
not extrapolate, blend, or rank sources. The application will
sometimes refuse to answer a question; that is a deliberate
product decision, not a defect.

## No warranty of availability

The web build is hosted on Vercel. Vercel's own availability
terms apply. The macOS application is a downloadable DMG; once
downloaded, the application runs on your machine and your
machine's availability governs. There is no service-level
commitment on the web or the desktop, and the maintainer
reserves the right to take a deployment offline for
maintenance, change a domain, change a host, or change any
public URL with the same notice the source repository
receives. The optional account is kept by Supabase, under the same
terms: no service-level commitment. Your work stays on your own
device either way, so an outage of the account service delays
syncing and loses nothing.

The "current canonical landing" and "current canonical studio"
URLs are recorded in [`docs/product/public-claims.md`](../product/public-claims.md)
and surfaced as a single canonical source
(`src/release/public-urls.ts` in this repository).

## Reference data is licensed by its publisher

Each reference pack and each upstream provider carries its own
licence, recorded in the pack manifest and in
[`docs/legal/data-licences.md`](data-licences.md). Kingfisher
redistributes data only where the licence permits, with the
attribution the licence requires. **Your** use of a pack
inherits the pack's licence; if you want to redistribute a
pack, read the licence, not this page.

## Account, sync, telemetry

A Kingfisher account is optional; signed in, your work syncs
between your devices, and signed out nothing about you or your
work leaves your machine.
The website counts page views and load times and nothing more.
The web build does not set cookies. See
[`docs/legal/privacy.md`](privacy.md) for the full statement.

## Your account

- An account is for one person. Keep its password to yourself;
  anyone who signs in with it can read and change the work stored
  in it.
- You can delete it at any time from _Account → Delete account_.
  That removes the account and every copy of your work stored in
  it, and leaves your own devices as they are.
- Do not create accounts in bulk, probe another person's account,
  or use the account service to store anything but your own
  Kingfisher work. An account used that way may be removed.
- A synced copy is not a backup you control. Keep one with
  _Settings → Database → Export backup_ if the work matters to you.

## Engine binaries

The native engines Kingfisher can install (Stockfish, Halogen,
PlentyChess, Stormphrax, Viridithas, Lc0) carry their own
licences, recorded in [`docs/ENGINES.md`](../ENGINES.md) and
in the catalogue row inside the application. **Native engines
run with your user account's permissions and are not
sandboxed.** You agree to that by installing one.

## No professional advice

Kingfisher is a chess research tool, not a chess coach. The
Training, Repertoire and Review workflows help you organise
your study; they do not decide what to study, and they do not
take responsibility for the result. Nothing the application
shows is a substitute for a coach, a tournament, or the
opponent across the board.

## Changes to these terms

This page may be updated. Material changes will be listed in
[`CHANGELOG.md`](../../CHANGELOG.md). If a change affects a
right or a warranty, the change will not be retroactive.

## Contact

The maintainer can be reached through the public issue tracker
at [github.com/mardakurt/kingfisher](https://github.com/mardakurt/kingfisher/issues).
For security, see [`SECURITY.md`](../../SECURITY.md).
