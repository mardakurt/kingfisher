/**
 * Engines Kingfisher builds for itself, and the exact source it builds them from.
 *
 * `engine-catalogue.mjs` describes engines by their *published* release asset.
 * That is the right default — a binary the project itself built and released is
 * a stronger provenance claim than one this repository produced — but it leaves
 * platforms empty where a project publishes nothing, and macOS is where that
 * bites: Phase 18's matrix qualified five engines on Apple Silicon and two on
 * Intel, not because those engines do not work there but because nobody
 * publishes a build.
 *
 * So this is the other half: a controlled build from an exact upstream tag.
 *
 * ## The rules, and why each one is a rule
 *
 * **An exact tag and an exact commit.** Both are recorded, and the build
 * refuses if the tag no longer resolves to the commit. A tag is mutable; a
 * commit is not, and "we built the tag" is worth nothing if the tag moved. This
 * is what "do not compile arbitrary HEAD" means in practice.
 *
 * **No patches.** Nothing here edits the engine's source. If an engine needs a
 * change to build, that is a fact about the engine and belongs upstream, not in
 * a local diff nobody downstream can see.
 *
 * **Network dependencies are declared.** Every one of these engines downloads
 * its own neural network during the build, from the project's own release page.
 * That is a real dependency of the build and it is recorded rather than
 * discovered when the build breaks.
 *
 * **Licences are recorded, and distribution is not assumed.** All of these are
 * GPL or AGPL. Kingfisher building a binary for its own qualification matrix
 * is use, not conveyance; publishing one is conveyance and carries an
 * obligation to offer the corresponding source. Because nothing here is
 * patched, that obligation is satisfiable by the upstream tag itself — which is
 * exactly why "no patches" is a rule rather than a preference.
 */

/**
 * @typedef {object} EngineSource
 * @property {string} id            matches `engine-catalogue.mjs` where the engine is also published
 * @property {string} name
 * @property {string} version
 * @property {string} license
 * @property {string} repository    the project's own repository, and no mirror
 * @property {string} tag
 * @property {string} commit        what that tag must resolve to
 * @property {string} binary        the file the build produces, relative to `cwd`
 * @property {string[]} platforms   `${process.platform}-${process.arch}` values this build is declared for
 * @property {object} build         { cwd, command, args, env } — argv, never a shell string
 * @property {string[]} network     what the build downloads, and from where
 */

/** @type {EngineSource[]} */
export const SOURCES = [
  {
    id: 'berserk',
    name: 'Berserk 14',
    version: '14',
    license: 'GPL-3.0',
    repository: 'https://github.com/jhonnold/berserk',
    tag: '14',
    commit: '8ae895a6151695be4a50d4fb65b0c131659c513a',
    binary: 'src/berserk',
    /*
      Berserk publishes a Windows asset and nothing else, so every other row in
      its platform matrix was empty. Its makefile names `arm64` as a target
      explicitly, which is why this is the first one built rather than the
      hardest.
    */
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'],
    build: {
      cwd: 'src',
      command: 'make',
      args: ['build'],
      arch: {
        'darwin-arm64': ['ARCH=arm64'],
        'darwin-x64': ['ARCH=x86-64-avx2'],
        'linux-x64': ['ARCH=x86-64-avx2'],
        'linux-arm64': ['ARCH=arm64'],
      },
    },
    network: [
      'https://github.com/jhonnold/berserk-networks/releases/download/networks/berserk-9b84c340af7e.nn',
    ],
  },
];

/**
 * Engines that were tried on macOS and cannot be built there, with the reason.
 *
 * Recorded so that the next person to ask "why is the Apple Silicon column
 * shorter" gets an answer rather than a search. Every one of these is a fact
 * about the engine's own build system meeting the toolchain Apple ships, found
 * by running it — not a guess from reading a makefile.
 *
 * None of them is a defect in the engine. Each would build with GNU tooling,
 * and each would need this repository to patch the engine or to override the
 * flags its authors chose, which is exactly what the rules above forbid.
 */
export const NOT_BUILDABLE = [
  {
    id: 'obsidian',
    tag: 'v16.0',
    commit: '2838ce52c1a3f997cb1175b360cd8c6b2ae6791c',
    platform: 'darwin-arm64',
    reason:
      'Its makefile passes -flto-partition=one, which is a GCC option; Apple clang rejects it ' +
      '("unknown argument", suggesting -flto-partitions). It also passes -s to the linker, ' +
      'which Apple ld does not take.',
    tried: '2026-09-06',
  },
  {
    id: 'koivisto',
    tag: 'v9.0',
    commit: '2895237d7a4ff267752fb19852ce9868bdccb753',
    platform: 'darwin-arm64',
    reason:
      'Its CMakeLists requires -fopenmp, which Apple clang does not support, and links with ' +
      '-static and -Wl,--whole-archive, both of which are GNU ld options.',
    tried: '2026-09-06',
  },
];

export const sourceById = (id) => SOURCES.find((entry) => entry.id === id) ?? null;

/** Which of these declare a build for a platform. */
export const sourcesFor = (platform) =>
  SOURCES.filter((entry) => entry.platforms.includes(platform));
