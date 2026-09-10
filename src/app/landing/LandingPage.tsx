import type { JSX } from 'react';
import { publicUrl } from '@/release/public-urls';

import './landing.css';

/**
 * The Kingfisher landing page.
 *
 * Served at the marketing origin. Every link that targets the
 * studio points at the studio's canonical URL (`publicUrl.studio`),
 * so a returning player who has the studio bookmarked opens it
 * directly without coming back through this page. The marketing
 * origin must never serve the studio.
 *
 * The landing component renders server-side; no event handlers,
 * analytics or third-party scripts. The static assets live under
 * `/landing/img/` and are served from the same origin as the
 * page so the application CSP, which is `default-src 'self'`,
 * accepts them.
 */
export function LandingPage(): JSX.Element {
  const studioUrl = publicUrl.studio;
  const repoUrl = publicUrl.repository;
  const releaseUrl = publicUrl.release;
  const downloadUrl = publicUrl.macosDmg;

  // JSON-LD for the public landing. Only fields that are
  // true and visible are included. `offers` reflects the free,
  // no-subscription, no-account product.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Kingfisher',
    alternateName: 'Kingfisher Chess',
    description:
      'A local-first chess research workstation for serious players. Opening research across separate evidence sources, Stockfish 18 in the browser, native engines on macOS, large personal databases, repertoire and review.',
    url: publicUrl.landing,
    applicationCategory: 'GameApplication',
    applicationSubCategory: 'Chess Analysis',
    operatingSystem: 'macOS 11+, Web (Chrome, Safari, Firefox, Edge)',
    softwareRequirements: 'WebAssembly, JavaScript, IndexedDB, Service Worker',
    downloadUrl: downloadUrl,
    softwareVersion: '1.0.0',
    datePublished: '2026-09-10',
    inLanguage: 'en',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    author: { '@type': 'Person', name: 'mardakurt', url: repoUrl },
    publisher: { '@type': 'Organization', name: 'Kingfisher', url: publicUrl.landing },
    license: 'https://github.com/mardakurt/kingfisher/blob/master/LICENSE',
    sourceOrganization: { '@type': 'Organization', name: 'Kingfisher' },
    featureList: [
      'Opening research across separate evidence sources',
      'Stockfish 18 in the browser',
      'Native engines on macOS',
      'Local-first persistence (IndexedDB)',
      'Reference data with verified provenance',
      'Repertoire, training, review',
      'No account, no telemetry, no subscription',
    ],
  };

  return (
    <div className="kf-landing">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="nav" role="banner">
        <a className="nav-brand" href="#top" aria-label="Kingfisher home">
          <span className="nav-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/img/kingfisher-mark.svg"
              alt=""
              width="28"
              height="28"
              decoding="async"
            />
          </span>
          <span className="nav-wordmark">Kingfisher</span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#why">Why</a>
          <a href="#research">Research</a>
          <a href="#engines">Engines</a>
          <a href="#local">Local-first</a>
          <a href="#macos">macOS</a>
        </nav>
        <a
          className="nav-cta"
          href={studioUrl}
          rel="noopener"
          aria-label="Launch Kingfisher (opens the studio on a separate origin)"
        >
          Launch
        </a>
      </header>

      <main id="main">
        <section id="top" className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <h1 className="hero-title">
                Chess research,
                <br />
                <span className="hero-title-accent">in one place.</span>
              </h1>
              <p className="hero-lede">
                Opening evidence, engines, databases, studies and repertoire.
                <br className="hero-lede-break" /> Together in one local-first workspace.
              </p>
              <div className="hero-cta-row">
                <a
                  className="btn btn-primary"
                  href={studioUrl}
                  rel="noopener"
                  aria-label="Launch Kingfisher (opens the studio on a separate origin)"
                >
                  Launch Kingfisher
                </a>
                <a className="btn btn-secondary" href="#macos">
                  Download for macOS
                </a>
              </div>
            </div>
          </div>

          <div className="hero-strip" aria-label="At a glance">
            <div className="hero-strip-item">
              <span className="hero-strip-num">172,376</span>
              <span className="hero-strip-label">Games in the bundled pack</span>
            </div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">20</span>
              <span className="hero-strip-label">Full moves indexed</span>
            </div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">3,810</span>
              <span className="hero-strip-label">Named openings, ECO codes</span>
            </div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">0</span>
              <span className="hero-strip-label">Accounts · cookies · telemetry</span>
            </div>
          </div>
        </section>

        <section id="why" className="section section-why">
          <div className="section-head">
            <p className="section-eyebrow">Why Kingfisher</p>
            <h2 className="section-title">A workstation, not a wrapper.</h2>
          </div>
          <div className="why-grid">
            <div className="why-item">
              <h3>Evidence, not a verdict.</h3>
              <p>
                Every statistic is labelled with the source it came from. The Explorer never blends
                Elite OTB with High-Rated Online and prints a single number — you see both,
                separately, with the licence and provenance on the row.
              </p>
            </div>
            <div className="why-item">
              <h3>One board, one tree.</h3>
              <p>
                Analysis, Studies, Repertoire, Review, Training and Endgame share a single board and
                a single move tree. The position you are in is the position the rest of the
                application follows.
              </p>
            </div>
            <div className="why-item">
              <h3>Stays out of the way.</h3>
              <p>
                Your work is in the browser. Your reference data is verified against a manifest
                before the first byte is used. There is no account to set up, no dashboard to learn,
                no tier to pay for.
              </p>
            </div>
          </div>
        </section>

        <section id="research" className="section section-research">
          <div className="research-layout">
            <div className="research-copy">
              <p className="section-eyebrow">Research</p>
              <h2 className="section-title">Open the line, not just the next move.</h2>
              <p className="section-lede">
                A moves history is the games that played it. The Explorer queries the source you
                name, returns the count and the trend, and keeps the line, the result, the rating
                and the licence on the row next to the data — not in a separate document you have to
                remember to read.
              </p>
              <ul className="research-list">
                <li>
                  <strong>Kingfisher Starter</strong>
                  <span>
                    Bundled · 172,376 games · 246,870 position aggregates · CC BY-SA 4.0 · works
                    offline
                  </span>
                </li>
                <li>
                  <strong>Elite OTB</strong>
                  <span>
                    407,538 games · 5,438,808 positions · CC BY-SA 4.0 · installable on demand
                  </span>
                </li>
                <li>
                  <strong>Recent Theory</strong>
                  <span>44,200 games · 918,069 positions · CC BY-SA 4.0 · two-year window</span>
                </li>
                <li>
                  <strong>High-Rated Online</strong>
                  <span>305,169 games · 315,668 positions · CC0 1.0 · Lichess 2400+</span>
                </li>
              </ul>
            </div>
            <div className="research-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/img/research-explorer.webp"
                alt="Kingfisher Explorer comparing Elite OTB and Recent Theory on the same position, each with its own count and licence"
                width="1080"
                height="720"
                loading="lazy"
                decoding="async"
                className="research-img"
              />
            </div>
          </div>
        </section>

        <section id="engines" className="section section-engines">
          <div className="engines-layout">
            <div className="engines-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/img/engine-analysis-v2.webp"
                alt="Stockfish 18 analysing the position after 1. e4 e5 2. Nf3 in Kingfisher"
                width="1440"
                height="900"
                loading="lazy"
                decoding="async"
                className="engines-img"
              />
            </div>
            <div className="engines-copy">
              <p className="section-eyebrow">Engines</p>
              <h2 className="section-title">More than one way to see a position.</h2>
              <p className="section-lede">
                Stockfish 18 is in the browser, sandboxed and instant. On macOS, native engines
                install through Settings with their digest verified and their licence on the row.
                Two engines can run side by side.
              </p>
              <p className="section-lede">
                Lc0 (Leela Chess Zero) is qualified on Apple Silicon. If you already have Syzygy
                files, Kingfisher can probe them locally.
              </p>
            </div>
          </div>
        </section>

        <section id="local" className="section section-local">
          <div className="local-statement">
            <p className="section-eyebrow">Local-first</p>
            <h2 className="section-title">Your chess. Your machine.</h2>
            <p className="section-lede">
              Your studies, repertoire and notes stay on your machine. Reference data installs once
              and works offline. No account. No telemetry. Chess on your terms.
            </p>
          </div>
        </section>

        <section id="macos" className="section section-download">
          <div className="download-head">
            <p className="section-eyebrow">Get Kingfisher</p>
            <h2 className="section-title">One workspace. Two ways in.</h2>
          </div>

          <div className="download-grid">
            <article className="download-card download-card-primary">
              <div className="download-card-top">
                <span className="download-card-tag">macOS</span>
                <span className="download-card-pill">Preview</span>
              </div>
              <h3>The local workstation.</h3>
              <p>
                Apple Silicon. Code-signed. Not notarised yet — right-click, Open, Open on first
                launch.
              </p>
              <ul className="download-spec">
                <li>
                  <span>Version</span>
                  <strong>1.0.0</strong>
                </li>
                <li>
                  <span>Architecture</span>
                  <strong>arm64</strong>
                </li>
                <li>
                  <span>Minimum OS</span>
                  <strong>macOS 11 (Big Sur)</strong>
                </li>
                <li>
                  <span>File</span>
                  <strong>Kingfisher-1.0.0-arm64.dmg</strong>
                </li>
              </ul>
              <a className="btn btn-primary btn-block" href={downloadUrl} rel="noopener">
                Download for macOS
              </a>
              <p className="download-meta">
                <a href="/install" rel="noopener">
                  Install guide
                </a>
              </p>
              <p className="download-upgrade-note">
                <strong>Already using Kingfisher?</strong> Download the latest DMG and replace the
                app in Applications. Your local Kingfisher work — Studies, Repertoire, Training,
                preferences — lives in <code>~/Library/Application Support/Kingfisher/</code> and is
                preserved by the replacement. The application <em>About → Check for updates</em>{' '}
                action also reports whether a newer public release is available; auto-update is not
                enabled.
              </p>
            </article>

            <article className="download-card">
              <div className="download-card-top">
                <span className="download-card-tag">Web</span>
                <span className="download-card-pill download-card-pill-ok">Stable</span>
              </div>
              <h3>The same application, in your browser.</h3>
              <p>
                Stockfish 18 runs in a Web Worker on the same origin. No install. No companion.
                Works on the train.
              </p>
              <ul className="download-spec">
                <li>
                  <span>Engine</span>
                  <strong>Stockfish 18 WASM</strong>
                </li>
                <li>
                  <span>Storage</span>
                  <strong>IndexedDB · origin-scoped</strong>
                </li>
                <li>
                  <span>Browser</span>
                  <strong>Modern · Chromium, Firefox, Safari</strong>
                </li>
                <li>
                  <span>Account</span>
                  <strong>None</strong>
                </li>
              </ul>
              <a className="btn btn-secondary btn-block" href={studioUrl} rel="noopener">
                Launch Kingfisher
              </a>
              <p className="download-meta">
                <a href={repoUrl} rel="noopener">
                  Source on GitHub
                </a>
              </p>
            </article>
          </div>
        </section>

        <section id="faq" className="section section-faq">
          <div className="section-head">
            <p className="section-eyebrow">Frequently asked</p>
            <h2 className="section-title">Questions a new user actually has.</h2>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>
                <span>Is Kingfisher free?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                Yes. The application is open source under the{}
                <a
                  href="https://github.com/mardakurt/kingfisher/blob/master/LICENSE"
                  rel="noopener"
                >
                  MIT licence
                </a>
                . There is no paid tier, no subscription and no in-app purchase. Optional reference
                data is free to download; the manifests that come with the application tell you
                exactly how much each pack will use.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>Do I need an account?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                No. Kingfisher is local-first. Open the web app or download the macOS Preview and
                your work lives in the browser or on the machine you installed it on. There is no
                sign-up and no profile. You can optionally connect a Lichess or Chess.com account
                from Settings to study your own games.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>Where is my work saved?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                In your browsers IndexedDB on the web, or in{' '}
                <code>~/Library/Application Support/Kingfisher/</code> on the macOS Preview. The
                full data lives on your machine, never on a Kingfisher server. To move work between
                machines, use <em>Settings → Database → Export backup / Import backup</em>. The
                backup is a portable JSON file you control.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>Can I use Kingfisher offline?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                Yes. The bundled Kingfisher Starter answers from your local data once it has been
                installed on first run. The macOS Preview runs entirely on your machine. The web
                build needs a network only for first load and for an optional, on-demand reference
                query; a downloaded pack keeps working without the network.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>Why does the macOS build say “Preview”?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                The build is code-signed with an Apple Development identity, but it has not been
                notarised yet. Notarisation requires a Developer ID Application certificate, which
                the project does not have today. Until then macOS Gatekeeper refuses the first
                launch; the <a href="/install">install guide</a> walks you through the right-click →
                Open flow that gets past it without disabling system protections.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>Does Kingfisher work on Windows or Linux?</span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                The web build works in any modern browser on any operating system. The desktop shell
                is supported on Apple Silicon macOS only. The web application is the same product,
                served from the same codebase; what differs is whether you run it in a browser tab
                or in the macOS shell.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="site-footer" role="contentinfo">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="nav-wordmark">Kingfisher</span>
            <p className="footer-tag">
              A local-first chess research workstation. Open source under the MIT licence.
            </p>
          </div>
          <nav className="footer-cols" aria-label="Footer">
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href={studioUrl} rel="noopener">
                    Launch Studio
                  </a>
                </li>
                <li>
                  <a href="/install">Install guide</a>
                </li>
                <li>
                  <a href="#macos">Download for macOS</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Project</h4>
              <ul>
                <li>
                  <a href={repoUrl} rel="noopener">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={releaseUrl} rel="noopener">
                    Releases
                  </a>
                </li>
                <li>
                  <a href={publicUrl.issues} rel="noopener">
                    Issues
                  </a>
                </li>
                <li>
                  <a href={publicUrl.discussions} rel="noopener">
                    Discussions
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Trust</h4>
              <ul>
                <li>
                  <a href="/privacy">Privacy</a>
                </li>
                <li>
                  <a href="/security">Security</a>
                </li>
                <li>
                  <a href="/data-licences">Data &amp; licences</a>
                </li>
                <li>
                  <a href="/terms">Terms</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="footer-fineprint">
          <p>
            Kingfisher source under the{}
            <a href="https://github.com/mardakurt/kingfisher/blob/master/LICENSE" rel="noopener">
              MIT licence
            </a>
            . Third-party reference data retains its respective licensing and attribution.{}
            <a href="/data-licences">See each data pack for source, licence, and provenance.</a>
          </p>
        </div>
      </footer>

      <script
        type="application/ld+json"
        // The JSON-LD payload above is built from server-side
        // constants; the string is the only user-controlled
        // surface and there is none. JSON.stringify is safe.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
