import { describe, expect, it } from 'vitest';

import { studioHostFor } from './host';

describe('studioHostFor', () => {
  it('returns the bare host for production studio hostnames', () => {
    expect(studioHostFor('kingfisher-roan.vercel.app')).toBe('kingfisher-roan.vercel.app');
    expect(studioHostFor('studio.kingfisher-chess.vercel.app')).toBe(
      'studio.kingfisher-chess.vercel.app'
    );
    expect(studioHostFor('studio.localhost')).toBe('studio.localhost');
  });

  it('strips the port from the host', () => {
    expect(studioHostFor('kingfisher-roan.vercel.app:443')).toBe(
      'kingfisher-roan.vercel.app'
    );
    expect(studioHostFor('studio.localhost:3210')).toBe('studio.localhost');
  });

  it('is case-insensitive', () => {
    expect(studioHostFor('Kingfisher-Roan.Vercel.App')).toBe(
      'kingfisher-roan.vercel.app'
    );
  });

  it('returns null for the marketing host', () => {
    expect(studioHostFor('kingfisher-chess.vercel.app')).toBeNull();
  });

  it('returns null for an unrelated host', () => {
    expect(studioHostFor('example.com')).toBeNull();
  });

  it('returns null when the host header is empty', () => {
    expect(studioHostFor(null)).toBeNull();
    expect(studioHostFor(undefined)).toBeNull();
    expect(studioHostFor('')).toBeNull();
  });
});
