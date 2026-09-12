/**
 * The full-screen relay's two halves agree, and it carries only a boolean.
 *
 * `window-chrome.mjs` names the channels; `main.mjs` imports them; the
 * sandboxed CommonJS preload cannot import an ES module and spells them out.
 * This is the test the preload's comment points at. The second assertion is
 * the security half of the contract: the renderer may be *told* about the
 * window, and must be given no way to set, move or size it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FULLSCREEN_CHANNELS } from './window-chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const preload = readFileSync(path.join(HERE, 'preload.cjs'), 'utf8');
const main = readFileSync(path.join(HERE, 'main.mjs'), 'utf8');

describe('full-screen IPC', () => {
  it('the preload listens on the channel the shell sends on', () => {
    expect(preload).toContain(`on('${FULLSCREEN_CHANNELS.changed}'`);
    expect(preload).toContain(`ipcRenderer.send('${FULLSCREEN_CHANNELS.wanted}')`);
  });

  it('the shell relays both window events and answers the request', () => {
    expect(main).toContain("window.on('enter-full-screen'");
    expect(main).toContain("window.on('leave-full-screen'");
    expect(main).toContain('ipcMain.on(FULLSCREEN_CHANNELS.wanted');
    expect(main).toContain('window.isFullScreen()');
  });

  it('exposes a report, not a control', () => {
    // One method, listener-shaped. Nothing on the bridge sets full screen.
    expect(preload).toMatch(/onFullscreenChange: \(listener\) =>/);
    expect(preload).not.toMatch(/setFullScreen|setBounds|setSize|setPosition/);
    // The preload normalises to a strict boolean before the renderer sees it.
    expect(preload).toContain('listener(full === true)');
  });
});
