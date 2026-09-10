import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import { publicUrl } from '@/release/public-urls';

import './docs.css';

/**
 * The shared layout for the public-facing documentation routes
 * (install, privacy, security, data-licences, terms). The visual
 * language is the same as the landing: a quiet editorial
 * palette, restrained type, a top brand line, and a small
 * footer.
 *
 * The same Markdown files under `docs/` are the canonical
 * source of truth; these pages render the same content with
 * the application's chrome and the canonical URL on top.
 * `npm run docs:check` asserts the existence of these routes.
 */
export function DocsLayout({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="kf-docs">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="docs-nav" role="banner">
        <Link className="docs-brand" href="/" aria-label="Kingfisher home">
          <span className="docs-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/img/kingfisher-mark.svg"
              alt=""
              width="24"
              height="24"
              decoding="async"
            />
          </span>
          <span className="docs-wordmark">Kingfisher</span>
        </Link>
        <nav className="docs-links" aria-label="Primary">
          <Link href="/install">Install</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/security">Security</Link>
          <Link href="/data-licences">Data</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <a className="docs-cta" href={publicUrl.studio} rel="noopener">
          Launch
        </a>
      </header>

      <main id="main" className="docs-main">
        <article className="docs-article">
          <p className="docs-eyebrow">{eyebrow}</p>
          <h1 className="docs-title">{title}</h1>
          <p className="docs-lede">{lede}</p>
          <div className="docs-body">{children}</div>
        </article>
      </main>

      <footer className="docs-footer" role="contentinfo">
        <div className="docs-footer-inner">
          <div className="docs-footer-brand">
            <span className="docs-wordmark">Kingfisher</span>
            <p className="docs-footer-tag">A local-first chess research workstation.</p>
          </div>
          <nav className="docs-footer-cols" aria-label="Footer">
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href={publicUrl.studio} rel="noopener">
                    Launch Studio
                  </a>
                </li>
                <li>
                  <Link href="/install">Install guide</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Project</h4>
              <ul>
                <li>
                  <a href={publicUrl.repository} rel="noopener">
                    GitHub
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
                  <Link href="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link href="/security">Security</Link>
                </li>
                <li>
                  <Link href="/data-licences">Data &amp; licences</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="docs-footer-fineprint">
          <p>
            Kingfisher source under the{' '}
            <a href="https://github.com/mardakurt/kingfisher/blob/master/LICENSE" rel="noopener">
              MIT licence
            </a>
            . Third-party reference data retains its respective licensing and attribution. See{' '}
            <Link href="/data-licences">Data &amp; licences</Link> for source, licence, and
            provenance per pack.
          </p>
        </div>
      </footer>
    </div>
  );
}
