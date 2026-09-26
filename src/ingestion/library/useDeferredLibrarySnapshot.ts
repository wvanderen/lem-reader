// src/ingestion/library/useDeferredLibrarySnapshot.ts
// Issue #101 — the shell's deferred consumer of the ONE LibrarySnapshot, the
// twin of useLibrarySnapshot with the load DEFERRED off the cold path. Same
// semantics, byte for byte, with one difference: WHEN the first load starts.
//
// Why a twin and not an option on useLibrarySnapshot: the eager hook
// statically imports the snapshot module, and this consumer (App, the
// every-load chain) must not — the whole point of #101 is that the snapshot
// graph (IDB seams, folds, grapheme pass) loads only when the read starts.
// So the deferral OWNS the dynamic import: the module graph itself is part
// of the deferred arm.
//
// Semantics (the useLibrarySnapshot contract, preserved):
//   - status "loading" until the first settled load; then "ready" or
//     "error". Errors route calm — the consumer hides its spare chrome (the
//     D2-13 discipline); nothing here surfaces a failure state.
//   - invalidation-triggered reloads never show a reload state and never
//     clear the settled snapshot — stale-while-revalidate (the Quick
//     260909-ahy discipline).
//   - the StrictMode cancelled-flag discipline per generation (mirrors the
//     eager hook's [generation] load effect).
//
// The deferral (generation 0 ONLY — the cold-path load):
//   1. fonts settle first (whenFontsReady — the ONE font-readiness gate):
//      the article engine awaits fonts BEFORE its first measurement, and an
//      idle gap inside that wait would start this read in the middle of the
//      ACPT-04 cold phase (page load → first trusted commit). Where the
//      FontFaceSet API is absent (jsdom, old engines) there is nothing to
//      wait for.
//   2. then the browser goes idle (requestIdleCallback; setTimeout where
//      absent), and ONLY THEN does the snapshot module import + read run.
//
// The pure derivations over the settled snapshot (deriveResumeTargets,
// deriveTagStats) ride the SAME deferred arm as modules — #101 A/B
// measurement showed static-importing them into the shell graph cost webkit
// cold ~180ms (4 extra dev-server module fetches under gate contention, the
// difference between the gate passing and failing). They surface through
// `derive` the moment the arm lands — the consumer only needs them once the
// snapshot is ready, which is strictly after the arm.
//
// A write landing inside the deferral window does NOT wait it out: the bus
// subscription is armed at MOUNT time (librarySnapshotBus is bytes), so the
// broadcast bumps generation and the load runs immediately — a write implies
// the reader is already past first paint. No window where this surface and
// an eagerly-subscribed one can diverge.
import { useEffect, useState } from "react";
import { onLibrarySnapshotInvalidated } from "./librarySnapshotBus";
import { whenFontsReady } from "../../measurement/fontGate";
import type { LibrarySnapshot } from "./librarySnapshot";
import type { LibrarySnapshotStatus } from "./useLibrarySnapshot";

/** The derivation modules the deferred arm carries (never the static graph). */
interface DeferredDerivations {
  deriveResumeTargets: typeof import("./resumeTarget").deriveResumeTargets;
  deriveTagStats: typeof import("./tagStats").deriveTagStats;
}

export interface UseDeferredLibrarySnapshotResult {
  status: LibrarySnapshotStatus;
  /** The latest settled snapshot; null until the first load settles (and
   * null on error — the consumer's spare chrome renders nothing either
   * way, so there is no EMPTY literal to import the graph for). */
  snapshot: LibrarySnapshot | null;
  /** The pure folds over the snapshot (the #82 resume derivation, the #71
   * tag-stats fold) — null until the deferred arm's modules land, which is
   * always before the first snapshot can settle. */
  derive: DeferredDerivations | null;
}

export function useDeferredLibrarySnapshot(): UseDeferredLibrarySnapshotResult {
  const [status, setStatus] = useState<LibrarySnapshotStatus>("loading");
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [derive, setDerive] = useState<DeferredDerivations | null>(null);
  // The invalidation handle — the eager hook's idiom: the module broadcast
  // bumps it, the load effect re-runs. Generation 0 is the deferred first
  // load; any bump is a write, and a write implies post-idle.
  const [generation, setGeneration] = useState(0);

  // Subscribe for this mount's lifetime — AT MOUNT, not at arm time, so a
  // write inside the deferral window converges immediately. The unsubscribe
  // return is the cleanup — idempotent under StrictMode.
  useEffect(() => onLibrarySnapshotInvalidated(() => setGeneration((g) => g + 1)), []);

  useEffect(() => {
    let cancelled = false;
    let cancelSchedule: () => void = () => {};

    const scheduleIdle = (cb: () => void): (() => void) => {
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(() => {
          if (!cancelled) cb();
        });
        return () => window.cancelIdleCallback(id);
      }
      const t = window.setTimeout(() => {
        if (!cancelled) cb();
      }, 0);
      return () => window.clearTimeout(t);
    };

    const run = () => {
      // The ONE deferred import: the snapshot module (and everything it
      // composes) enters the graph HERE, post-fonts/post-idle, together
      // with the pure derivation modules. The snapshot module is a data
      // seam, not a cache — every load re-reads the stores — so this one
      // path serves the first load AND every invalidation follow-up below.
      void Promise.all([
        import("./librarySnapshot"),
        import("./resumeTarget"),
        import("./tagStats"),
      ])
        .then(([snapshotModule, resumeModule, tagsModule]) => {
          if (cancelled) return;
          setDerive({
            deriveResumeTargets: resumeModule.deriveResumeTargets,
            deriveTagStats: tagsModule.deriveTagStats,
          });
          return snapshotModule
            .loadLibrarySnapshot()
            .then((next) => {
              if (cancelled) return;
              setSnapshot(next);
              setStatus("ready");
            })
            .catch(() => {
              if (cancelled) return;
              // The read failed; the shell's spare chrome routes calm
              // absence (hidden link, empty stats) — never an error state.
              setStatus("error");
            });
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error");
        });
    };

    if (generation === 0) {
      // The deferred arm — fonts settle, THEN idle, THEN the read.
      void whenFontsReady().then(() => {
        if (cancelled) return;
        cancelSchedule = scheduleIdle(run);
      });
    } else {
      // A write landed (the bus broadcast): load now — stale-while-
      // revalidate, the eager hook's reload shape.
      run();
    }
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [generation]);

  return { status, snapshot, derive };
}
