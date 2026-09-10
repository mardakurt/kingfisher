import { publicUrl } from '@/release/public-urls';

import './landing.css';

/**
 * The Kingfisher landing page.
 *
 * Served at the marketing origin. Every link that targets the studio
 * points at the studio's canonical URL (`publicUrl.studio`), so a
 * returning player who has the studio bookmarked opens it directly
 * without coming back through this page. The marketing origin must
 * never serve the studio.
 *
 * The landing component renders server-side; no event handlers, analytics or
 * third-party scripts. The static assets live under `/landing/img/` and are
 * served from the same origin as the page so the application CSP, which is
 * `default-src 'self'`, accepts them.
 */
export function LandingPage() {
  const studioUrl = publicUrl.studio;
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
          <a href="#local">Local</a>
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
                <a className="btn btn-secondary" href="#download-mac">
                  Download for macOS
                </a>
              </div>
              <p className="hero-meta">No account · No telemetry · Open source</p>
            </div>

            <div className="hero-product">
              <div className="hero-product-frame">
                <div className="hero-product-chrome">
                  <span className="hero-product-dot"></span>
                  <span className="hero-product-dot"></span>
                  <span className="hero-product-dot"></span>
                  <span className="hero-product-title">Kingfisher · Analysis</span>
                </div>
                <picture>
                  <source srcSet="/landing/img/hero-product.webp" type="image/webp" />
                  <img
                    src="/landing/img/hero-product.png"
                    alt="Kingfisher analysis view: board, engine panel, opening Explorer"
                    width="2880"
                    height="1840"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="hero-product-img"
                  />
                </picture>
              </div>
            </div>
          </div>

          <div className="hero-strip">
            <div className="hero-strip-item">
              <span className="hero-strip-num">172,376</span>
              <span className="hero-strip-label">bundled Starter games</span>
            </div>
            <div className="hero-strip-sep"></div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">407,538</span>
              <span className="hero-strip-label">Elite OTB games available</span>
            </div>
            <div className="hero-strip-sep"></div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">3,810</span>
              <span className="hero-strip-label">named opening positions</span>
            </div>
            <div className="hero-strip-sep"></div>
            <div className="hero-strip-item">
              <span className="hero-strip-num">9</span>
              <span className="hero-strip-label">native open-source engines</span>
            </div>
          </div>
        </section>

        <section id="why" className="section section-why">
          <div className="section-head">
            <p className="section-eyebrow">Why Kingfisher</p>
            <h2 className="section-title">A place for serious chess.</h2>
          </div>
          <div className="why-grid">
            <div className="why-item">
              <h3>Evidence stays separate.</h3>
              <p>
                Compare elite OTB, recent theory and high-rated online play side by side. Each
                source keeps its own game count and provenance.
              </p>
            </div>
            <div className="why-item">
              <h3>Real databases, real engines.</h3>
              <p>
                Start with Stockfish in your browser. On macOS, add nine native engines, including
                Lc0, with every download digest-verified.
              </p>
            </div>
            <div className="why-item">
              <h3>Local-first by design.</h3>
              <p>
                No account. Studies, repertoire, training and notes are stored on your machine.
                Restoring from backup never talks to a server.
              </p>
            </div>
          </div>
        </section>

        <section id="research" className="section section-research">
          <div className="research-layout">
            <div className="research-copy">
              <p className="section-eyebrow">Opening research</p>
              <h2 className="section-title">Every source. Its own perspective.</h2>
              <p className="section-lede">
                Theory Book names the opening. The Explorer answers for the position. Each source
                keeps its own licence, provenance and game count, and the column headers show which
                is which.
              </p>
              <ul className="research-list">
                <li>
                  <strong>Elite OTB</strong>
                  <span>407,538 broadcast games since 2020.</span>
                </li>
                <li>
                  <strong>Recent Theory</strong>
                  <span>44,200 games from the last two years.</span>
                </li>
                <li>
                  <strong>High-Rated Online</strong>
                  <span>305,169 Lichess 2400+ games.</span>
                </li>
                <li>
                  <strong>Kingfisher Starter</strong>
                  <span>172,376 games, bundled and offline.</span>
                </li>
              </ul>
            </div>

            <div className="research-visual">
              <div className="research-frame">
                <picture>
                  <source srcSet="/landing/img/research-explorer.webp" type="image/webp" />
                  <img
                    src="/landing/img/research-explorer.png"
                    alt="Kingfisher Theory Book showing named branches of the Sicilian Defence"
                    width="2880"
                    height="1840"
                    loading="lazy"
                    decoding="async"
                    className="research-img"
                  />
                </picture>
              </div>
            </div>
          </div>
        </section>

        <section id="engines" className="section section-engines">
          <div className="engines-layout">
            <div className="engines-visual">
              <div className="engines-frame">
                <picture>
                  <source srcSet="/landing/img/engine-analysis-v2.webp" type="image/webp" />
                  <img
                    src="/landing/img/engine-analysis-v2.webp"
                    alt="Stockfish 18 analysing the position after 1. e4 e5 2. Nf3 in Kingfisher"
                    width="1440"
                    height="900"
                    loading="lazy"
                    decoding="async"
                    className="engines-img"
                  />
                </picture>
              </div>
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

        <section id="download" className="section section-download">
          <div className="download-head">
            <p className="section-eyebrow">Get Kingfisher</p>
            <h2 className="section-title">One workspace. Two ways in.</h2>
          </div>

          <div className="download-grid">
            <article className="download-card download-card-primary" id="download-mac">
              <div className="download-card-top">
                <span className="download-card-tag">macOS</span>
                <span className="download-card-pill">Preview</span>
              </div>
              <h3>The local workstation.</h3>
              <p>
                Apple Silicon. Code-signed. Not notarized yet — right-click, Open, Open on first
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
                  <span>File</span>
                  <strong>Kingfisher-1.0.0-arm64.dmg</strong>
                </li>
                <li>
                  <span>Size</span>
                  <strong>150 MB</strong>
                </li>
              </ul>
              <a className="btn btn-primary btn-block" href={publicUrl.macosDmg} rel="noopener">
                Download for macOS
              </a>
              <p className="download-meta">
                <a
                  href="https://github.com/mardakurt/kingfisher/blob/master/docs/release/install-macos.md"
                  rel="noopener"
                >
                  Install guide
                </a>
              </p>
            </article>

            <article className="download-card">
              <div className="download-card-top">
                <span className="download-card-tag">Web</span>
                <span className="download-card-pill download-card-pill-ok">Live</span>
              </div>
              <h3>Straight to the board.</h3>
              <p>
                Stockfish runs in the page. No install. The bundled Kingfisher Starter installs
                itself on first run.
              </p>
              <ul className="download-spec">
                <li>
                  <span>Engine</span>
                  <strong>Stockfish 18, threaded</strong>
                </li>
                <li>
                  <span>Storage</span>
                  <strong>IndexedDB, on your machine</strong>
                </li>
                <li>
                  <span>Account</span>
                  <strong>None</strong>
                </li>
              </ul>
              <a className="btn btn-secondary btn-block" href={studioUrl} rel="noopener">
                Launch the web app
              </a>
              <p className="download-meta">
                <a href="https://github.com/mardakurt/kingfisher" rel="noopener">
                  Source on GitHub
                </a>
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer" role="contentinfo">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="nav-brand">
              <span className="nav-mark" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/img/kingfisher-mark.svg" alt="" width="22" height="22" />
              </span>
              <span className="nav-wordmark">Kingfisher</span>
            </div>
            <p className="footer-tag">
              A local-first chess workstation. MIT-licensed source. Public release.
            </p>
          </div>
          <div className="footer-cols">
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href={studioUrl} rel="noopener">
                    Web app
                  </a>
                </li>
                <li>
                  <a href="https://github.com/mardakurt/kingfisher/releases/latest" rel="noopener">
                    Latest release
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/mardakurt/kingfisher/blob/master/CHANGELOG.md"
                    rel="noopener"
                  >
                    Changelog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Source</h4>
              <ul>
                <li>
                  <a href="https://github.com/mardakurt/kingfisher" rel="noopener">
                    Repository
                  </a>
                </li>
                <li>
                  <a href="https://github.com/mardakurt/kingfisher/issues" rel="noopener">
                    Issues
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/mardakurt/kingfisher/issues/new/choose"
                    rel="noopener"
                  >
                    Give feedback
                  </a>
                </li>
                <li>
                  <a href="https://github.com/mardakurt/kingfisher/discussions" rel="noopener">
                    Discussions
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Reference data</h4>
              <ul>
                <li>
                  <a href={publicUrl.packManifests.elite} rel="noopener">
                    Elite OTB
                  </a>
                </li>
                <li>
                  <a href={publicUrl.packManifests.recent} rel="noopener">
                    Recent Theory
                  </a>
                </li>
                <li>
                  <a href={publicUrl.packManifests.online} rel="noopener">
                    High-Rated Online
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Safety</h4>
              <ul>
                <li>
                  <a href="https://github.com/mardakurt/kingfisher/security/policy" rel="noopener">
                    Security policy
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/mardakurt/kingfisher/blob/master/SECURITY.md"
                    rel="noopener"
                  >
                    SECURITY.md
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="footer-fineprint">
          Reference data is © its respective publishers; see each pack’s manifest for licence,
          source, and provenance. Lichess © lichess.org, used under CC0 / CC BY-SA 4.0 as marked.
        </p>
      </footer>
    </div>
  );
}
