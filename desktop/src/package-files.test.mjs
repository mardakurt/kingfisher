import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPackageFiles, isPackageFile } from './package-files.mjs';

describe('packaged runtime inputs', () => {
  it('copies the canonical dependency without Finder conflict files or directories', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kingfisher-package-files-'));
    try {
      const source = path.join(root, 'source');
      const destination = path.join(root, 'destination');
      mkdirSync(path.join(source, 'node_modules', 'detect-libc', 'lib'), { recursive: true });
      mkdirSync(path.join(source, 'node_modules 2'), { recursive: true });
      for (const name of ['detect-libc.js', 'detect-libc 2.js', 'detect-libc 3.js']) {
        writeFileSync(path.join(source, 'node_modules', 'detect-libc', 'lib', name), name);
      }
      writeFileSync(path.join(source, 'node_modules 2', 'index.js'), 'stale dependency');
      writeFileSync(path.join(source, '.DS_Store'), 'Finder metadata');
      cpSync(source, destination, {
        recursive: true,
        filter: (file) => isPackageFile(path.relative(source, file)),
      });
      const library = path.join(destination, 'node_modules', 'detect-libc', 'lib');
      expect(existsSync(path.join(library, 'detect-libc.js'))).toBe(true);
      expect(existsSync(path.join(library, 'detect-libc 2.js'))).toBe(false);
      expect(existsSync(path.join(library, 'detect-libc 3.js'))).toBe(false);
      expect(existsSync(path.join(destination, 'node_modules 2'))).toBe(false);
      expect(existsSync(path.join(destination, '.DS_Store'))).toBe(false);
      expect(() => assertPackageFiles(destination)).not.toThrow();
      expect(() => assertPackageFiles(source)).toThrow('Unexpected packaged files');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
