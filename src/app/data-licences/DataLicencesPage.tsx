import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

export function DataLicencesPage(): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Data & licences"
      title="Where every number in Kingfisher comes from."
      lede="The authoritative technical record is in each pack's manifest. This page is the human-readable summary. If a licence is not present here, the data is Kingfisher's own."
    >
      <h2 id="bundled">Bundled with the application</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Contents</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>kingfisher-starter</code> pack
            </td>
            <td>172,376 over-the-board games, 246,870 position aggregates</td>
            <td>
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">
                CC BY-SA 4.0
              </a>
            </td>
          </tr>
          <tr>
            <td>Lichess opening classification</td>
            <td>3,810 named positions, ECO codes</td>
            <td>
              <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener">
                CC0 1.0
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        The bundled pack ships as static assets in the application; the opening classification is
        replayed through Kingfishers own rules code and the result is a generated TypeScript file.
        Both are described in <code>THIRD_PARTY_DATA.md</code>.
      </p>

      <h2 id="installed">Installed on demand</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>What it answers</th>
            <th>Licence</th>
            <th>Distribution</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>kingfisher-elite-otb</code>
            </td>
            <td>What was played in elite over-the-board games</td>
            <td>CC BY-SA 4.0</td>
            <td>Public data mirror</td>
          </tr>
          <tr>
            <td>
              <code>kingfisher-recent-theory</code>
            </td>
            <td>What is being played recently</td>
            <td>CC BY-SA 4.0</td>
            <td>Public data mirror</td>
          </tr>
          <tr>
            <td>
              <code>kingfisher-high-rated-online</code>
            </td>
            <td>What 2400+ Lichess players are playing online</td>
            <td>CC0 1.0</td>
            <td>Public data mirror</td>
          </tr>
        </tbody>
      </table>
      <p>
        Every chunk is verified against the manifests SHA-256 before it is used; a failed
        verification is reported, the bytes are discarded, and the user is told. See{' '}
        <code>docs/data/reference-packs.md</code> for the exact upstream dates, ratings filters and
        shard sizes.
      </p>

      <h2 id="online">Online queries the application makes</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>When the application calls it</th>
            <th>Licence / terms</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lichess Explorer</td>
            <td>
              <em>Explorer → Online</em> (a user opt-in, not the default for installed packs)
            </td>
            <td>Public, no key needed</td>
          </tr>
          <tr>
            <td>Lichess tablebase</td>
            <td>
              <em>Endgame tablebase</em> (a user opt-in, when a position falls to few pieces)
            </td>
            <td>Free for non-commercial use</td>
          </tr>
          <tr>
            <td>Lichess account</td>
            <td>
              <em>Sign in with Lichess</em> (PKCE OAuth, no scopes beyond “read your games”)
            </td>
            <td>Lichess terms apply</td>
          </tr>
          <tr>
            <td>Chess.com account</td>
            <td>
              <em>Sign in with Chess.com</em> (public API by username)
            </td>
            <td>Chess.com API terms</td>
          </tr>
        </tbody>
      </table>
      <p>
        The CSP in <code>vercel.json</code> is the network allow-list; any host not on it is refused
        at the browser layer.
      </p>

      <h2 id="engines">Engine binaries</h2>
      <p>
        Engine binaries are not committed. They are downloaded on demand by the application,
        recorded with a SHA-256, and qualified by a real search before they are allowed to answer a
        position. The full list and the licence each engine carries is in{}
        <code>docs/ENGINES.md</code>.
      </p>

      <h2 id="not-used">What is deliberately not used</h2>
      <p>
        These were investigated and rejected; the reasons are in <code>THIRD_PARTY_DATA.md</code>.
        The list is preserved because the next person to look at the problem should not have to
        repeat the work.
      </p>
      <ul>
        <li>FIDE player list (no redistribution licence)</li>
        <li>PGN Mentor (no stated terms)</li>
        <li>
          <code>rozim/ChessData</code> (no licence, no provenance statement)
        </li>
        <li>Kaggle / figshare “all games” archives (re-uploads with unclear origin)</li>
        <li>ChessBase, Chess.com master databases (commercial)</li>
        <li>
          Lichess standard-games export (CC0, but the population is amateur online blitz — not the
          question an over-the-board reference is for; not a fit for what the packs are meant to
          answer)
        </li>
      </ul>

      <h2 id="affiliation">Affiliation</h2>
      <p>
        Kingfisher is not affiliated with, endorsed by, or sponsored by Lichess, Chess.com, FIDE,
        ChessBase, Chessable, the broadcast organisations whose games appear in the Lichess archive,
        or any of the engine authors. The application redistributes data only where the sources
        licence explicitly permits it, and the licence, source and provenance of every pack is
        recorded in that packs manifest.
      </p>
    </DocsLayout>
  );
}
