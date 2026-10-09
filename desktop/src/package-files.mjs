import { readdirSync } from 'node:fs';

/** Finder/File Provider conflict copies and developer files are never runtime inputs. */
export function isPackageFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return !(
    /(^|\/)\.DS_Store$/.test(normalized) ||
    /(^|\/)[^/]+ \d+(\.[^/]*)?$/.test(normalized) ||
    /\.test\.mjs$/.test(normalized) ||
    /(^|\/)__fixtures__(\/|$)/.test(normalized)
  );
}

/** Fail before signing if a different staging input bypassed the copy filter. */
export function assertPackageFiles(root) {
  const unwanted = readdirSync(root, { recursive: true }).filter((entry) => !isPackageFile(entry));
  if (unwanted.length)
    throw new Error(`Unexpected packaged files: ${unwanted.slice(0, 5).join(', ')}`);
}
