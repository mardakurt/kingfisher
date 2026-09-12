import { describe, expect, it } from 'vitest';

import {
  allowedOrigins,
  databaseKey,
  engineKey,
  isLoopbackOrigin,
  PathRegistry,
  tokenMatches,
} from './security.mjs';

describe('database keys', () => {
  /*
    The regression this file exists for.

    The key used to be the hex of the name truncated to sixteen characters —
    the hex of its first eight bytes. Any two databases whose names agreed for
    eight characters shared a key, and creating the second re-pointed that key
    at a new empty file while the first one's games stayed in a file nothing
    referenced any more. It was found by a benchmark that made "Bench 10000"
    and then "Bench 100000" and quietly wrote 100,000 games into the wrong one.
  */
  it('separates names that share a long prefix', () => {
    expect(databaseKey('Bench 10000')).not.toBe(databaseKey('Bench 100000'));
    expect(databaseKey('Kasparov games 2024')).not.toBe(databaseKey('Kasparov games 2025'));
    expect(databaseKey('My collection part 1')).not.toBe(databaseKey('My collection part 2'));
  });

  it('is stable, so reopening a name reaches the same database', () => {
    expect(databaseKey('Bench archive')).toBe(databaseKey('Bench archive'));
  });

  it('distinguishes names that differ only in case or spacing', () => {
    expect(databaseKey('archive')).not.toBe(databaseKey('Archive'));
    expect(databaseKey('my games')).not.toBe(databaseKey('my  games'));
  });

  it('produces a key that is safe to put in a URL and a filename', () => {
    expect(databaseKey('../../etc/passwd')).toMatch(/^db-[0-9a-f]{20}$/);
    expect(databaseKey('Ünïcode náme ♞')).toMatch(/^db-[0-9a-f]{20}$/);
  });
});

describe('engine keys', () => {
  it('is stable, so re-registering the same binary reaches the same key', () => {
    expect(engineKey('/opt/engines/stockfish')).toBe(engineKey('/opt/engines/stockfish'));
  });

  it('separates different binaries, including ones that only differ by path', () => {
    expect(engineKey('/opt/engines/stockfish')).not.toBe(engineKey('/opt/engines/stockfish-dev'));
  });

  it('produces a key that is safe to put in a URL and a filename', () => {
    expect(engineKey('/weird path/with spaces & "quotes"')).toMatch(/^engine-[0-9a-f]{20}$/);
  });
});

describe('the path registry', () => {
  it('resolves a registered key to its file', () => {
    const registry = new PathRegistry();
    registry.register('db-1', '/tmp/one.sqlite', { name: 'One' });
    expect(registry.resolve('db-1').path).toBe('/tmp/one.sqlite');
  });

  it('refuses to move an existing key to a different file', () => {
    const registry = new PathRegistry();
    registry.register('db-1', '/tmp/one.sqlite');
    expect(() => registry.register('db-1', '/tmp/two.sqlite')).toThrow(/already registered/i);
    // The original mapping survives, so its data stays reachable.
    expect(registry.resolve('db-1').path).toBe('/tmp/one.sqlite');
  });

  it('allows re-registering the same key with the same file', () => {
    const registry = new PathRegistry();
    registry.register('db-1', '/tmp/one.sqlite', { name: 'One' });
    expect(() => registry.register('db-1', '/tmp/one.sqlite', { name: 'Renamed' })).not.toThrow();
    expect(registry.resolve('db-1').name).toBe('Renamed');
  });

  it('refuses a key it has never seen rather than guessing a path', () => {
    expect(() => new PathRegistry().resolve('db-nope')).toThrow(/unknown resource/i);
  });
});

describe('the trust boundary', () => {
  it('rejects a token of the wrong length without comparing bytes', () => {
    expect(tokenMatches('a'.repeat(64), 'a'.repeat(63))).toBe(false);
    expect(tokenMatches('a'.repeat(64), '')).toBe(false);
  });

  it('rejects, rather than throws on, a token of the right character length and the wrong byte length', () => {
    // One multibyte character makes 64 characters into 65 bytes; the first
    // implementation reached timingSafeEqual with mismatched buffers and threw.
    expect(() => tokenMatches('a'.repeat(64), `${'a'.repeat(63)}ü`)).not.toThrow();
    expect(tokenMatches('a'.repeat(64), `${'a'.repeat(63)}ü`)).toBe(false);
    expect(tokenMatches('a'.repeat(64), 'ü'.repeat(64))).toBe(false);
    expect(tokenMatches('a'.repeat(64), 'ü'.repeat(32))).toBe(false);
    expect(tokenMatches('ü'.repeat(32), 'ü'.repeat(32))).toBe(true);
  });

  it('accepts only the exact token', () => {
    const token = 'b'.repeat(64);
    expect(tokenMatches(token, token)).toBe(true);
    expect(tokenMatches(token, 'b'.repeat(63) + 'c')).toBe(false);
  });

  it('allows only loopback origins', () => {
    const origins = allowedOrigins(4321);
    expect(origins.has('http://localhost:3210')).toBe(true);
    expect(origins.has('http://127.0.0.1:4321')).toBe(true);
    expect(origins.has('https://evil.example')).toBe(false);
    expect(origins.has('http://localhost.evil.example')).toBe(false);
  });
});

describe('the desktop origin allowlist', () => {
  /*
    The desktop shell picks its own port, so it has to be able to name the
    origin it serves from. That is a widening of the one list standing between
    a page in the user's browser and their engines, so it is validated here
    rather than trusted from the environment that set it — and the process
    that sets it is the same process that spawns the companion, which is
    exactly why "it is already trusted" is not a reason to skip the check.
  */
  it('admits a loopback origin the desktop shell asks for', () => {
    const origins = allowedOrigins(4321, ['http://127.0.0.1:52310']);
    expect(origins.has('http://127.0.0.1:52310')).toBe(true);
    expect(origins.has('http://localhost:3210')).toBe(true);
  });

  it('refuses everything that is not loopback over http', () => {
    const refused = [
      'https://kingfisher.example',
      'http://evil.example',
      'http://127.0.0.1.evil.example',
      'http://localhost.evil.example:52310',
      'file://',
      'http://[::2]:52310',
      'http://0.0.0.0:52310',
      'http://192.168.1.10:52310',
      '',
      'not a url',
    ];
    const origins = allowedOrigins(4321, refused);
    for (const origin of refused) expect(origins.has(origin)).toBe(false);
    expect(origins.size).toBe(4);
  });

  it('refuses a loopback host carrying anything but scheme, host and port', () => {
    expect(isLoopbackOrigin('http://127.0.0.1:52310')).toBe(true);
    expect(isLoopbackOrigin('http://localhost:52310')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:52310')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1:52310/')).toBe(false);
    expect(isLoopbackOrigin('http://127.0.0.1:52310/path')).toBe(false);
    expect(isLoopbackOrigin('http://user:pass@127.0.0.1:52310')).toBe(false);
    expect(isLoopbackOrigin('http://127.0.0.1:52310?a=b')).toBe(false);
  });

  it('adds nothing when the shell names nothing', () => {
    expect(allowedOrigins(4321).size).toBe(4);
    expect(allowedOrigins(4321, []).size).toBe(4);
  });
});
