/** electron-builder afterPack: reject incomplete resources before signing/DMG. */
import path from 'node:path';
import { assertDesktopResources } from '../src/required-resources.mjs';
import { assertSparkleBundle } from '../src/sparkle-bundle.mjs';

export default async function verifyPackage(context) {
  const contents =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents')
      : null;
  const resources = contents
    ? path.join(contents, 'Resources')
    : path.join(context.appOutDir, 'resources');
  assertDesktopResources(path.join(resources, 'kingfisher'));
  if (contents) {
    // Sparkle: the framework, its helpers, the bridge and the Info.plist
    // keys, before anything is signed — a bundle Sparkle cannot run in is
    // not worth a signature.
    assertSparkleBundle(contents);
  }
  console.log('Packaged runtime resources verified.');
}
