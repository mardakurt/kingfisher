import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

export function PrivacyPage(): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Privacy"
      title="What Kingfisher collects — and what it does not."
      lede="Kingfisher is local-first. Your studies, repertoire, training, notes, recent work and preferences are stored in the browser profile or in the desktop application's local profile directory. Kingfisher does not run a server of its own. When you use a feature that talks to a third party — Lichess, Chess.com, the reference-data mirror — this page tells you what is sent and why."
    >
      <h2 id="short">Short version</h2>
      <ul>
        <li>
          <strong>No Kingfisher account.</strong> You do not sign in to Kingfisher. There is no
          Kingfisher-controlled email capture, mailing list, profile or backend. The local profile
          that holds a display name you picked (Phase 55) lives in IndexedDB on the web and in the
          desktop profile directory on macOS; nothing about it leaves your machine.
        </li>
        <li>
          <strong>Page views and load times are counted, and that is all.</strong> The website uses
          Vercel Web Analytics and Vercel Speed Insights. For each page view it records the page
          path, the referrer, and what the request already carries — the country the connection
          comes from, the browser and operating-system family, the device class; for each page load
          it records the timings your browser already computes (the Core Web Vitals) with the
          connection type and device class. Neither sets a cookie or stores an identifier on your
          device; Vercel derives a per-day visitor hash on its side and discards the address. Query
          strings and fragments are stripped before anything is sent, so a position in a URL never
          leaves your browser. Nothing about your chess — positions, studies, games, engine lines —
          is ever part of either. There is no error-reporting service, no session replay, no “is the
          user still here?” ping. The Mac application loads none of this.
        </li>
        <li>
          <strong>Third-party services are asked for, never assumed.</strong> Lichess and Chess.com
          only see requests that come from a feature you opened, signed in or queried; the reference
          mirror only fetches chunks when a pack needs them. Each call is described in{' '}
          <a href="#network">Network requests</a>.
        </li>
        <li>
          <strong>Feedback is user-initiated.</strong> The in-app Feedback button is a deliberate
          channel you open yourself. Nothing leaves the browser until you click Send. See{' '}
          <a href="#feedback">Feedback</a> for what the submission carries and where it goes.
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
        items, model games, recent positions, notes, the display name you picked, and preferences —
        is stored in the browser or in the desktop profile. It is held under the application&apos;s
        own storage key and never read by another origin. The structure is documented in{' '}
        <code>AGENTS.md</code> and the schema is versioned.
      </p>
      <p>
        A <code>localStorage</code> entry holds the small key/value preferences (theme, piece set,
        board theme, sound level, last-active route). The contents are visible in the browsers
        developer tools and are an inert JSON object with no PII beyond what you yourself typed (a
        study name, a repertoire name, your display name).
      </p>
      <p>
        The bulk of your work is in <strong>IndexedDB</strong>. IndexedDB is origin-scoped, so a
        profile on <code>kingfisherchess.app</code> is not the same database as one on{' '}
        <code>localhost</code>, in another browser, or in another browser profile. If you move
        between them, the work does not move with you — the supported way to move work between
        machines, browsers and profiles is the{' '}
        <em>Settings → Database → Export backup / Import backup</em> flow, which produces and
        consumes a versioned JSON file under your control.
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
          <strong>Lichess</strong> (<code>lichess.org</code>), used when:
          <ul>
            <li>
              you sign in to Lichess from Kingfisher (OAuth with PKCE, no scopes beyond “read your
              games”; the token is stored in IndexedDB and never leaves the device);
            </li>
            <li>
              you ask for games from a Lichess username via{' '}
              <em>Settings → Accounts → Add an account → Lichess</em>. The username and the games it
              returned are recorded in your local collection; nothing else is sent.
            </li>
            <li>
              you query the Lichess-hosted Explorer or tablebase. Each call is the literal question
              you asked — a position, or the board state for a tablebase probe — and Lichess&apos;s
              answer. Nothing about your studies, your repertoire, or your account on Kingfisher
              goes with it.
            </li>
          </ul>
        </li>
        <li>
          <strong>Chess.com</strong> (<code>api.chess.com</code>), used only when you ask for games
          from a Chess.com username via <em>Settings → Accounts → Add an account → Chess.com</em>.
          The username and the games it returned are recorded in your local collection. Chess.com
          never sees a Kingfisher identifier or any other identifier of yours.
        </li>
        <li>
          <strong>The public data mirror</strong> at{' '}
          <code>mardakurt.github.io/kingfisher-data</code> for reference-pack manifests and chunks.
          Every chunk is verified against the manifest&apos;s SHA-256 before it is used. A failed
          verification is reported and the bytes are discarded.
        </li>
        <li>
          <strong>The application&apos;s own origin</strong> for the static assets (Stockfish WASM,
          piece art, the marketing/landing assets, the app code itself).
        </li>
      </ul>
      <p>
        The Content-Security-Policy in <code>vercel.json</code> is the enforced allow-list. Any
        other host is refused at the browser layer, and the desktop companion&apos;s loopback server
        is a separate trust boundary with its own authentication.
      </p>

      <h2 id="cookies">Cookies and trackers</h2>
      <p>
        The web build sets <strong>no cookies</strong> in the strict sense: no{' '}
        <code>Set-Cookie</code> response header, no <code>document.cookie</code> writes, no{' '}
        <code>httpOnly</code> session. The application uses <code>localStorage</code> and IndexedDB
        instead. The browser may still hold its own state (service worker cache, IndexedDB) which is
        required for the product to work across reloads.
      </p>
      <p>
        No advertising tag and no cross-site tracker is loaded. The only measurements are Vercel Web
        Analytics and Speed Insights, described above, served from this origin. A network panel open
        during a normal session will show this origin (including <code>/_vercel/insights/view</code>
        , the page-view beacon, and <code>/_vercel/speed-insights/vitals</code>, the load-timing
        beacon), Lichess (if you have signed in or queried Lichess), Chess.com (if you have queried
        Chess.com) and the data mirror (if you have used a reference source). Nothing else.
      </p>

      <h2 id="hosting">Hosting</h2>
      <p>
        The web build is hosted on Vercel. Vercel sees every request the way any hosting provider
        does, and the request log will contain the IP address you connected from, the URL you
        requested and the user agent your browser sent. Vercel&apos;s own data-handling is described
        in their privacy policy; the Kingfisher project does not put anything additional in those
        logs. There is no Kingfisher-side server processing them.
      </p>

      <h2 id="account">Account status</h2>
      <p>
        There is no Kingfisher account, no Kingfisher sign-in, and no Kingfisher-controlled profile
        on a server. The local profile that holds a display name (Phase 55) is one row in your own
        IndexedDB or desktop profile directory; it does not sync to anywhere. The <em>Accounts</em>{' '}
        section of Settings records Lichess and Chess.com usernames so their games can be pulled
        into your local collection; that linkage lives in your IndexedDB and desktop profile, and is
        the only thing that connects a Lichess username to a Kingfisher install.
      </p>
      <p>
        If a Kingfisher-controlled account is ever added, this page will be updated before any data
        is collected.
      </p>

      <h2 id="sync">Sync status</h2>
      <p>
        <strong>There is no cloud sync today.</strong> Your work lives on the machine you created it
        on, and Kingfisher does not push it anywhere. To move work between machines, two browsers,
        or a browser and a desktop install: <em>Settings → Database → Export backup</em> on the
        source machine; <em>Settings → Database → Import backup</em> on the destination machine. The
        backup file is portable JSON, is held on disk under your control, and is never sent to a
        server.
      </p>
      <p>
        A future Kingfisher version may add an opt-in cloud sync. If it does, this page will be
        updated first, the change will be listed in <code>CHANGELOG.md</code>, and the sync will be
        off by default.
      </p>

      <h2 id="feedback">Feedback</h2>
      <p>
        The in-app Feedback dialog sends a single submission only when you press the{' '}
        <em>Send feedback</em> button. Nothing is uploaded automatically, and the form does not open
        a connection on its own.
      </p>
      <p>The submission carries:</p>
      <ul>
        <li>The category you picked (one of five).</li>
        <li>The message you typed, up to 4000 characters.</li>
        <li>
          The current board position (FEN) — only when you tick <em>Include current position</em>.
          The default is off.
        </li>
        <li>
          A short technical-information block (app version, surface, browser, viewport, storage
          state) — only when you tick <em>Include technical information</em> and preview it before
          sending.
        </li>
      </ul>
      <p>
        The submission never carries your games, studies, chapters, repertoire, training items,
        notes, preferences, Lichess or companion credentials, or filesystem paths.
      </p>
      <p>
        Where it goes: when the operator has configured the secure sink (a fine-grained GitHub token
        scoped to a single feedback repository), the submission is forwarded there server-side,
        never from the browser. When no sink is configured, the submission is validated,
        acknowledged with a reference handle, and the operator sees it in the server log; the dialog
        also offers an “Open GitHub feedback” button that opens a pre-filled issue in a new tab.
      </p>
      <p>
        The endpoint enforces same-origin requests, a 64 KB body ceiling, a per-IP rate limit, a
        minimum form-fill time, and a honeypot field the dialog never fills. The renderer never sees
        the GitHub token. The fallback link is the user&apos;s explicit choice, not an automatic
        redirect.
      </p>

      <h2 id="children">Children</h2>
      <p>
        Kingfisher is not directed at children. The application does not knowingly collect
        information from children, because it does not collect information from anyone.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        If a future Kingfisher change affects this policy, the change will be listed in{' '}
        <code>CHANGELOG.md</code> and this page will be updated before the change ships.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        There is no Kingfisher-controlled inbox for privacy requests. For a security issue, see{' '}
        <a href="/security">Security</a>. For a non-security question, open an issue on{' '}
        <a href="https://github.com/mardakurt/kingfisher/issues" rel="noopener">
          GitHub
        </a>
        .
      </p>
    </DocsLayout>
  );
}
