import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

export function SecurityPage({ issuesUrl }: { issuesUrl: string }): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Security"
      title="The controls actually in the product."
      lede="This page describes the security controls that are in code, not a marketing claim about the product. Every item below maps to a file or a header in the running deployment. The technical policy is in SECURITY.md."
    >
      <h2 id="supported">Supported versions</h2>
      <p>Only the most recent public release receives security fixes.</p>
      <table>
        <thead>
          <tr>
            <th>Surface</th>
            <th>Version</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Web application</td>
            <td>Kingfisher 1.1</td>
            <td>Current. Hosted at the Vercel landing/studio host.</td>
          </tr>
          <tr>
            <td>macOS application</td>
            <td>Kingfisher 1.1.0</td>
            <td>
              Apple Silicon DMG, signed with Developer ID and <strong>notarised by Apple</strong>;
              opens with a double-click.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Older release candidates are not patched. If a regression is reported against one, the
        answer is to upgrade.
      </p>

      <h2 id="web">Browser / web application</h2>
      <ul>
        <li>
          <strong>Content Security Policy</strong> — <code>vercel.json</code> ships a strict CSP
          with <code>default-src self</code>, no third-party <code>script-src</code>,{}
          <code>frame-ancestors none</code>, <code>base-uri self</code>,{}
          <code>object-src none</code>. The only <code>script-src</code> allowances are{}
          <code>self</code>, <code>wasm-unsafe-eval</code> (Stockfish WebAssembly) and{}
          <code>unsafe-inline</code> (no scripts are inlined; this allowance is retained for Next.js
          style attributes and does not allow arbitrary inline JavaScript).
        </li>
        <li>
          <strong>Cross-Origin-Opener-Policy: same-origin</strong> and{}
          <strong>Cross-Origin-Embedder-Policy: credentialless</strong> are sent on every response,
          which is what enables <code>SharedArrayBuffer</code> for the Stockfish multi-threaded
          build.
        </li>
        <li>
          <strong>HSTS</strong> with <code>max-age=31536000; includeSubDomains; preload</code> and a
          {}
          <strong>Referrer-Policy: strict-origin-when-cross-origin</strong> header on every
          response.
        </li>
        <li>
          <strong>Permissions-Policy</strong> disables <code>camera</code>, <code>microphone</code>,
          {}
          <code>geolocation</code> and <code>interest-cohort</code> (FLoC) at the document level.
        </li>
        <li>
          <strong>Trusted remote origins</strong> for the applications network calls are listed in{' '}
          <code>connect-src</code>: the applications own host, the GitHub Pages data mirror,
          Lichess, and the desktop companions loopback range. Any other host is refused at the CSP
          layer.
        </li>
        <li>
          <strong>External link restrictions</strong> — outbound links are validated against an
          allow-list before the application will follow them; see{}
          <code>src/middleware-host-rules.ts</code> and <code>src/lib/redirect-validation.ts</code>.
        </li>
        <li>
          <strong>Downloaded data is verified.</strong> Every reference-pack chunk and every managed
          engine binary is checked against a SHA-256 recorded in the manifest before it is used; a
          mismatch is reported, never silently accepted. See <code>src/reference/install.ts</code>,
          {}
          <code>src/engine/manager.ts</code> and <code>THIRD_PARTY_DATA.md</code>.
        </li>
        <li>
          <strong>Decompression bounds</strong> — every decompression path uses{}
          <code>DecompressionStream</code> with an explicit byte budget and rejects a chunk whose
          decompressed size exceeds the manifests record.
        </li>
        <li>
          <strong>IndexedDB streaming cache</strong> — the explorer caches shards in IndexedDB with
          a byte budget and a TTL; cached bytes are re-verified against the manifest before they are
          reused.
        </li>
        <li>
          <strong>Backup portability</strong> — backups are portable JSON with the same
          schema-versioned envelope as persistence; see <code>docs/deployment.md</code>.
        </li>
      </ul>

      <h2 id="macos">macOS application</h2>
      <ul>
        <li>
          The desktop shell is <strong>Electron</strong> with <code>contextIsolation: true</code>,{}
          <code>nodeIntegration: false</code>, <code>sandbox: true</code> for the renderer, and a
          preload that exposes a typed bridge. The bridge returns <code>null</code> in a browser, so
          the same application is safe to serve over a public origin.
        </li>
        <li>
          The companion&rsquo;s loopback server authenticates every request except{' '}
          <code>/health</code> with a pairing token the shell mints in memory on each launch and
          never writes to disk; the shell and the companion are the only two processes that ever
          hold it. Cross-origin requests are refused by CORS.
        </li>
        <li>
          The application is signed with a <strong>Developer ID Application</strong> certificate
          with the Hardened Runtime, notarised by Apple, and stapled; the build refuses to sign a
          bundle missing any required runtime file and launches the notarised application before it
          makes a disk image.
        </li>
        <li>
          <strong>Native engines are not sandboxed.</strong> They run with the users own
          operating-system permissions, and a settings panel checkbox is the only thing that
          prevents them from being launched. This is documented in the Settings → Engine dialog and
          in <code>AGENTS.md</code>. Do not describe managed engines as sandboxed.
        </li>
        <li>
          The window cannot open a file that was not chosen in a dialog or dropped on the window;
          there is no <code>readFile(path)</code> on the bridge.
        </li>
        <li>
          The shell holds no chess state. A desktop feature that needs a second copy of the board,
          the move tree, the engine session or the query is a bug in the arrangement, not a feature
          of it.
        </li>
      </ul>

      <h2 id="does-not">What the product deliberately does not do</h2>
      <ul>
        <li>
          <strong>No cross-device Sync.</strong> Studies, repertoire, training, notes and
          preferences are local to one browser profile. The documented way to move work between
          machines is <em>Settings → Database → Export backup</em> and Import on the other side.
        </li>
        <li>
          <strong>No telemetry, no analytics, no third-party scripts.</strong> The web build does
          not load Google Analytics, Plausible, Hotjar, Segment, or any equivalent. CSP would refuse
          them anyway.
        </li>
        <li>
          <strong>No advertising cookies, no advertising scripts.</strong> The web build does not
          set any cookie; what state the application needs is held in <code>localStorage</code> and
          IndexedDB, scoped to the origin.
        </li>
        <li>
          <strong>No background update.</strong> The macOS application checks for a newer release
          only when you choose <em>Kingfisher → Check for Updates…</em>, and installs one only when
          you click <em>Install Update</em>; the download is verified against the release feed and
          your work is saved before the application is replaced. The web build is whatever is
          currently deployed; if a fix is urgent, a manual refresh picks it up.
        </li>
      </ul>

      <h2 id="report">How to report a vulnerability</h2>
      <p>
        <strong>Do not</strong> open a public GitHub issue, discussion, tweet or forum post for a
        security problem. Public issues are indexed by search engines and will be read by every
        attacker in the world before a fix is in the next release.
      </p>
      <p>
        Use the <strong>private</strong> GitHub Security Advisory flow:
      </p>
      <p>
        <a href="https://github.com/mardakurt/kingfisher/security/advisories/new" rel="noopener">
          https://github.com/mardakurt/kingfisher/security/advisories/new
        </a>
      </p>
      <p>
        If the GitHub security flow is unavailable for any reason, open a private issue at the same
        repository with the word <code>SECURITY:</code> at the start of the title and{}
        <strong>without</strong> exploit detail in the body — the maintainer will move the
        conversation to the private advisory flow.
      </p>
      <p>The report should include:</p>
      <ul>
        <li>
          the affected version (e.g. <code>Kingfisher 1.1</code> for the web build or{}
          <code>Kingfisher 1.1.0</code> and its build number for the macOS application);
        </li>
        <li>a minimal reproduction;</li>
        <li>what you observed and what you expected;</li>
        <li>any workarounds you tried.</li>
      </ul>
      <p>
        A diagnostic export from <em>Settings → Diagnostics</em> is safe to attach. The export never
        includes Lichess tokens, API keys, the companion pairing token, home-directory paths or full
        PGN libraries.
      </p>

      <h2 id="expect">What to expect</h2>
      <p>The maintainer aims to:</p>
      <ul>
        <li>acknowledge the report within seven days;</li>
        <li>ship a fix in the next release, or sooner if the issue is severe;</li>
        <li>publish a CVE if the report warrants one;</li>
        <li>
          credit the reporter in the release notes (unless the reporter prefers to remain
          anonymous).
        </li>
      </ul>

      <h2 id="out-of-scope">Out of scope</h2>
      <ul>
        <li>
          <strong>Engine binary vulnerabilities.</strong> Kingfisher verifies the SHA-256 of every
          engine it downloads against the manifest shipped in the repository, but the engines
          themselves are third-party and are covered by their own security policies.
        </li>
        <li>
          <strong>Reference data vulnerabilities.</strong> Kingfisher verifies the SHA-256 of every
          chunk it downloads against the manifest shipped in the data repository.
        </li>
        <li>
          <strong>
            Phishing, social engineering, or supply-chain attacks on the users machine.
          </strong>
          {}
          Kingfisher is local-first; the product is not a hosted service.
        </li>
      </ul>

      <h2 id="non-security">Non-security issues</h2>
      <p>
        For bugs, regressions and product questions, open an issue at{}
        <a href={issuesUrl} rel="noopener">
          the issue tracker
        </a>
        . Paste the <em>Settings → Diagnostics → Copy support information</em> line so the report
        includes version, machine and source/engine state.
      </p>
    </DocsLayout>
  );
}
