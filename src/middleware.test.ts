import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  isLandingAsset,
  routingFor,
  studioHostFor,
  STUDIO_DEFAULT_HOSTS,
} from './middleware-host-rules';

describe('host routing rules', () => {
  it('treats "/" as a landing path', () => {
    expect(isLandingAsset('/')).toBe(true);
  });

  it('treats Next internals as landing paths', () => {
    expect(isLandingAsset('/_next/static/foo.css')).toBe(true);
    expect(isLandingAsset('/_next/image/foo')).toBe(true);
  });

  it('treats landing static assets as landing paths', () => {
    expect(isLandingAsset('/landing/img/hero.png')).toBe(true);
    expect(isLandingAsset('/reference/kingfisher-starter/manifest.json')).toBe(true);
    expect(isLandingAsset('/favicon.ico')).toBe(true);
  });

  it('treats studio interior paths as NOT landing', () => {
    expect(isLandingAsset('/analysis')).toBe(false);
    expect(isLandingAsset('/openings')).toBe(false);
    expect(isLandingAsset('/player/carlsen')).toBe(false);
  });
});

describe('studioHostFor', () => {
  it('matches the default studio hosts', () => {
    for (const host of STUDIO_DEFAULT_HOSTS) {
      expect(studioHostFor(host)).toBe(host);
    }
  });

  it('ignores port differences', () => {
    expect(studioHostFor('studio.localhost:3210')).toBe('studio.localhost');
  });

  it('returns null for the landing host', () => {
    expect(studioHostFor('kingfisher-chess.vercel.app')).toBeNull();
    expect(studioHostFor('localhost:3210')).toBeNull();
  });

  it('returns null when no host header is present', () => {
    expect(studioHostFor(null)).toBeNull();
  });
});

describe('routingFor', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.KINGFISHER_STUDIO_HOST;
    delete process.env.KINGFISHER_STUDIO_HOST;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KINGFISHER_STUDIO_HOST;
    } else {
      process.env.KINGFISHER_STUDIO_HOST = originalEnv;
    }
  });

  it('passes through "/" on the landing host', () => {
    expect(routingFor('kingfisher-chess.vercel.app', '/')).toEqual({ kind: 'next' });
  });

  it('redirects studio paths on the landing host back to /', () => {
    expect(routingFor('kingfisher-chess.vercel.app', '/analysis')).toEqual({
      kind: 'redirect',
      to: '/',
    });
    expect(routingFor('kingfisher-chess.vercel.app', '/openings')).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('rewrites "/" to "/analysis" on the studio host', () => {
    expect(routingFor('studio.localhost:3210', '/')).toEqual({
      kind: 'rewrite',
      to: '/analysis',
    });
  });

  it('passes studio interior paths through on the studio host', () => {
    expect(routingFor('studio.localhost', '/openings')).toEqual({ kind: 'next' });
    expect(routingFor('studio.localhost', '/analysis')).toEqual({ kind: 'next' });
  });

  it('treats unknown hosts as landing (single-origin fallback)', () => {
    expect(routingFor('example.com', '/')).toEqual({ kind: 'next' });
    expect(routingFor('example.com', '/analysis')).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('refuses studio-like hosts that are not on the allow-list', () => {
    // Trailing dot (FQDN canonical form)
    expect(studioHostFor('studio.kingfisher-chess.vercel.app.')).toBeNull();
    // Subdomain attack
    expect(studioHostFor('studio.kingfisher-chess.vercel.app.attacker.com')).toBeNull();
    // Prefix attack
    expect(studioHostFor('notstudio.localhost')).toBeNull();
    // Suffix attack
    expect(studioHostFor('studio.localhost.attacker.com')).toBeNull();
  });

  it('uppercase host headers are normalized to lowercase', () => {
    expect(studioHostFor('STUDIO.LOCALHOST')).toBe('studio.localhost');
    expect(studioHostFor('Studio.LocalHost:3210')).toBe('studio.localhost');
  });

  it('does not confuse empty string with a missing header', () => {
    expect(studioHostFor('')).toBeNull();
  });

  it('redirects an evil studio host away from the studio interior', () => {
    // A request to /openings on a host that is NOT a
    // configured studio host is treated as the landing
    // surface; the studio interior must not answer.
    expect(routingFor('evil-studio.com', '/openings')).toEqual({
      kind: 'redirect',
      to: '/',
    });
    expect(routingFor('studio.evil.com', '/openings')).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });
});
