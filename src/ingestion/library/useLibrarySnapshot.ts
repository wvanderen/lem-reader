// src/ingestion/library/useLibrarySnapshot.ts
// Issue #3 — the ONE loading/status machine for library surfaces. LibraryView
// (and the strip before it) each owned a "loading | ready | error" state
// machine around their own whole-library load; this hook owns it once, over
// the LibrarySnapshot module's single load + invalidation broadcast.
//
// Semantics (byte-preserving against the LibraryView machine it replaces):
//   - initial status "loading"; first settled load → "ready" (snapshot
//     populated) or "error" (the snapshot module's rejection routing).
//   - invalidation-triggered reloads NEVER return to "loading" and never
//     clear the settled snapshot — stale-while-revalidate, the Quick
//     260909-ahy discipline: consumers keep rendering the previous data
//     until the fresh snapshot lands (no section collapse, no flash).
//   - the StrictMode cancelled-flag discipline: each generation's load is
//     abandoned if a newer one starts (mirrors the [refreshKey] load
//     effect this hook replaces).
import { useEffect, useState } from "react";
import {
  EMPTY_LIBRARY_SNAPSHOT,
  loadLibrarySnapshot,
  onLibrarySnapshotInvalidated,
} from "./librarySnapshot";
import type { LibrarySnapshot } from "./librarySnapshot";

/** The library-load status union (the machine this hook owns). */
export type LibrarySnapshotStatus = "loading" | "ready" | "error";

export interface UseLibrarySnapshotResult {
  status: LibrarySnapshotStatus;
  /** The latest settled snapshot. EMPTY_LIBRARY_SNAPSHOT until the first
   * load settles; stays stale (truthful last-known data) across reloads. */
  snapshot: LibrarySnapshot;
}

export function useLibrarySnapshot(): UseLibrarySnapshotResult {
  const [status, setStatus] = useState<LibrarySnapshotStatus>("loading");
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(EMPTY_LIBRARY_SNAPSHOT);
  // The invalidation handle — the hook-local analogue of the refreshKey
  // state it replaces; the module broadcast bumps it, the effect re-runs.
  const [generation, setGeneration] = useState(0);

  // Subscribe to write-followup invalidations for this mount's lifetime.
  // The unsubscribe return is the cleanup — idempotent under StrictMode.
  useEffect(() => onLibrarySnapshotInvalidated(() => setGeneration((g) => g + 1)), []);

  useEffect(() => {
    let cancelled = false;
    loadLibrarySnapshot()
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        // The snapshot module rejected (articles/locations/tags read
        // failed). The settled snapshot stays mounted — only the status
        // routes recovery — exactly the old load effect's catch arm.
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { status, snapshot };
}
