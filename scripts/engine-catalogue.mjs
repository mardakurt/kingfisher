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
    name: 'Stockfish 18',
    family: 'alphabeta',
    kind: 'wasm',
    version: '18',
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
      'Official native Stockfish. Search speed depends on hardware, thread ' +
      'and hash settings; it is not interchangeable with a browser-version measurement.',
    archive: 'tar',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-macos-m1-apple-silicon.tar',
        file: 'stockfish/stockfish-macos-m1-apple-silicon',
      },
      'darwin-x64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-macos-x86-64.tar',
        file: 'stockfish/stockfish-macos-x86-64',
      },
      'linux-x64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-ubuntu-x86-64.tar',
        file: 'stockfish/stockfish-ubuntu-x86-64',
      },
      'win32-x64': {
        url: 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64.zip',
        file: 'stockfish/stockfish-windows-x86-64.exe',
        archive: 'zip',
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
        requires: ['avx2', 'bmi2'],
      },
      'win32-x64': {
        url: 'https://github.com/Ciekce/Stormphrax/releases/download/v8.0.0/stormphrax-8.0.0-avx2-bmi2.exe',
        file: 'stormphrax.exe',
        requires: ['avx2', 'bmi2'],
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
    license: 'AGPL-3.0-only',
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
        requires: ['avx2', 'bmi2', 'fma', 'sse4_2', 'popcnt'],
      },
      'win32-x64': {
        url: 'https://github.com/cosmobobak/viridithas/releases/download/v20.0.0/viridithas-20-win-x86-64-v3.exe',
        file: 'viridithas.exe',
        requires: ['avx2', 'bmi2', 'fma', 'sse4_2', 'popcnt'],
      },
      'linux-arm64': {
        url: 'https://github.com/cosmobobak/viridithas/releases/download/v20.0.0/viridithas-20-linux-aarch64-generic',
        file: 'viridithas',
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
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-macos-x86_64-legacy',
        file: 'halogen',
      },
      'linux-x64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-linux-x86_64-legacy',
        file: 'halogen',
      },
      'win32-x64': {
        url: 'https://github.com/KierenP/Halogen/releases/download/v16/Halogen-16.0.0-windows-x86_64-legacy.exe',
        file: 'halogen.exe',
      },
    },
  },
  {
    id: 'plentychess',
    name: 'PlentyChess 8.0.0',
    family: 'alphabeta',
    kind: 'binary',
    version: '8.0.0',
    license: 'GPL-3.0',
    source: 'https://github.com/Yoshie2000/PlentyChess',
    notes:
      'An actively developed independent NNUE engine. Generic x64 builds are ' +
      'used where the companion cannot prove AVX2 support; Apple and Linux arm64 use NEON.',
    assets: {
      'darwin-arm64': {
        url: 'https://github.com/Yoshie2000/PlentyChess/releases/download/b-v8.0.0/PlentyChess-8.0.0-macos-neon',
        file: 'plentychess',
      },
      'linux-arm64': {
        url: 'https://github.com/Yoshie2000/PlentyChess/releases/download/b-v8.0.0/PlentyChess-8.0.0-linux-neon',
        file: 'plentychess',
      },
      'linux-x64': {
        url: 'https://github.com/Yoshie2000/PlentyChess/releases/download/b-v8.0.0/PlentyChess-8.0.0-linux-generic',
        file: 'plentychess',
      },
      'win32-x64': {
        url: 'https://github.com/Yoshie2000/PlentyChess/releases/download/b-v8.0.0/PlentyChess-8.0.0-windows-generic.exe',
        file: 'plentychess.exe',
      },
    },
  },
  {
    id: 'berserk',
    name: 'Berserk 14',
    version: '14',
    family: 'alphabeta',
    kind: 'binary',
    license: 'GPL-3.0',
    source: 'https://github.com/jhonnold/berserk',
    notes:
      'Official May 2026 release. Windows x64 only; no native macOS/Linux asset is offered by this release.',
    assets: {
      'win32-x64': {
        url: 'https://github.com/jhonnold/berserk/releases/download/14/berserk-14-x86-64.exe',
        file: 'berserk.exe',
      },
    },
  },
  {
    id: 'koivisto',
    name: 'Koivisto 9.0',
    version: '9.0',
    family: 'alphabeta',
    kind: 'binary',
    license: 'GPL-3.0',
    source: 'https://github.com/Luecx/Koivisto',
    notes:
      'Historical stable release from January 2023, not an actively updated engine. SSE2 builds are compatible with baseline x64.',
    assets: {
      'linux-x64': {
        url: 'https://github.com/Luecx/Koivisto/releases/download/v9.0/Koivisto_9.0-linux-sse2-pgo',
        file: 'koivisto',
      },
      'win32-x64': {
        url: 'https://github.com/Luecx/Koivisto/releases/download/v9.0/Koivisto_9.0-windows-sse2-pgo.exe',
        file: 'koivisto.exe',
      },
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian 16.0',
    version: '16.0',
    family: 'alphabeta',
    kind: 'binary',
    license: 'GPL-3.0',
    source: 'https://github.com/gab8192/Obsidian',
    notes:
      'Official May 2025 release, Windows only. Requires confirmed AVX2 support; no generic artifact is published.',
    assets: {
      'win32-x64': {
        url: 'https://github.com/gab8192/Obsidian/releases/download/v16.0/Obsidian160-avx2.exe',
        file: 'obsidian.exe',
        requires: ['avx2'],
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
