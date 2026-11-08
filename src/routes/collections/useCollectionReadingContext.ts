// src/routes/collections/useCollectionReadingContext.ts
// Issue #247 — the READER's collection context hook: given the /col/
// <collectionId>/<entryId> route params (navigation context — ADR 0011,
// never a second saved position), loads the collection row and derives the
// end-of-entry card's input via the ONE selection algebra
// (continueCollection.ts's deriveCollectionReadingContext) over the settled
// LibrarySnapshot.
//
// Re-derivation discipline: the row is re-read on EVERY library-snapshot
// invalidation (the ONE broadcast every library write follows up with), so
// completion corrections, membership edits, and reorders landing mid-read
// refresh the orientation and the Next-reading target (issue #247 AC —
// "use current collection order and shared completion after edits or
// reading elsewhere"). A missing collection, a vanished anchor entry, or an
// unsettled library resolves to null — the reader degrades calmly to plain
// reading; no collection chrome can point at rows that are not there.
//
// The store seam's failures are absorbed here (getCollectionActiveEntry's
// fail-quiet discipline extended to the row read): a collection the reader
// cannot load renders as NO context, never as an error surface — the
// reading itself is independent of the collection (D2-13).
import { useEffect, useState } from "react";
import { getCollection } from "../../persistence/collectionsStore";
import { onLibrarySnapshotInvalidated } from "../../ingestion/library/librarySnapshotBus";
import {
  deriveCollectionReadingContext,
  entryResolverFrom,
  type CollectionReadingContext,
} from "./continueCollection";
import type { CollectionEntryLookup } from "./collectionEntries";
import type { Collection } from "../../content/schema";

export interface CollectionReadingContextInput {
  /** The /col/ route params; either absent → no context (null). */
  collectionId?: string;
  collectionEntryId?: string;
  /** The library's settled-ness: the derivation needs the snapshot folds. */
  libraryReady: boolean;
  /** The ONE entry-resolution lookup over the settled snapshot. */
  lookup: CollectionEntryLookup;
}

export function useCollectionReadingContext({
  collectionId,
  collectionEntryId,
  libraryReady,
  lookup,
}: CollectionReadingContextInput): CollectionReadingContext | null {
  const [collection, setCollection] = useState<Collection | null>(null);
  const hasContext = collectionId !== undefined && collectionEntryId !== undefined;

  // The row load + the ONE invalidation broadcast subscription. The id
  // change remounts the load (the CollectionDetailView load-effect shape).
  useEffect(() => {
    if (!hasContext || !libraryReady) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const loaded = await getCollection(collectionId!);
        if (!cancelled) setCollection(loaded);
      } catch {
        if (!cancelled) setCollection(null);
      }
    };
    void load();
    const unsubscribe = onLibrarySnapshotInvalidated(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [collectionId, collectionEntryId, hasContext, libraryReady]);

  if (!hasContext || !libraryReady || collection === null) return null;
  if (collection.id !== collectionId) return null;
  return deriveCollectionReadingContext(collection, collectionEntryId!, entryResolverFrom(lookup));
}
