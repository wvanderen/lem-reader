// src/ingestion/library/librarySnapshotBus.ts
// Issue #101 (review follow-up) — the invalidation half of the library read
// model, split out of librarySnapshot.ts so the ONE write-followup call and
// its subscription are importable WITHOUT dragging the snapshot graph (the
// stores, the folds, the grapheme pass) onto an import chain.
//
// Two consumers depend on that split:
//   - Write paths on the every-load chain (App's add-followup, the settings
//     import) call invalidateLibrarySnapshot() from HERE — the call is the
//     same broadcast, the module is bytes.
//   - The deferred consumer (useDeferredLibrarySnapshot) subscribes at MOUNT
//     time — before its post-fonts/post-idle arm — so a write landing inside
//     the deferral window accelerates the load instead of racing it. No
//     window where a subscribed surface and this one can diverge.
//
// The bus is a plain broadcast set — no state, no caching, no third-party
// store (the AGENTS.md stack rule): consumers own their reload semantics.

const invalidationListeners = new Set<() => void>();

/**
 * invalidateLibrarySnapshot — call ONCE after a library write lands. Every
 * subscribed consumer reloads (stale-while-revalidate semantics belong to
 * the consumer's hook, not to this bus).
 */
export function invalidateLibrarySnapshot(): void {
  for (const listener of invalidationListeners) {
    listener();
  }
}

/**
 * onLibrarySnapshotInvalidated — subscribe to invalidation broadcasts.
 * Returns the unsubscribe function (the useEffect cleanup shape).
 */
export function onLibrarySnapshotInvalidated(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}
