/** The unpacked runtime contract, relative to Resources/kingfisher.
 * Native installed engines and their machine-specific manifests are optional.
 * The tablebase helper is optional: an absent helper selects remote probing.
 * The companion uses Node built-ins (including node:sqlite), not npm packages.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_DESKTOP_RESOURCES = Object.freeze(
  [
    { path: 'web/server.js', kind: 'file' },
    { path: 'web/package.json', kind: 'file' },
    { path: 'web/node_modules/next/package.json', kind: 'file' },
    { path: 'web/node_modules/react/package.json', kind: 'file' },
    { path: 'web/node_modules/react-dom/package.json', kind: 'file' },
    { path: 'web/.next/BUILD_ID', kind: 'file' },
    { path: 'web/.next/required-server-files.json', kind: 'file' },
    { path: 'web/.next/server', kind: 'directory' },
    { path: 'web/.next/static', kind: 'directory' },
    { path: 'web/public/engine/stockfish/manifest.json', kind: 'file' },
    { path: 'web/public/engine/stockfish/stockfish-18-lite-single.js', kind: 'file' },
    { path: 'web/public/engine/stockfish/stockfish-18-lite-single.wasm', kind: 'file' },
    { path: 'web/public/engine/stockfish/stockfish-18-lite.js', kind: 'file' },
    { path: 'web/public/engine/stockfish/stockfish-18-lite.wasm', kind: 'file' },
    { path: 'companion/src/server.mjs', kind: 'file' },
    { path: 'scripts/engine-catalogue.mjs', kind: 'file' },
    { path: 'scripts/engine-digests.json', kind: 'file' },
  ].map(Object.freeze),
);

/** A directory must contain assets; an empty placeholder is not a runtime. */
export function inspectDesktopResources(root) {
  return REQUIRED_DESKTOP_RESOURCES.map((resource) => {
    const file = path.join(root, resource.path);
    let ok = false;
    try {
      const stat = statSync(file);
      ok =
        resource.kind === 'directory'
          ? stat.isDirectory() && readdirSync(file).length > 0
          : stat.isFile() && stat.size > 0;
    } catch {
      /* Missing or inaccessible is a broken package. */
    }
    return { ...resource, file, ok };
  });
}

export function assertDesktopResources(root) {
  const missing = inspectDesktopResources(root).filter((resource) => !resource.ok);
  if (missing.length) {
    throw new Error(
      `Incomplete desktop package:\n${missing.map((r) => `  ${r.file} (${r.kind}, nonempty)`).join('\n')}`,
    );
  }
}
