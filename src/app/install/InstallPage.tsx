import type { JSX } from 'react';
import { DocsLayout } from '@/app/_docs/DocsLayout';

/**
 * The user-facing install guide for the macOS Preview.
 *
 * The canonical Markdown lives in `docs/release/install-macos.md`
 * and is the source of truth for the public product. This page
 * is a styled render of the same content and is the URL the
 * landing page links to. The two are kept in sync by hand and
 * cross-checked by `npm run docs:check`.
 */
export function InstallPage({
  downloadUrl,
  repositoryUrl,
}: {
  downloadUrl: string;
  repositoryUrl: string;
}): JSX.Element {
  return (
    <DocsLayout
      eyebrow="Install guide"
      title="Installing Kingfisher on macOS"
      lede="The honest version. Kingfisher 1.0.0 for macOS is a Preview build — code-signed with an Apple Development identity, not a notarised Developer ID release. Gatekeeper may therefore block the first launch. This page tells you exactly what to do about that, without disabling anything system-wide."
    >
      <h2 id="what-you-need">What you need</h2>
      <ul>
        <li>
          A Mac with <strong>Apple Silicon</strong> (M1 or later), running{}
          <strong>macOS 11 (Big Sur)</strong> or later.
        </li>
        <li>
          About <strong>1 GB</strong> of free disk space for the application and a fresh study
          workspace.
        </li>
        <li>Nothing else. No Node, no terminal, no database, no account.</li>
      </ul>

      <h2 id="download">1. Download</h2>
      <p>
        Get the DMG from the latest release on GitHub:{}
        <a href={`${repositoryUrl}/releases/latest`} rel="noopener">
          {repositoryUrl}/releases/latest
        </a>
        .
      </p>
      <p>
        The file is <code>Kingfisher-1.0.0-arm64.dmg</code>. The download button on the landing page
        points at the same file. If the file you downloaded has a different name, the release page
        is the source of truth — stop and check the SHA-256 listed there.
      </p>
      <p>
        <a className="btn" href={downloadUrl} rel="noopener">
          Download Kingfisher-1.0.0-arm64.dmg
        </a>
      </p>

      <h2 id="verify">2. (Optional) verify the download</h2>
      <p>The release page lists the SHA-256 of the DMG. To check yours:</p>
      <pre>
        <code>shasum -a 256 ~/Downloads/Kingfisher-1.0.0-arm64.dmg</code>
      </pre>
      <p>
        The output should match the value on the release page. If it does not, the download was
        corrupted or tampered with — delete it and re-download.
      </p>

      <h2 id="open">3. Open the DMG</h2>
      <p>
        Double-click <code>Kingfisher-1.0.0-arm64.dmg</code> in your Downloads folder. A window
        opens with the Kingfisher icon and a shortcut to Applications.
      </p>

      <h2 id="install">4. Move to Applications</h2>
      <p>
        Drag the Kingfisher icon onto the Applications shortcut. Eject the disk image (right-click
        the desktop icon, <strong>Eject</strong>, or use the eject button next to it in Finder).
      </p>

      <h2 id="gatekeeper">5. First launch — Gatekeeper</h2>
      <p>
        Open Kingfisher from Applications or Spotlight. The first launch is the one Gatekeeper cares
        about.
      </p>
      <p>
        <strong>Kingfisher 1.0.0 is code-signed but not notarised.</strong> On a Mac that has not
        seen this build, macOS will refuse to open it and say the application is <em>damaged</em> or
        {}
        <em>cannot be checked for malicious software</em>. That is not a diagnosis of the file.
        Notarisation is an Apple service that requires a <strong>Developer ID Application</strong>
        {}
        certificate, and this build does not have one — the identity it was signed with is a
        development certificate, which is a different kind. Nothing about the application changes
        when the right certificate exists; only the ability to hand you the installer does.
      </p>
      <p>
        <strong>The safe, supported way through Gatekeeper:</strong>
      </p>
      <ol>
        <li>
          <strong>Right-click</strong> (or <strong>Control-click</strong>) Kingfisher in
          Applications and choose <strong>Open</strong>. A dialog asks you to confirm.
        </li>
        <li>
          Click <strong>Open</strong> in the dialog. macOS records the exception for this copy of
          the application, so the second launch is silent.
        </li>
        <li>From then on, double-clicking Kingfisher in Applications is enough.</li>
      </ol>
      <p>
        If macOS refuses even that, the file is carrying a quarantine attribute from the browser.
        Open <strong>System Settings → Privacy &amp; Security</strong>, scroll to the{}
        <strong>Security</strong> section, and click <strong>Open Anyway</strong> beside the message
        about Kingfisher. You may need to scroll past the recent entries to find it. The same
        exception is then recorded.
      </p>
      <p>
        <strong>Do not turn Gatekeeper off.</strong> <code>spctl --master-disable</code> and its
        relatives disable a system-wide protection for every application on the machine, for as long
        as you leave it off, to solve a problem with one file. Nothing in this Preview is worth
        that, and Kingfisher will not ask you to do it.
      </p>

      <h2 id="first-launch">6. First five minutes</h2>
      <p>Kingfisher opens on the analysis board with a game position and the tools beside it.</p>
      <ol>
        <li>
          <strong>Play a few moves</strong> on the board, or click one in the Explorer.
        </li>
        <li>
          <strong>
            Press <em>Analyse this position</em>.
          </strong>
          {}
          Stockfish 18 runs in the application; nothing is downloaded and nothing is sent anywhere.
        </li>
        <li>
          <strong>
            Open the <em>Explorer</em> tool.
          </strong>
          {}
          It answers from Kingfisher Starter — 172,376 over-the-board games — and keeps answering
          twenty full moves in.
        </li>
        <li>
          <strong>
            Open the <em>Theory Book</em> tool.
          </strong>
          {}
          It names the opening you are in, with its ECO code, and shows no numbers at all: a name is
          the only claim it makes.
        </li>
        <li>
          <strong>Search a player.</strong> Players → type “Carlsen”.
        </li>
        <li>
          <strong>Save something.</strong> Save to study, then quit and reopen. It is still there.
        </li>
      </ol>

      <h2 id="updating">7. Updating</h2>
      <p>There is no auto-update. When a new build is published:</p>
      <ol>
        <li>Quit Kingfisher.</li>
        <li>Download the new DMG from the release page.</li>
        <li>
          Drag the new <code>Kingfisher.app</code> over the old one in Applications. macOS asks
          whether to replace — confirm.
        </li>
        <li>
          Your studies, repertoire, notes and preferences are kept; they live in{}
          <code>~/Library/Application Support/Kingfisher/</code> and are not touched by replacing
          the application bundle.
        </li>
      </ol>

      <h2 id="uninstalling">8. Uninstalling</h2>
      <ol>
        <li>
          <strong>Export a backup first</strong> if you want to keep your studies:{}
          <em>Settings → Database → Export backup</em>.
        </li>
        <li>Quit Kingfisher.</li>
        <li>Drag Kingfisher from Applications to the Trash.</li>
        <li>
          Optionally, delete the application-support folder to remove the last copy of your local
          work: <code>~/Library/Application Support/Kingfisher</code>.
        </li>
      </ol>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3 id="damaged">“Kingfisher is damaged”</h3>
      <p>
        That is Gatekeeper saying the same thing as{}
        <em>cannot be checked for malicious software</em>. Go back to step 5; right-click → Open is
        the supported fix.
      </p>

      <h3 id="port">“Another program is using its port”</h3>
      <p>
        That is deliberate. The desktop companion keeps your work at one fixed loopback port
        recorded in your profile, and Kingfisher would rather stop and tell you than open an empty
        workspace somewhere else. Close whatever is using the port it names, and open Kingfisher
        again.
      </p>

      <h3 id="no-window">Kingfisher did not get as far as a window</h3>
      <p>
        There is nothing on screen to copy from. The shell keeps its own log — launch, companion
        failures, quit — at{}
        <code>~/Library/Application Support/Kingfisher/logs/kingfisher.log</code>.
      </p>
      <p>
        The log is bounded to about a megabyte, it never leaves your machine on its own, and the
        companions pairing token is replaced with <code>[redacted]</code> before anything is
        written.
      </p>
      <p>
        <em>Settings → Diagnostics → Copy support information</em> puts eight lines on the
        clipboard: version, machine, which sources are ready, which engines started, whether the
        companion is up. Paste that into your report.
      </p>
      <p>
        <em>Copy full diagnostic report</em> is what to attach. Neither contains your games,
        studies, notes, tokens or keys.
      </p>

      <h3 id="report">A useful report is four sentences</h3>
      <p>What you were doing. What happened. What you expected. The support-information line.</p>

      <h2 id="optional">Optional, when you want it</h2>
      <p>None of this is needed to use Kingfisher, and none of it is part of first run.</p>
      <ul>
        <li>
          <strong>Native engines.</strong> <em>Settings → Engine</em>. Each is downloaded from the
          projects own release page, checked against a recorded SHA-256, and made to complete a real
          search before it is listed as ready. They run with your user accounts permissions and are
          not sandboxed; the interface says so.
        </li>
        <li>
          <strong>Local tablebases.</strong> <em>Settings → Companion → Browse…</em> and point it at
          a folder of Syzygy files. The probe helper is inside the bundle; there is nothing to
          compile.
        </li>
        <li>
          <strong>A Lichess or Chess.com account</strong>, to study your own games.
        </li>
        <li>
          <strong>Larger reference data.</strong> <em>Databases → Reference sources → Install</em>
          {}
          lists Elite OTB, Recent Theory and High-Rated Online. The install button does the full
          download + checksum + install for you. Sizes are honest; pick the pack that matches the
          question you actually have.
        </li>
      </ul>
    </DocsLayout>
  );
}
