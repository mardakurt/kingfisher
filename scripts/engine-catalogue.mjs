/**
 * What Kingfisher knows how to install, and under what terms.
 *
 * One entry per engine, with a release asset per platform. Nothing is fetched
 * from anywhere that is not the engine project's own release page, every entry
 * carries its licence so `docs/ENGINES.md` can be checked against reality
 * rather than memory, and no asset is installed unless its SHA-256 is recorded
 * in `engine-digests.json`.
 *
 * `kind`:
 *   - `wasm`    runs in the browser; downloaded into `public/engine/`
 *   - `binary`  a native release asset; downloaded into `engines/`
 *   - `system`  already on the machine (a package manager installed it); the
 *               installer locates it and records the path, and downloads nothing
 *
 * `system` exists because it is the truthful answer for Lc0 on macOS and
 * Linux: the project ships no release asset for either, and building it during
 * an install would be a lie about how reliable that is. Homebrew's formula and
 * the distribution packages are official and maintained, so the honest thing is
 * to use them and say so.
 *
 * **Capabilities are not declared here.** MultiPV, WDL, `searchmoves` and
 * Syzygy support are read from the engine's own `uci` response at install
 * time and recorded then. A table in this file would be a claim about a
 * version; the handshake is a fact about the binary on the disk.
 */

import { readFileSync } from 'node:fs';

export const PLATFORM = `${process.platform}-${process.arch}`;

/**
 * Digests recorded by `npm run engines:digests`.
 *
 * What this proves, exactly: the file downloaded now is byte-identical to the
 * one this project downloaded when the digest was recorded. It is *not* a
 * signature and does not prove the release itself is authentic — no upstream
 * chess engine project publishes signed digests today. It does mean a release
 * asset silently replaced after the fact, or a download corrupted or
 * intercepted in transit, fails the install rather than being run.
 */
export const DIGESTS = JSON.parse(
  readFileSync(new URL('./engine-digests.json', import.meta.url), 'utf8'),
);

export const CATALOGUE = [
  {
    id: 'stockfish-wasm',
    name: 'Stockfish 17.1',
    family: 'alphabeta',
    kind: 'wasm',
    version: '17.1',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/official-stockfish/Stockfish',
    notes:
      'Runs in a Web Worker inside the browser. Needs no companion and no ' +
      'install; this is the engine a fresh Kingfisher analyses with.',
    platforms: ['*'],
    default: true,
  },
  {
    id: 'stockfish-native',
    name: 'Stockfish 18',
    family: 'alphabeta',
    kind: 'binary',
    version: '18',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/official-stockfish/Stockfish',
    notes:
      'The strongest engine there is, and several times faster than the ' +
      'WebAssembly build because it uses every core. ~115 MB.',
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
  {
    id: 'stormphrax',
    name: 'Stormphrax 8.0.0',
    family: 'alphabeta',
    kind: 'binary',
    version: '8.0.0',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/Ciekce/Stormphrax',
    notes: 'A strong NNUE alpha-beta engine that reports win/draw/loss as well as a score.',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-apple-m1',
        file: 'stormphrax',
      },
      'linux-x64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-avx2-bmi2',
        file: 'stormphrax',
      },
      'win32-x64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-avx2-bmi2.exe',
        file: 'stormphrax.exe',
      },
    },
  },
  {
    id: 'viridithas',
    name: 'Viridithas 20.0.0',
    family: 'alphabeta',
    kind: 'binary',
    version: '20.0.0',
    /*
      AGPL, not GPL, and the difference is recorded rather than rounded off.
      It changes nothing for a user running the binary — Kingfisher spawns it
      as a separate process and does not link against it — but a project that
      writes down licences only when they are convenient is not writing them
      down at all.
    */
    license: 'AGPL-3.0-or-later',
    source: 'https://github.com/cosmobobak/viridithas',
    notes: 'A strong independent NNUE engine, written in Rust.',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/cosmobobak/viridithas/releases/download/v20.0.0/viridithas-20-macos-aarch64',
        file: 'viridithas',
      },
      'linux-x64': {
        url: 'https://github.com/cosmobobak/viridithas/releases/download/v20.0.0/viridithas-20-linux-x86-64-v3',
        file: 'viridithas',
      },
      'win32-x64': {
        url: 'https://github.com/cosmobobak/viridithas/releases/download/v20.0.0/viridithas-20-win-x86-64-v3.exe',
        file: 'viridithas.exe',
      },
    },
  },
  {
    id: 'halogen',
    name: 'Halogen 16.0.0',
    family: 'alphabeta',
    kind: 'binary',
    version: '16.0.0',
    license: 'GPL-3.0-or-later',
    source: 'https://github.com/KierenP/Halogen',
    notes: 'A compact, strong NNUE engine. The smallest native download here, at about 20 MB.',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-macos-arm64-neon-dotprod',
        file: 'halogen',
      },
      'darwin-x64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-macos-x86_64-avx2',
        file: 'halogen',
      },
      'linux-x64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-linux-x86_64-avx2',
        file: 'halogen',
      },
      'win32-x64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-windows-x86_64-avx2.exe',
        file: 'halogen.exe',
      },
    },
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
      'A neural-network engine that searches by Monte-Carlo tree search rather ' +
      'than alpha-beta, so it often disagrees with Stockfish for interesting ' +
      'reasons. Its project publishes no macOS or Linux release asset, so ' +
      'Kingfisher locates a copy your package manager installed rather than ' +
      'downloading one.',
    platforms: ['*'],
  },
];

/**
 * Engines considered and left out.
 *
 * Recorded because "why is X not here" is a question with an answer, and
 * because the answers change: an engine that ships only a Windows binary today
 * may ship more tomorrow, and this is the list to re-check.
 */
export const NOT_INCLUDED = [
  {
    id: 'berserk',
    reason:
      'Release 14 (May 2026) publishes Windows executables only. An Install ' +
      'button that cannot work on the machine looking at it is worse than an ' +
      'absent row.',
  },
  {
    id: 'obsidian',
    reason: 'Release 16.0 publishes Windows executables only.',
  },
  {
    id: 'rubichess',
    reason:
      'The most recent release is from August 2024 and ships one Windows ' +
      'archive. Kingfisher offers actively released engines.',
  },
  {
    id: 'ethereal',
    reason:
      'Distribution model checked before considering it: recent Ethereal is ' +
      'sold commercially rather than released as a free binary, and its NNUE ' +
      'networks are not freely redistributable. It is not an open-source ' +
      'engine Kingfisher can install, and presenting it as one would be false.',
  },
  {
    id: 'koivisto',
    reason: 'No release since 2023; the project is not actively maintained.',
  },
];

/** The asset for this platform, or null when the engine is not offered here. */
export const forPlatform = (entry, platform = PLATFORM) =>
  entry.kind === 'binary'
    ? (entry.assets?.[platform] ?? null)
    : entry.platforms?.includes('*')
      ? {}
      : null;

/** Every entry installable on a platform, with its recorded digest. */
export function installable(platform = PLATFORM) {
  return CATALOGUE.map((entry) => {
    const asset = forPlatform(entry, platform);
    if (!asset) return null;
    if (entry.kind !== 'binary') return { entry, asset, sha256: null };
    const sha256 = DIGESTS[asset.url] ?? null;
    return { entry, asset, sha256 };
  }).filter((row) => row !== null);
}
