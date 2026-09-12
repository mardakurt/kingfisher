/** Boot the final signed/ad-hoc app before any DMG/ZIP is made. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchKingfisher, waitForReady } from '../../scripts/desktop-lib/launch.mjs';

export default async function verifyPackageBoot(context) {
  if (context.electronPlatformName !== 'darwin') {
    throw new Error('The packaged boot gate currently certifies macOS only.');
  }
  const executablePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'MacOS',
    context.packager.appInfo.productFilename,
  );
  const launched = await launchKingfisher({ packaged: true, executablePath });
  try {
    await waitForReady(launched.window);
    const checks = await launched.window.evaluate(async () => {
      const companion = window.kingfisher?.companion;
      if (!companion) return { bridge: false };
      const call = async (route) => {
        const response = await fetch(`${companion.url}${route}`, {
          headers: { authorization: `Bearer ${companion.token}` },
        });
        if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
        return response.json();
      };
      const status = await call('/status');
      const catalogue = await call('/engine/catalogue');
      const web = await fetch(location.origin);
      return {
        bridge: true,
        web: web.ok,
        status: Boolean(status.platform),
        engineIds: catalogue.engines?.map((engine) => engine.id) ?? [],
      };
    });
    assert.equal(checks.bridge, true, 'Desktop bridge ready');
    assert.equal(checks.web, true, 'Packaged web server answers');
    assert.equal(checks.status, true, 'Packaged companion answers');
    assert.ok(checks.engineIds.includes('lc0'), 'Managed engine catalogue available');
    console.log('Fresh packaged boot verified: renderer, web, companion, engine catalogue.');
  } finally {
    const closed = await launched.close();
    assert.equal(closed.survivors.length, 0, 'Package boot left child processes running');
  }
}
