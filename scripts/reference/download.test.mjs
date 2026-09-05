import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zstdCompressSync } from 'node:zlib';
import { readGames, resumableBytes } from './pgn-stream.mjs';

afterEach(() => vi.unstubAllGlobals());
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const collect = async (source) => {
  const out = [];
  for await (const chunk of source) out.push(chunk);
  return Buffer.concat(out);
};

describe('verified archive downloads', () => {
  it('checks the compressed bytes, even when the archive decodes successfully', async () => {
    const bytes = zstdCompressSync(Buffer.from('[Event "Real fixture"]\n\n1. e4 e5 *\n'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes)),
    );
    await expect(
      collect(resumableBytes({ url: 'https://archive.test/a', sha256: digest(bytes) })),
    ).resolves.toEqual(bytes);
    const consume = async () => {
      for await (const game of readGames({ url: 'https://archive.test/a', sha256: '0'.repeat(64) }))
        void game;
    };
    await expect(consume()).rejects.toThrow(/SHA-256 mismatch/);
  });

  it('resumes at exactly the last delivered byte and hashes each byte once', async () => {
    let sent = false;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                if (!sent) {
                  sent = true;
                  controller.enqueue(Buffer.from('abc'));
                } else
                  return new Promise((resolve) =>
                    setTimeout(() => {
                      controller.error(new Error('connection dropped'));
                      resolve();
                    }, 10),
                  );
              },
            }),
            { headers: { 'content-length': '6', etag: '"v1"' } },
          ),
      )
      .mockImplementationOnce(async (_url, init) => {
        expect(init.headers.get('Range')).toBe('bytes=3-');
        expect(init.headers.get('If-Range')).toBe('"v1"');
        return new Response(Buffer.from('def'), {
          status: 206,
          headers: { 'content-range': 'bytes 3-5/6', etag: '"v1"' },
        });
      });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      collect(
        resumableBytes({
          url: 'https://archive.test/a',
          sha256: digest('abcdef'),
          retryDelayMs: 0,
        }),
      ),
    ).resolves.toEqual(Buffer.from('abcdef'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses a server replaying the wrong range', async () => {
    let sent = false;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          async () =>
            new Response(
              new ReadableStream({
                pull(controller) {
                  if (!sent) {
                    sent = true;
                    controller.enqueue(Buffer.from('abc'));
                  } else
                    return new Promise((resolve) =>
                      setTimeout(() => {
                        controller.error(new Error('drop'));
                        resolve();
                      }, 10),
                    );
                },
              }),
            ),
        )
        .mockImplementation(
          async () =>
            new Response(Buffer.from('abcdef'), {
              status: 206,
              headers: { 'content-range': 'bytes 0-5/6' },
            }),
        ),
    );
    await expect(
      collect(resumableBytes({ url: 'https://archive.test/a', retryDelayMs: 0 })),
    ).rejects.toThrow(/resume exactly/);
  });
});
