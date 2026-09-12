import { describe as suite, expect, it } from 'vitest';

import { artifactName, describe, readBuildIdentity } from './build-identity.mjs';

suite('readBuildIdentity', () => {
  it('reads what the build wrote', () => {
    const id = readBuildIdentity({
      version: '1.0.0',
      kingfisher: {
        build: 412,
        commit: 'b77d3a2c291a850217bdb6166af6e1352fa2fa9a',
        channel: 'preview',
      },
    });
    expect(id).toMatchObject({ version: '1.0.0', build: 412, channel: 'preview', dirty: false });
    expect(id.commit).toBe('b77d3a2c291a850217bdb6166af6e1352fa2fa9a');
    expect(id.label).toBe('1.0.0 (build 412, b77d3a2, preview)');
  });

  it('is dev when nothing was recorded — an old build or a checkout', () => {
    expect(readBuildIdentity({ version: '1.0.0' })).toMatchObject({
      version: '1.0.0',
      build: null,
      commit: null,
      channel: 'dev',
      label: '1.0.0 (dev)',
    });
  });

  it('never trusts a channel it does not know, or a commit that is not one', () => {
    const id = readBuildIdentity({
      version: '1.0.0',
      kingfisher: { build: -3, commit: 'not a sha', channel: 'nightly' },
    });
    expect(id).toMatchObject({ build: null, commit: null, channel: 'dev' });
  });

  it('an unpackaged shell is dev whatever its package.json claims', () => {
    const id = readBuildIdentity(
      { version: '1.0.0', kingfisher: { build: 1, commit: 'abcdef0', channel: 'stable' } },
      { packaged: false },
    );
    expect(id.channel).toBe('dev');
  });

  it('marks a dirty tree in the label so a report from one cannot pass as clean', () => {
    expect(
      describe({ version: '1.0.0', build: 5, commit: 'abcdef0123', channel: 'dev', dirty: true }),
    ).toBe('1.0.0 (build 5, abcdef0-dirty, dev)');
  });
});

suite('artifactName', () => {
  it('stable keeps the name the release process and updater already know', () => {
    expect(artifactName({ version: '1.0.0', build: 412, channel: 'stable' })).toBe(
      'Kingfisher-1.0.0-arm64.dmg',
    );
  });

  it('preview embeds the build number so two previews never share a filename', () => {
    expect(artifactName({ version: '1.0.0', build: 412, channel: 'preview' })).toBe(
      'Kingfisher-1.0.0-preview-412-arm64.dmg',
    );
    expect(artifactName({ version: '1.0.0', build: 413, channel: 'preview', ext: 'zip' })).toBe(
      'Kingfisher-1.0.0-preview-413-arm64.zip',
    );
  });

  it('never encodes a phase number', () => {
    for (const channel of ['stable', 'preview', 'dev']) {
      expect(artifactName({ version: '1.0.0', build: 46, channel })).not.toMatch(/phase/i);
    }
  });
});

suite('values that came through a command line', () => {
  it('accepts the string forms electron-builder -c produces, and nothing looser', () => {
    const id = readBuildIdentity({
      version: '1.0.0',
      kingfisher: { build: '412', commit: 'b77d3a2', channel: 'preview', dirty: 'true' },
    });
    expect(id).toMatchObject({ build: 412, commit: 'b77d3a2', channel: 'preview', dirty: true });
    expect(
      readBuildIdentity({ version: '1.0.0', kingfisher: { build: '4.5', dirty: 'yes' } }),
    ).toMatchObject({
      build: null,
      dirty: false,
    });
  });
});

suite('the landing a preview points at', () => {
  it('is carried when the build recorded one, and only over https', () => {
    expect(
      readBuildIdentity({
        version: '1.0.0',
        kingfisher: { landing: 'https://kingfisher-chess.vercel.app' },
      }).landing,
    ).toBe('https://kingfisher-chess.vercel.app');
    expect(
      readBuildIdentity({ version: '1.0.0', kingfisher: { landing: 'http://evil' } }).landing,
    ).toBeNull();
    expect(readBuildIdentity({ version: '1.0.0' }).landing).toBeNull();
  });
});
