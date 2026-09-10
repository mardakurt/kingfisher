import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

export function TermsPage(): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Terms"
      title="The licence in plain words."
      lede="Kingfisher is open-source software published under the MIT licence. This page is the human-readable summary of what you can and cannot expect from the product. The full source of truth is the LICENSE file."
    >
      <h2 id="as-is">The software is provided “as is”</h2>
      <p>
        Kingfisher is provided <strong>as is</strong>, without warranty of any kind, express or
        implied, including but not limited to the warranties of merchantability, fitness for a
        particular purpose and noninfringement. In no event shall the authors or copyright holders
        be liable for any claim, damages or other liability, whether in an action of contract, tort
        or otherwise, arising from, out of or in connection with the software or the use or other
        dealings in the software.
      </p>
      <p>That is the MIT licences own wording, in its own words. It means exactly what it says.</p>

      <h2 id="correctness">No warranty of correctness</h2>
      <p>
        Kingfisher is a chess research tool. The engine analysis it shows is the engines view, the
        reference data it queries is the data the upstream published, and the assessment you reach
        with it is your own. Kingfisher does not certify that a move is good, that an opening is
        “best”, that a result is “correct”, or that any number it displays is a fact about a chess
        position rather than a measurement of how a population played it.
      </p>
      <p>
        A statistic labelled <em>15,432 games</em> is a count of games in a specific upstream
        archive. A statistic labelled <em>Wins 53% · 4,200 games</em> is a sample statistic on that
        count. Kingfisher does not extrapolate, blend, or rank sources. The application will
        sometimes refuse to answer a question; that is a deliberate product decision, not a defect.
      </p>

      <h2 id="availability">No warranty of availability</h2>
      <p>
        The web build is hosted on Vercel. Vercels own availability terms apply. The macOS Preview
        is a downloadable DMG; once downloaded, the application runs on your machine and your
        machines availability governs. There is no service-level commitment on the web or the
        desktop, and the maintainer reserves the right to take a deployment offline for maintenance,
        change a domain, change a host, or change any public URL with the same notice the source
        repository receives.
      </p>
      <p>
        The “current canonical landing” and “current canonical studio” URLs are recorded in{}
        <code>docs/product/public-claims.md</code> and surfaced as a single canonical source (
        <code>src/release/public-urls.ts</code> in this repository).
      </p>

      <h2 id="data">Reference data is licensed by its publisher</h2>
      <p>
        Each reference pack and each upstream provider carries its own licence, recorded in the pack
        manifest and in <a href="/data-licences">Data &amp; licences</a>. Kingfisher redistributes
        data only where the licence permits, with the attribution the licence requires.{}
        <strong>Your</strong> use of a pack inherits the packs licence; if you want to redistribute
        a pack, read the licence, not this page.
      </p>

      <h2 id="account">Account, sync, telemetry</h2>
      <p>
        There is no Kingfisher account, no Sync, and no telemetry. The web build does not set
        cookies. See the <a href="/privacy">Privacy</a> page for the full statement.
      </p>

      <h2 id="engines">Engine binaries</h2>
      <p>
        The native engines Kingfisher can install (Stockfish, Halogen, PlentyChess, Stormphrax,
        Viridithas, Lc0 and others) carry their own licences, recorded in{}
        <code>docs/ENGINES.md</code> and in the catalogue row inside the application.{}
        <strong>
          Native engines run with your user accounts permissions and are not sandboxed.
        </strong>
        {}
        You agree to that by installing one.
      </p>

      <h2 id="advice">No professional advice</h2>
      <p>
        Kingfisher is a chess research tool, not a chess coach. The Training, Repertoire and Review
        workflows help you organise your study; they do not decide what to study, and they do not
        take responsibility for the result. Nothing the application shows is a substitute for a
        coach, a tournament, or the opponent across the board.
      </p>

      <h2 id="changes">Changes to these terms</h2>
      <p>
        This page may be updated. Material changes will be listed in <code>CHANGELOG.md</code>. If a
        change affects a right or a warranty, the change will not be retroactive.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        The maintainer can be reached through the public issue tracker at{}
        <a href="https://github.com/mardakurt/kingfisher/issues" rel="noopener">
          github.com/mardakurt/kingfisher/issues
        </a>
        . For security, see the <a href="/security">Security</a> page.
      </p>
    </DocsLayout>
  );
}
