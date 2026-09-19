import type { JSX } from 'react';
import {
  describeMinimumMacOS,
  formatBytes,
  macosDownload,
  macosTrustLabel,
  minimumMacOSShort,
} from '@/release/macos-download';
import { publicUrl } from '@/release/public-urls';

import { StudioEntry } from './StudioEntry';
import './landing.css';

/**
 * The Kingfisher landing page.
 *
 * Served at `/` on the public origin, which also serves the Studio at its
 * own routes. Every link into the Studio points at its canonical URL
 * (`publicUrl.studio`, `/analysis`; `/studio` redirects there), so a
 * returning player who has it bookmarked never comes back through this
 * page — and one who arrives here anyway is offered the way in by
 * `StudioEntry`, the page's only client component and the only part of it
 * that differs between two visitors. See `src/features/shell/studio-entry.ts`
 * for the rule.
 *
 * Everything else renders server-side with no event handlers and no
 * third-party scripts (page views are counted by the root layout's
 * `WebAnalytics`, served from this origin). The static assets live under
 * `/landing/img/` and are served from the same origin as the page so the
 * application CSP, which is `default-src 'self'`, accepts them. The three
 * product images are made by `scripts/landing-captures.mjs` from the
 * application itself.
 */
const studioPathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

export function LandingPage(): JSX.Element {
  const studioUrl = publicUrl.studio;
  /*
    The Studio is on this origin, so the returning player's way in is the
    path, not the public address: a preview deployment or a development
    server must open its own Studio, not production's.
  */
  const studioPath = studioPathOf(studioUrl);
  const repoUrl = publicUrl.repository;
  const releaseUrl = publicUrl.release;
  const downloadUrl = publicUrl.macosDmg;

  /*
   * The signing/notation question has a notarised answer and a preview
   * answer, picked at build time from the descriptor. Both are
   * deterministic, so the FAQPage schema and the visible markup can
   * share the same string constants without diverging.
   */
  const notarisedAnswer = `Kingfisher ${macosDownload.version} is signed with a Developer ID certificate and notarised by Apple, with the ticket stapled to the disk image and the application, so it opens with a normal double-click after macOS's standard "downloaded from the Internet" confirmation. Notarisation is Apple's automated malware screening, not an endorsement. The install guide lists the SHA-256 so you can check the file you have.`;
  const notarisedQuestion = 'Is the macOS build safe to open?';

  // JSON-LD for the public landing. Only fields that are
  // true and visible are included. `offers` reflects the free,
  // no-subscription, no-account product.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Kingfisher Chess',
    alternateName: ['Kingfisher', 'Kingfisher Chess app'],
    description:
      'A local-first chess research workstation for serious players. Opening research across separate evidence sources, Stockfish 18 in the browser, native engines on macOS, large personal databases, repertoire and review.',
    url: publicUrl.landing,
    applicationCategory: 'GameApplication',
    applicationSubCategory: 'Chess Analysis',
    operatingSystem: `${minimumMacOSShort()}, Web (Chrome, Safari, Firefox, Edge)`,
    softwareRequirements: 'WebAssembly, JavaScript, IndexedDB, Service Worker',
    downloadUrl: downloadUrl,
    softwareVersion: macosDownload.version,
    datePublished: '2026-09-10',
    inLanguage: 'en',
    isAccessibleForFree: true,
    keywords:
      'kingfisher chess, chess, chess analysis, chess engine, Stockfish, chess opening explorer, chess database, chess repertoire, chess training, lichess, chess.com, local-first chess, open source chess, free chess, macos chess',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    author: { '@type': 'Person', name: 'mardakurt', url: repoUrl },
    publisher: { '@type': 'Organization', name: 'Kingfisher Chess', url: publicUrl.landing },
    license: 'https://github.com/mardakurt/kingfisher/blob/master/LICENSE',
    sourceOrganization: { '@type': 'Organization', name: 'Kingfisher Chess' },
    featureList: [
      'Opening research across separate evidence sources',
      'Stockfish 18 in the browser',
      'Native engines on macOS',
      'Local-first persistence (IndexedDB)',
      'Reference data with verified provenance',
      'Repertoire, training, review',
      'No account, no cookies, no subscription',
    ],
  };

  /*
   * FAQPage schema mirrors the FAQ section below. Google can render the
   * matching questions as a FAQ rich result, which earns a search-result
   * that occupies more vertical space and ranks "kingfisher chess" style
   * questions above the fold. The strings are the same as the visible
   * markup — `Is the macOS build safe to open?` is the notarised
   * question and answer because the published 1.1.9 build is notarised.
   */
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is Kingfisher free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Kingfisher Chess is open source under the MIT licence. There is no paid tier, no subscription and no in-app purchase. Optional reference data is free to download; the manifests that come with the application tell you exactly how much each pack will use.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do I need an account to use Kingfisher Chess?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Kingfisher Chess is local-first. Open the web app or download the macOS application and your work lives in the browser or on the machine you installed it on. There is no sign-up and no profile. You can optionally connect a Lichess or Chess.com account from Settings to study your own games.',
        },
      },
      {
        '@type': 'Question',
        name: 'Where is my chess work saved?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "In your browser's IndexedDB on the web, or in ~/Library/Application Support/kingfisher-desktop/ on the macOS application. The full data lives on your machine, never on a Kingfisher server. To move work between machines, use Settings → Database → Export backup / Import backup. The backup is a portable JSON file you control.",
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use Kingfisher Chess offline?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The bundled Kingfisher Starter ships inside the application and answers from your machine. The macOS application runs entirely on your machine. The web build needs a network only for first load and for an optional, on-demand reference query; a downloaded pack keeps working without the network.',
        },
      },
      {
        '@type': 'Question',
        name: notarisedQuestion,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${notarisedAnswer} Install guide: ${publicUrl.landing}/install.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Does Kingfisher Chess work on Windows or Linux?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The web build works in any modern browser on any operating system. The desktop shell is supported on Apple Silicon macOS only. The web application is the same product, served from the same codebase; what differs is whether you run it in a browser tab or in the macOS shell.',
        },
      },
    ],
  };

  return (
    <div className="kf-landing">
      <a className="skip" href="#main">
        Skip to content
      </a>

      {/*
        The header is a three-column grid — brand, section links, action — so
        the links are centred on the page and not on the space left between a
        wordmark and a button of different widths. Below `--nav-collapse` the
        links fold into a disclosure: a `<details>` element, so the menu
        works without a line of script, closes on Escape in every browser
        that implements the element, and is one control with a name rather
        than three lines nobody can address. Every entry point into the
        Studio says "Studio", and the wordmark itself goes to the top.
      */}
      <header className="nav" role="banner">
        <div className="nav-inner">
          <a className="nav-brand" href="#top" aria-label="Kingfisher — top of page">
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
          <div className="nav-actions">
            <a className="nav-cta" href={studioUrl} rel="noopener">
              Open Studio
            </a>
            <details className="nav-menu">
              <summary aria-label="Sections">
                <span className="nav-menu-bars" aria-hidden="true" />
              </summary>
              <nav className="nav-menu-list" aria-label="Sections">
                <a href="#why">Why</a>
                <a href="#research">Research</a>
                <a href="#engines">Engines</a>
                <a href="#local">Local-first</a>
                <a href="#macos">macOS</a>
                <a href="/install">Install guide</a>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        <section id="top" className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              {/*
                The brand is in the H1, not just the title bar. A search
                for "kingfisher chess" needs the H1 of the landing to
                read as "Kingfisher Chess", not just "Chess research" —
                the brand is what disambiguates this product from the
                bird, the film and the kayak that share the bare name.
              */}
              <h1 className="hero-title">
                Kingfisher Chess.
                <br />
                <span className="hero-title-accent">Research, in one place.</span>
              </h1>
              <p className="hero-lede">
                Opening evidence, engines, databases, studies and repertoire.
                <br className="hero-lede-break" /> Together in one local-first workspace.
              </p>
              <div className="hero-cta-row">
                <a className="btn btn-primary" href={studioUrl} rel="noopener">
                  Open Kingfisher Studio
                </a>
                <a className="btn btn-secondary" href="#macos">
                  Download for macOS
                </a>
              </div>
              {/*
                For a browser that has used the Studio: a way straight in, and
                the choice to skip this page next time. Nothing for a first
                visit; see StudioEntry.tsx. The address is the same either way.
              */}
              <StudioEntry studioUrl={studioPath} />
            </div>
          </div>

          {/*
            The product, above the fold. A workstation is a thing you look at,
            and a hero with two buttons and no picture asked the reader to take
            the headline on trust. The capture is the current build — the
            analysis workspace with Stockfish running and its best move drawn
            on the board — made by `scripts/landing-captures.mjs` against the
            application itself, not a mock-up, together with the two section
            images below. Replace them when the workspace changes; a landing
            that shows an old interface is a claim the product no longer makes.
          */}
          <figure className="hero-product-frame">
            <span className="hero-grid" aria-hidden="true" />
            <div className="hero-product-chrome" aria-hidden="true">
              <span className="hero-product-tile" />
              <span className="hero-product-title">Kingfisher {macosDownload.version}</span>
              <span className="hero-product-crumb">Analysis · Stockfish 18 · Italian Game</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/img/workspace-2026-09-19.webp"
              alt="The Kingfisher analysis workspace: the board after 1. e4 e5 2. Nf3 Nc6 3. Bc4 with Stockfish 18 running, its best move drawn as an arrow on the board, five engine lines beside it and the workspace sections — Analysis, Openings, Studies, Repertoire, Preparation, Players, Opening Files, Review, Training, Endgame, Games — in the sidebar"
              width="2240"
              height="1400"
              fetchPriority="high"
              decoding="async"
              className="hero-product-img"
            />
          </figure>

          <div className="hero-strip" aria-label="At a glance">
            <div className="hero-strip-item">
              <span className="hero-strip-num">206,451</span>
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
              <span className="hero-strip-label">Accounts · cookies · subscriptions</span>
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
                    Bundled · 206,451 games · 300,413 position aggregates · CC BY-SA 4.0 · works
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
                src="/landing/img/research-2026-09-19.webp"
                alt="The Explorer on the Najdorf after 5...a6, comparing the Kingfisher Starter Reference (7,649 games here) with the Recent Theory Reference (1,703 games here): the same candidate moves, each source's own frequency in its own column, and no combined figure"
                width="1718"
                height="1138"
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
                src="/landing/img/engines-2026-09-19.webp"
                alt="The engine panel with Stockfish 18 Lite running in the browser on the Italian Game: five ranked lines with their evaluations, the depth reached, and the best move drawn as an arrow on the board beside it"
                width="1558"
                height="1138"
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
              and works offline. No account. No cookies. Chess on your terms.
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
                <span
                  className={`download-card-pill${macosDownload.signature.notarized ? ' download-card-pill-ok' : ''}`}
                >
                  {macosDownload.channel === 'preview' ? 'Preview' : 'Stable'}
                </span>
              </div>
              <h3>The local workstation.</h3>
              <p>
                {macosDownload.signature.notarized
                  ? 'Apple Silicon. Signed and notarised — it opens like any other application.'
                  : 'Apple Silicon. Code-signed. Not notarised yet — right-click, Open, Open on first launch.'}
              </p>
              <ul className="download-spec">
                <li>
                  <span>Version</span>
                  <strong>
                    {macosDownload.version}
                    {macosDownload.build === null ? '' : ` · build ${macosDownload.build}`}
                  </strong>
                </li>
                <li>
                  <span>Architecture</span>
                  <strong>arm64 (Apple Silicon)</strong>
                </li>
                <li>
                  <span>Minimum OS</span>
                  <strong>{describeMinimumMacOS()}</strong>
                </li>
                <li>
                  <span>File</span>
                  <strong>
                    {macosDownload.filename} · {formatBytes(macosDownload.bytes)}
                  </strong>
                </li>
                {/*
                  What the descriptor can vouch for, in Apple's own terms:
                  a Developer ID signature and a notarisation ticket. Neither
                  is an endorsement, and the row says no more than the
                  descriptor does — a preview that is not notarised says so.
                */}
                <li>
                  <span>Trust</span>
                  <strong>
                    {macosDownload.signature.notarized
                      ? 'Signed with Apple Developer ID · Notarised by Apple'
                      : `${macosDownload.signature.identity} · not notarised`}
                  </strong>
                </li>
              </ul>
              <a className="btn btn-primary btn-block" href={downloadUrl} rel="noopener">
                Download for macOS
              </a>
              <p className="download-meta">
                {macosTrustLabel(macosDownload)} ·{' '}
                <a href="/install" rel="noopener">
                  Install guide
                </a>{' '}
                · SHA-256 <code>{macosDownload.sha256.slice(0, 12)}…</code>
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
                Open Kingfisher Studio
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
                Yes. The application is open source under the{' '}
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
                No. Kingfisher is local-first. Open the web app or download the macOS application
                and your work lives in the browser or on the machine you installed it on. There is
                no sign-up and no profile. You can optionally connect a Lichess or Chess.com account
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
                In your browser&apos;s IndexedDB on the web, or in{' '}
                <code>~/Library/Application Support/kingfisher-desktop/</code> on the macOS
                application. The full data lives on your machine, never on a Kingfisher server. To
                move work between machines, use{' '}
                <em>Settings → Database → Export backup / Import backup</em>. The backup is a
                portable JSON file you control.
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
                Yes. The bundled Kingfisher Starter ships inside the application and answers from
                your machine. The macOS application runs entirely on your machine. The web build
                needs a network only for first load and for an optional, on-demand reference query;
                a downloaded pack keeps working without the network.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                <span>
                  {macosDownload.signature.notarized
                    ? 'Is the macOS build safe to open?'
                    : 'Why does the macOS build say “Preview”?'}
                </span>
                <span className="faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>
                {macosDownload.signature.notarized
                  ? `Kingfisher ${macosDownload.version} is signed with a Developer ID certificate and notarised by Apple, with the ticket stapled to the disk image and the application, so it opens with a normal double-click after macOS's standard "downloaded from the Internet" confirmation. Notarisation is Apple's automated malware screening, not an endorsement. The install guide lists the SHA-256 so you can check the file you have.`
                  : `Two reasons. It is built from the current source rather than from a tagged release — the version stays ${macosDownload.version} and the build number${macosDownload.build === null ? '' : ` (${macosDownload.build})`} is what changes, so no two previews ever share a filename. And it is code-signed with an Apple Development identity but not notarised: notarisation requires a Developer ID Application certificate. Until then macOS Gatekeeper refuses the first launch; the install guide walks you through the right-click → Open flow that gets past it without disabling system protections.`}{' '}
                <a href="/install">Install guide</a>.
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
            <span className="footer-brand-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/img/kingfisher-mark.svg"
                alt=""
                width="24"
                height="24"
                loading="lazy"
                decoding="async"
              />
              <span className="nav-wordmark">Kingfisher</span>
            </span>
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
                    Open Studio
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
            Kingfisher source under the{' '}
            <a href="https://github.com/mardakurt/kingfisher/blob/master/LICENSE" rel="noopener">
              MIT licence
            </a>
            . Third-party reference data retains its respective licensing and attribution.{' '}
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
      <script
        type="application/ld+json"
        // The FAQPage schema mirrors the FAQ section above. The Q&A
        // strings are the same as the visible ones — see the
        // `faqJsonLd` constant — so the structured data and the
        // page body cannot drift.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
