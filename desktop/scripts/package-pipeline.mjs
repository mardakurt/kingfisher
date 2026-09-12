/** Build one app, boot those bytes, then archive that same verified app. */
import path from 'node:path';
import { assertDesktopResources } from '../src/required-resources.mjs';

export async function packagePipeline({
  runBuilder,
  boot,
  args,
  output,
  productName = 'Kingfisher',
}) {
  if (args.some((arg) => arg === '--prepackaged' || arg.startsWith('--prepackaged='))) {
    throw new Error('Prepackaged input is not accepted: the build must certify its own fresh app.');
  }
  const directoryOnly = args.includes('--dir');
  const baseArgs = args.filter((arg) => arg !== '--dir');
  await runBuilder([...baseArgs, '--dir']);
  const app = path.join(output, 'mac-arm64', `${productName}.app`);
  assertDesktopResources(path.join(app, 'Contents', 'Resources', 'kingfisher'));
  await boot({
    appOutDir: path.dirname(app),
    electronPlatformName: 'darwin',
    packager: { appInfo: { productFilename: productName } },
  });
  if (!directoryOnly) await runBuilder([...baseArgs, '--prepackaged', app]);
}
