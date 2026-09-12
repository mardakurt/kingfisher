import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REQUIRED_DESKTOP_RESOURCES, assertDesktopResources } from './required-resources.mjs';
import verifyPackage from '../scripts/verify-package.mjs';
import { packagePipeline } from '../scripts/package-pipeline.mjs';

const temporary = [];
function fixture() {
  const output = mkdtempSync(path.join(tmpdir(), 'kingfisher-resource-contract-'));
  temporary.push(output);
  const root = path.join(output, 'Kingfisher.app/Contents/Resources/kingfisher');
  for (const resource of REQUIRED_DESKTOP_RESOURCES) {
    const file = path.join(root, resource.path);
    mkdirSync(resource.kind === 'directory' ? file : path.dirname(file), { recursive: true });
    writeFileSync(resource.kind === 'directory' ? path.join(file, 'asset') : file, 'fixture');
  }
  return {
    root,
    context: {
      appOutDir: output,
      electronPlatformName: 'darwin',
      packager: { appInfo: { productFilename: 'Kingfisher' } },
    },
  };
}
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('the actual afterPack resource gate', () => {
  it('accepts a complete fixture (structural evidence, not a real boot)', async () => {
    const { context } = fixture();
    await expect(verifyPackage(context)).resolves.toBeUndefined();
  });
  it.each(REQUIRED_DESKTOP_RESOURCES)(
    'refuses an omitted $path before archives are built',
    async (resource) => {
      const { root, context } = fixture();
      rmSync(path.join(root, resource.path), { recursive: true });
      await expect(verifyPackage(context)).rejects.toThrow(resource.path);
    },
  );
  it('refuses empty runtime files and directories', () => {
    const { root } = fixture();
    writeFileSync(path.join(root, 'web/server.js'), '');
    rmSync(path.join(root, 'web/.next/static/asset'));
    expect(() => assertDesktopResources(root)).toThrow('web/server.js');
    expect(() => assertDesktopResources(root)).toThrow('web/.next/static');
  });
});

describe('archive sequencing', () => {
  async function pipeline({ failBoot = false, omit = false, args = [] } = {}) {
    const { context } = fixture();
    // The pipeline's output points at the parent of builder's mac-arm64 folder.
    const output = mkdtempSync(path.join(tmpdir(), 'kingfisher-pipeline-'));
    temporary.push(output);
    const calls = [];
    const { cpSync } = await import('node:fs');
    const run = packagePipeline({
      output,
      args,
      runBuilder: async (args) => {
        calls.push(args);
        if (args.includes('--dir')) {
          cpSync(context.appOutDir, path.join(output, 'mac-arm64'), { recursive: true });
          if (omit)
            rmSync(
              path.join(
                output,
                'mac-arm64/Kingfisher.app/Contents/Resources/kingfisher/web/server.js',
              ),
            );
        }
      },
      boot: async () => {
        calls.push('boot');
        if (failBoot) throw new Error('renderer failed');
      },
    });
    return { calls, run };
  }
  it('boots before archiving the same freshly built app', async () => {
    const { calls, run } = await pipeline();
    await run;
    expect(calls[0]).toEqual(['--dir']);
    expect(calls[1]).toBe('boot');
    expect(calls[2][0]).toBe('--prepackaged');
    expect(calls[2][1]).toMatch(/mac-arm64\/Kingfisher.app$/);
  });
  it('does not produce archives when boot fails', async () => {
    const { calls, run } = await pipeline({ failBoot: true });
    await expect(run).rejects.toThrow('renderer failed');
    expect(calls).toEqual([['--dir'], 'boot']);
  });
  it('does not boot or archive an incomplete app, even if the builder hook is bypassed', async () => {
    const { calls, run } = await pipeline({ omit: true });
    await expect(run).rejects.toThrow('web/server.js');
    expect(calls).toEqual([['--dir']]);
  });
  it('still boots directory-only builds', async () => {
    const { calls, run } = await pipeline({ args: ['--dir'] });
    await run;
    expect(calls).toEqual([['--dir'], 'boot']);
  });
  it('refuses an external prepackaged input', async () => {
    const { calls, run } = await pipeline({ args: ['--prepackaged', '/old.app'] });
    await expect(run).rejects.toThrow('Prepackaged input');
    expect(calls).toEqual([]);
  });
});
