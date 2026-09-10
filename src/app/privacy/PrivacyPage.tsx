import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

export function PrivacyPage(): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Privacy"
      title="What Kingfisher collects — and what it does not."
      lede="Kingfisher is local-first. Studies, repertoire, training, notes, recent work and preferences are stored in the browser profile or in the desktop application's local profile directory. Nothing about you or your work is sent to a Kingfisher server, because there is no Kingfisher server."
    >
      <h2 id="short">Short version</h2>
      <ul>
        <li>
          <strong>No account.</strong> You do not sign in. There is no sign-in to sign in with. The
          application does not know who you are.
        </li>
        <li>
          <strong>No telemetry.</strong> No analytics, no error reporting service, no session
          replay, no “is the user still here?” pings. The web build does not load any third-party
          script.
        </li>
        <li>
          <strong>No cookies.</strong> The web build does not set any cookie. Application state
          lives in <code>localStorage</code> and IndexedDB, scoped to the origin.
        </li>
        <li>
          <strong>No advertising.</strong> Nothing on the page or in the application is, was, or
          will be an advertisement.
        </li>
        <li>
          <strong>No client-side fingerprinting.</strong> No canvas fingerprint, no font
          enumeration, no hardware concurrency probes, no timezone sniff, no IP-to-country map, no
          “we know its you because of your machine.”
        </li>
      </ul>

      <h2 id="local-storage">Local storage</h2>
      <p>
        <strong>User-authored data</strong> — your studies, chapters, repertoire moves, training
        items, model games, recent positions, notes and preferences — is stored in the browser or in
        the desktop profile. It is held under the applications own storage key and never read by
        another origin. The structure is documented in <code>AGENTS.md</code> and the schema is
        versioned.
      </p>
      <p>
        A <code>localStorage</code> entry holds the small key/value preferences (theme, piece set,
        board theme, sound level, last-active route). The contents are visible in the browsers
        developer tools and are an inert JSON object with no PII beyond what you yourself typed (a
        study name, a repertoire name).
      </p>
      <p>
        The bulk of your work is in <strong>IndexedDB</strong>. IndexedDB is origin-scoped, so a
        profile on <code>kingfisher-roan.vercel.app</code> is not the same database as one on{}
        <code>kingfisher-chess.vercel.app</code> or one on <code>localhost</code>. If you move
        between them, the work does not move with you — the supported way to move work between
        machines and profiles is the <em>Settings → Database → Export backup / Import backup</em>
        {}
        flow, which produces and consumes a versioned JSON file under your control.
      </p>

      <h2 id="reference-cache">Reference cache</h2>
      <p>
        When you use the Explorer or a pack query, the application caches the response bytes in
        IndexedDB so a second query of the same shard does not redownload. The cache is
        byte-budgeted and is cleared on a fixed schedule. The cached bytes are not attributed, are
        not exported with your work and are not considered user data. They are technical
        infrastructure for the product.
      </p>
      <p>The cache is the same origin-scoped database as everything else; it does not sync.</p>

      <h2 id="network">Network requests</h2>
      <p>
        The web and desktop builds do not phone home. The <strong>only</strong> outbound network
        calls the application makes are the ones the product needs:
      </p>
      <ul>
        <li>
          <strong>Lichess</strong> (when you sign in or query Lichess-hosted resources):{}
          <code>lichess.org</code>, <code>api.chess.com</code>, <code>tablebase.lichess.ovh</code>,
          {}
          <code>explorer.lichess.ovh</code>. Each call is made because the user asked for the
          answer. Sign-in uses OAuth with PKCE and no scopes beyond “read your games”; the token is
          stored in IndexedDB and never leaves the device.
        </li>
        <li>
          <strong>The public data mirror</strong> at{}
          <code>mardakurt.github.io/kingfisher-data</code> for reference-pack manifests and chunks.
          Every chunk is verified against the manifests SHA-256 before it is used. A failed
          verification is reported and the bytes are discarded.
        </li>
        <li>
          <strong>The applications own origin</strong> for the static assets (Stockfish WASM, piece
          art, the marketing/landing assets, the app code itself).
        </li>
      </ul>
      <p>
        The Content-Security-Policy in <code>vercel.json</code> is the enforced allow-list. Any
        other host is refused at the browser layer, and the desktop companions loopback server is a
        separate trust boundary with its own authentication.
      </p>

      <h2 id="cookies">Cookies and trackers</h2>
      <p>
        The web build sets <strong>no cookies</strong> in the strict sense: no{}
        <code>Set-Cookie</code> response header, no <code>document.cookie</code> writes, no{}
        <code>httpOnly</code> session. The application uses <code>localStorage</code> and IndexedDB
        instead. The browser may still hold its own state (service worker cache, IndexedDB) which is
        required for the product to work across reloads.
      </p>
      <p>
        No third-party tracker, analytics or advertising tag is loaded. A network panel open during
        a normal session will show Lichess (if you have signed in or queried Lichess), the data
        mirror (if you have used a reference source) and the applications own origin. Nothing else.
      </p>

      <h2 id="hosting">Hosting</h2>
      <p>
        The web build is hosted on Vercel. Vercel sees every request the way any hosting provider
        does, and the request log will contain the IP address you connected from, the URL you
        requested and the user agent your browser sent. Vercels own data-handling is described in
        their privacy policy; the Kingfisher project does not put anything additional in those logs.
        There is no Kingfisher-side server processing them.
      </p>

      <h2 id="account">Account status</h2>
      <p>
        There is no Kingfisher account, no sign-in, no profile, no email capture, no mailing list.
        If a Kingfisher-controlled account is ever added, this page will be updated before any data
        is collected.
      </p>

      <h2 id="sync">Sync status</h2>
      <p>
        <strong>Cross-device Sync is not currently available.</strong> Your work lives on the
        machine you created it on. To move work between machines:{}
        <em>Settings → Database → Export backup</em> on the source machine;{}
        <em>Settings → Database → Import backup</em> on the destination machine. The backup file is
        portable JSON and is under your control at all times.
      </p>

      <h2 id="children">Children</h2>
      <p>
        Kingfisher is not directed at children. The application does not knowingly collect
        information from children, because it does not collect information from anyone.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        If a future Kingfisher change affects this policy, the change will be listed in{}
        <code>CHANGELOG.md</code> and this page will be updated before the change ships.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        There is no Kingfisher-controlled inbox for privacy requests. For a security issue, see{}
        <a href="/security">Security</a>. For a non-security question, open an issue on{}
        <a href="https://github.com/mardakurt/kingfisher/issues" rel="noopener">
          GitHub
        </a>
        .
      </p>
    </DocsLayout>
  );
}
