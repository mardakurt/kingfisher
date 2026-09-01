/**
 * What Kingfisher knows how to install, and under what terms.
 *
 * One entry per engine per platform. Nothing is fetched from anywhere that is
 * not the project's own release page, and every entry carries the licence so
 * `docs/ENGINES.md` can be checked against reality rather than memory.
 *
 * `kind`:
 *   - `wasm`    runs in the browser; downloaded into `public/engine/`
 *   - `binary`  a native release asset; downloaded into `engines/`
 *   - `system`  already on the machine (a package manager installed it); the
 *               installer locates it and records the path, and downloads nothing
 *
 * `system` exists because it is the truthful answer for Lc0 on macOS: the
 * project ships no macOS release asset, and building it during `npm install`
 * would be a lie about how reliable that is. Homebrew's formula is official and
 * maintained, so the honest thing is to use it and say so.
 */

export const PLATFORM = `${process.platform}-${process.arch}`;

export const CATALOGUE = [
  {
    id: 'stockfish-wasm',
    name: 'Stockfish 17.1 (WebAssembly)',
    family: 'alphabeta',
    kind: 'wasm',
    version: '17.1',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/official-stockfish/Stockfish',
    notes: 'Runs in a Web Worker. No companion required.',
    platforms: ['*'],
    default: true,
  },
  {
    id: 'lc0',
    name: 'Lc0 (Leela Chess Zero)',
    family: 'neural',
    kind: 'system',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/LeelaChessZero/lc0',
    // Checked in this order; the first hit wins.
    commands: ['lc0'],
    install: {
      'darwin-arm64': 'brew install lc0',
      'darwin-x64': 'brew install lc0',
      'linux-x64': 'See https://lczero.org/play/download/ — most distributions package lc0.',
      'win32-x64': 'Download a release from https://github.com/LeelaChessZero/lc0/releases',
    },
    notes:
      'Neural MCTS engine. Ships a built-in network; a stronger one can be pointed at with the WeightsFile option.',
    platforms: ['*'],
  },
  {
    id: 'stormphrax',
    name: 'Stormphrax 8.0.0',
    family: 'alphabeta',
    kind: 'binary',
    version: '8.0.0',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/Ciekce/Stormphrax',
    notes: 'Reports win/draw/loss alongside the evaluation.',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-apple-m1',
        file: 'stormphrax',
      },
      'linux-x64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-x86-64-v3',
        file: 'stormphrax',
      },
      'win32-x64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-x86-64-v3.exe',
        file: 'stormphrax.exe',
      },
    },
  },
  {
    id: 'stockfish-native',
    name: 'Stockfish 18 (native)',
    family: 'alphabeta',
    kind: 'binary',
    version: '18',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/official-stockfish/Stockfish',
    notes:
      'Much faster than the WebAssembly build, and needs the companion. ~115 MB, so it is opt-in.',
    optional: true,
    archive: 'tar',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-macos-m1-apple-silicon.tar',
        file: 'stockfish/stockfish-macos-m1-apple-silicon',
      },
      'darwin-x64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-macos-x86-64-avx2.tar',
        file: 'stockfish/stockfish-macos-x86-64-avx2',
      },
      'linux-x64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-ubuntu-x86-64-avx2.tar',
        file: 'stockfish/stockfish-ubuntu-x86-64-avx2',
      },
    },
  },
];

export const forPlatform = (entry) =>
  entry.kind === 'binary' ? entry.assets?.[PLATFORM] : entry.platforms?.includes('*') ? {} : null;
