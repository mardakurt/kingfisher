import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { REQUIRED_DESKTOP_RESOURCES, assertDesktopResources } from './required-resources.mjs';
import verifyPackage from '../scripts/verify-package.mjs';

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

describe('the build hooks', () => {
  it('runs the resource gate after packing and the boot gate after signing, before any archive', () => {
    const yml = readFileSync(path.join(DESKTOP, 'electron-builder.yml'), 'utf8');
    expect(yml).toMatch(/^afterPack: scripts\/verify-package\.mjs$/m);
    expect(yml).toMatch(/^afterSign: scripts\/verify-package-boot\.mjs$/m);
    // One electron-builder run: a split run drops app-update.yml.
    const build = readFileSync(path.join(DESKTOP, 'scripts/build.mjs'), 'utf8');
    expect(build).not.toMatch(/prepackaged=|packagePipeline|spawnSync\([^)]*--dir/);
  });
  it('the boot gate refuses a bundle without an update feed', () => {
    const boot = readFileSync(path.join(DESKTOP, 'scripts/verify-package-boot.mjs'), 'utf8');
    expect(boot).toMatch(/app-update\.yml/);
    expect(boot).toMatch(/provider:\\s\*github/);
  });
});
