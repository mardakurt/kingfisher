/** electron-builder afterSign: boot the signed, notarised app before any DMG/ZIP is made. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchKingfisher, waitForReady } from '../../scripts/desktop-lib/launch.mjs';
import { assertSparkleBundle } from '../src/sparkle-bundle.mjs';

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
  /*
    Sparkle, in the signed bundle: the framework and its helpers, the bridge,
    and the Info.plist keys. Asserted again after signing because signing
    is what could have dropped a symlinked framework or refused a nested
    helper — and once more below, inside the running application, where the
    only proof that counts is Sparkle reporting that it started.
  */
  assertSparkleBundle(
    path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents'),
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
      const diagnostics = await window.kingfisher.diagnostics();
      return {
        bridge: true,
        web: web.ok,
        status: Boolean(status.platform),
        engineIds: catalogue.engines?.map((engine) => engine.id) ?? [],
        updater: diagnostics?.updater ?? null,
      };
    });
    assert.equal(checks.bridge, true, 'Desktop bridge ready');
    assert.equal(checks.web, true, 'Packaged web server answers');
    assert.equal(checks.status, true, 'Packaged companion answers');
    assert.ok(checks.engineIds.includes('lc0'), 'Managed engine catalogue available');
    // Sparkle started inside the signed bundle: it loaded, accepted the host
    // bundle's key and feed, and is the engine Check for Updates will use.
    assert.equal(
      checks.updater?.started,
      true,
      `Sparkle started in the packaged application (${checks.updater?.reason ?? 'no updater block'})`,
    );
    assert.match(String(checks.updater?.feedURL), /^https:\/\//, 'Sparkle knows its feed');
    console.log(
      `Fresh packaged boot verified: renderer, web, companion, engine catalogue, Sparkle ${checks.updater.sparkleVersion} (${checks.updater.feedURL}).`,
    );
  } finally {
    const closed = await launched.close();
    assert.equal(closed.survivors.length, 0, 'Package boot left child processes running');
  }
}
