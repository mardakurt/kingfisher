/**
 * Folders on the Databases grid (ChessBase's New Folder).
 *
 * A folder is a name and the ids of the collections inside it, stored beside
 * the search sets (`SourceSetRecord.kind === 'folder'`). It moves nothing:
 * a collection stays where its games are, and a folder only decides where
 * its tile is shown. These are the rules, kept apart from the page so they
 * can be checked without one.
 */

import type { SourceSetRecord } from '@/persistence/domain';

export interface FolderPlacement<T extends { readonly id: string }> {
  /** Collections in no folder, in the order given. */
  readonly loose: readonly T[];
  /** Each folder's collections that still exist, in the order given. */
  readonly inside: ReadonlyMap<string, readonly T[]>;
}

/**
 * Where each collection's tile goes. A collection named by two folders (only
 * possible from an edited backup) is shown in the first, by name, so it is
 * never shown twice or lost; an id with no collection behind it — a deleted
 * collection, an unpaired companion — is simply not shown.
 */
export function placeCollections<T extends { readonly id: string }>(
  collections: readonly T[],
  folders: readonly SourceSetRecord[],
): FolderPlacement<T> {
  const home = new Map<string, string>();
  for (const folder of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const id of folder.collectionIds) if (!home.has(id)) home.set(id, folder.id);
  }
  const inside = new Map<string, T[]>(folders.map((folder) => [folder.id, []]));
  const loose: T[] = [];
  for (const collection of collections) {
    const folderId = home.get(collection.id);
    if (folderId) inside.get(folderId)!.push(collection);
    else loose.push(collection);
  }
  return { loose, inside };
}

/**
 * The folder records that change when a collection moves into `target`, or
 * out of every folder when `target` is null: it leaves whichever folder had
 * it, and joins the target. Unchanged folders are not returned.
 */
export function moveIntoFolder(
  folders: readonly SourceSetRecord[],
  collectionId: string,
  target: string | null,
): readonly { readonly id: string; readonly collectionIds: readonly string[] }[] {
  const changes: { id: string; collectionIds: readonly string[] }[] = [];
  for (const folder of folders) {
    const has = folder.collectionIds.includes(collectionId);
    if (folder.id === target) {
      if (!has)
        changes.push({ id: folder.id, collectionIds: [...folder.collectionIds, collectionId] });
    } else if (has) {
      changes.push({
        id: folder.id,
        collectionIds: folder.collectionIds.filter((id) => id !== collectionId),
      });
    }
  }
  return changes;
}
