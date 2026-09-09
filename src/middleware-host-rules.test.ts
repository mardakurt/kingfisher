import { describe, expect, it } from 'vitest';
import { routingFor } from './middleware-host-rules';

describe('local browser and desktop routing', () => {
  it.each(['localhost:3219', '127.0.0.1:49152', '[::1]:3219'])(
    'keeps Studio routes and engine assets reachable on %s',
    (host) => {
      for (const route of [
        '/analysis',
        '/studies',
        '/settings',
        '/engine/stockfish/stockfish-18-lite.wasm',
      ])
        expect(routingFor(host, route)).toEqual({ kind: 'next' });
    },
  );
  it('keeps the local landing page available and the public split intact', () => {
    expect(routingFor('localhost:3219', '/')).toEqual({ kind: 'next' });
    expect(routingFor('kingfisher-chess.vercel.app', '/studies')).toEqual({
      kind: 'redirect',
      to: '/',
    });
    expect(routingFor('studio.kingfisher-chess.vercel.app', '/')).toEqual({
      kind: 'rewrite',
      to: '/analysis',
    });
    expect(routingFor('localhost.attacker.example', '/studies')).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });
});
