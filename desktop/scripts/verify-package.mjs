/** electron-builder afterPack: reject incomplete resources before signing/DMG. */
import path from 'node:path';
import { assertDesktopResources } from '../src/required-resources.mjs';

export default async function verifyPackage(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  assertDesktopResources(path.join(resources, 'kingfisher'));
  console.log('Packaged runtime resources verified.');
}
