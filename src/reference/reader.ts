/**
 * Reading a reference pack.
 *
 * A pack is sharded so that answering a question touches one chunk. This is
 * the piece that turns "which chunk" into "the decoded rows", and it is where
 * the size of a reference source stops mattering: a two-hundred-megabyte pack
 * and a two-megabyte one both answer a position from a few hundred kilobytes.
 *
 * Chunks are held compressed wherever they are stored and decompressed here,
 * for three reasons: storage is a third of the size, the bytes stay byte-
 * identical to what the digest in the manifest covers (so integrity is
 * checkable at any time, not only at install), and `DecompressionStream` is
 * native in every browser this application supports.
 */

import {
  decodeExplorerLine,
  decodeGameLine,
  decodePlayerGamesLine,
  decodePlayerLine,
  shardOf,
  chunkId,
  type PackChunkKind,
  type PackGame,
  type PackManifest,
  type PackPlayer,
  type PackPosition,
} from './pack';

/** Where chunk bytes come from. Installed packs and static ones differ only here. */
export interface ChunkSource {
  read(manifest: PackManifest, chunk: string): Promise<Uint8Array | null>;
}

export async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const text: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 128 * 1024 * 1024)
        throw new Error('Reference shard exceeds the 128 MiB decoded limit.');
      text.push(decoder.decode(next.value, { stream: true }));
    }
    text.push(decoder.decode());
    return text.join('');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** SHA-256 of the compressed chunk, as hex, for checking against the manifest. */
export async function digestOf(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const lines = (text: string): string[] => (text.length === 0 ? [] : text.split('\n'));

/**
 * How many decoded shards to keep.
 *
 * Eight is one explorer shard for each of a handful of positions the user is
 * moving between, plus the game and player shards a profile view touches. The
 * bound exists because a research session that walks a whole opening tree
 * would otherwise decode and retain every shard in the pack.
 */
const CACHE_LIMIT = 8;

export class PackReader {
  private readonly cache = new Map<string, Promise<Map<string, string>>>();
  private players: Promise<readonly PackPlayer[]> | null = null;

  constructor(
    readonly manifest: PackManifest,
    private readonly source: ChunkSource,
  ) {}

  private async rows(kind: PackChunkKind, shard: number): Promise<Map<string, string>> {
    const id = chunkId(kind, shard);
    const hit = this.cache.get(id);
    if (hit) {
      // Re-insert so the most recently used entry is last, which is what the
      // eviction below relies on.
      this.cache.delete(id);
      this.cache.set(id, hit);
      return hit;
    }

    const pending = (async () => {
      const bytes = await this.source.read(this.manifest, id);
      const map = new Map<string, string>();
      const descriptor = this.manifest.chunks.find((chunk) => chunk.id === id);
      if (!bytes || !descriptor)
        throw new Error(`Reference chunk ${id} is missing. Verify or reinstall this pack.`);
      if (bytes.byteLength !== descriptor.bytes || (await digestOf(bytes)) !== descriptor.sha256) {
        throw new Error(`Reference chunk ${id} is damaged. Verify or reinstall this pack.`);
      }
      for (const line of lines(await gunzip(bytes))) {
        if (line.length === 0) continue;
        const separator = line.indexOf(kind === 'game' || kind === 'players' ? '\t' : '|');
        if (separator < 1) continue;
        map.set(line.slice(0, separator), line);
      }
      return map;
    })();

    this.cache.set(id, pending);
    void pending.catch(() => {
      if (this.cache.get(id) === pending) this.cache.delete(id);
    });
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return pending;
  }

  private shardCount(kind: PackChunkKind): number {
    return this.manifest.shards[kind] ?? 1;
  }

  async position(key: string): Promise<PackPosition | null> {
    const rows = await this.rows('explorer', shardOf(key, this.shardCount('explorer')));
    const line = rows.get(key);
    return line ? decodeExplorerLine(line) : null;
  }

  async game(id: string): Promise<PackGame | null> {
    const rows = await this.rows('game', shardOf(id, this.shardCount('game')));
    const line = rows.get(id);
    return line ? decodeGameLine(line) : null;
  }

  async games(ids: readonly string[]): Promise<readonly PackGame[]> {
    const found: PackGame[] = [];
    // Grouped by shard so a list of six games from one event decodes one chunk.
    const byShard = new Map<number, string[]>();
    for (const id of ids) {
      const shard = shardOf(id, this.shardCount('game'));
      const bucket = byShard.get(shard);
      if (bucket) bucket.push(id);
      else byShard.set(shard, [id]);
    }
    for (const [shard, group] of byShard) {
      const rows = await this.rows('game', shard);
      for (const id of group) {
        const line = rows.get(id);
        const game = line ? decodeGameLine(line) : null;
        if (game) found.push(game);
      }
    }
    // Back into the order asked for, which is the order the caller ranked them.
    const order = new Map(ids.map((id, index) => [id, index]));
    return found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async player(key: string): Promise<PackPlayer | null> {
    const rows = await this.rows('players', shardOf(key, this.shardCount('players')));
    const line = rows.get(key);
    return line ? decodePlayerLine(line) : null;
  }

  async playerGames(key: string): Promise<readonly string[]> {
    const rows = await this.rows('playergames', shardOf(key, this.shardCount('playergames')));
    const line = rows.get(key);
    return line ? (decodePlayerGamesLine(line)?.games ?? []) : [];
  }

  /**
   * Every player in the pack, for search.
   *
   * Searching by name has no shard to go to — a substring can be anywhere — so
   * this is the one read that loads a whole kind. It is bounded by the player
   * table being the smallest thing in a pack (tens of thousands of short rows,
   * under a megabyte compressed) and it is loaded once per session.
   */
  allPlayers(): Promise<readonly PackPlayer[]> {
    this.players ??= (async () => {
      const all: PackPlayer[] = [];
      for (let shard = 0; shard < this.shardCount('players'); shard += 1) {
        const rows = await this.rows('players', shard);
        for (const line of rows.values()) {
          const player = line.length > 0 ? decodePlayerLine(line) : null;
          if (player) all.push(player);
        }
      }
      all.sort((a, b) => b.games - a.games);
      return all;
    })().catch((error: unknown) => {
      this.players = null;
      throw error;
    });
    return this.players;
  }
}
