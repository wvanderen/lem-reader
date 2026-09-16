// src/reader/useReadingSession.ts
// Issue #34 — the reading-session lifecycle hook: turns ArticleView's reader
// input into activity pulses for ONE ReadingSessionRecorder per visit and
// owns the flush discipline. The hook is mode-agnostic by construction —
// pulses arrive from window scroll (scrolling mode + restore jumps),
// PaginatedSurface's onAnchorChange page-turn path (paginated mode — page
// turns fire NO window scroll, the 18-03 Pitfall 2 lesson), presence events
// (pointerdown/keydown), visibility, and the explicit mark-read gesture —
// so the idle cap behaves identically in both modes (issue #34 AC 2).
//
// Flush discipline (mirrors useScrollSave's dual-flush + debounce shape):
//   - an interval ticker credits + writes every FLUSH_INTERVAL_MS (crash
//     resilience — a hard tab close keeps the last flushed totals), skipping
//     no-op writes while idle (a parked tab writes nothing);
//   - visibilitychange-hidden + pagehide flush immediately (the bfcache-safe
//     dual flush — Pitfall 4; the deprecated session-end events stay
//     forbidden);
//   - the unmount/article-swap cleanup flushes the terminal row.
//   All writes are upserts by the per-visit uuid — append-only means ONE row
//   per visit, refined in place; a second visit appends a second row.
//
// StrictMode twin-mount coalescing (rule 17 — twin runs idempotent): a
// dormant session (no pulse, no credited time — the twin mount/unmount
// cycle is synchronous, so no ticker tick and no pulse can land inside it)
// is written AND stashed on end; if the same article reopens within
// REBEGIN_GUARD_MS the stash is revived — same visit id, same startedAt —
// and the upsert replaces the twin's row, so one open produces exactly one
// row in dev and production alike.
//
// Recording never interrupts reading (D2-13): every put failure is
// swallowed — stats are local-first and non-critical. No reader-visible
// surface exists in this ticket (the strip is #38).
import { useCallback, useEffect, useRef } from "react";
import { ReadingSessionRecorder } from "./readingSessionRecorder";
import { putReadingSession } from "../persistence/readingSessionsStore";

/** How often an active visit's row is flushed (crash-resilience cadence). */
export const FLUSH_INTERVAL_MS = 15_000;

/** Dormant-revival window: a reopen of the same article within this bound
 * adopts the stashed dormant visit instead of starting a new row (the
 * StrictMode twin-mount guard). */
export const REBEGIN_GUARD_MS = 2000;

/** The stash for a dormant session awaiting possible revival. Module-level:
 * the reader is a single-view SPA, and the stash must outlive the hook
 * effect's cleanup/mount boundary to do its job. */
let dormantStash: { recorder: ReadingSessionRecorder; endedAtMs: number } | null =
  null;

export interface UseReadingSessionOptions {
  /** Ticker cadence override (tests). */
  flushIntervalMs?: number;
  /** Idle-cap override (tests). */
  idleCapMs?: number;
  /** Clock override for the recorder (tests — deterministic accrual truth
   * tables without fake timers; the interval still runs on the real clock). */
  now?: () => number;
}

/**
 * useReadingSession(articleId, getOffset, options?) — record one
 * reading-session row per visit to the article. No-ops while articleId is
 * null (loading/error states — there is no article to attribute time to).
 * Returns `{ noteActivity }`: a stable pulse the host supplies from every
 * reading-activity source it owns (page turns, the mark-read gesture);
 * `offset` (canonical D-05) overrides the live anchor read when the caller
 * holds a more precise value at pulse time.
 *
 * @param articleId The article id, or null while loading/error.
 * @param getOffset Reads the reader's current canonical grapheme offset
 *   (ArticleView passes its continuously-fresh anchor ref).
 * @param options Optional test overrides (cadence/idle cap).
 */
export function useReadingSession(
  articleId: string | null,
  getOffset: () => number,
  options?: UseReadingSessionOptions,
): { noteActivity: (offset?: number) => void } {
  // Ref-stable closure pattern (mirrors useScrollSave): the listener and
  // timer closures read the LATEST getOffset/options through refs so the
  // effect deps stay minimal and the closures never go stale.
  const getOffsetRef = useRef(getOffset);
  getOffsetRef.current = getOffset;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const activeRef = useRef<ReadingSessionRecorder | null>(null);

  const writeRow = useCallback((rec: ReadingSessionRecorder) => {
    void putReadingSession(rec.toRecord())
      .then(() => rec.markWritten())
      .catch(() => {
        // Recording never interrupts reading (D2-13) — stats failures are
        // silent; the next flush retries the upsert by the same visit id.
      });
  }, []);

  /** Credit + write WITHOUT ending the visit (hidden/pagehide/ticker). */
  const flushActive = useCallback(
    (rec: ReadingSessionRecorder) => {
      rec.creditToNow();
      writeRow(rec);
    },
    [writeRow],
  );

  /** The test-overridable clock (defaults to Date.now). Guards the rebegin
   * window — the SAME injected clock the recorder uses, so a test can
   * expire the guard deterministically. */
  const clockNow = useCallback(
    (): number => (optionsRef.current?.now ?? Date.now)(),
    [],
  );

  /** End the active visit: write its terminal row; a dormant visit is ALSO
   * written (a zero-activity open is still a visit — decision #24) and
   * stashed for revival if the same article reopens within the guard.
   * Dormancy is decided BEFORE the terminal credit — the cleanup path runs
   * within milliseconds of begin, and the seeded idle window would
   * otherwise credit a sub-tick sliver that breaks the StrictMode
   * twin-mount coalescing. */
  const endActive = useCallback(() => {
    const rec = activeRef.current;
    if (!rec) return;
    activeRef.current = null;
    const dormant = rec.isDormant();
    rec.creditToNow();
    writeRow(rec);
    if (dormant) {
      dormantStash = { recorder: rec, endedAtMs: clockNow() };
    } else {
      // A real visit just closed: any pending dormant stash is stale (its
      // revival window belongs to an earlier mount episode) — drop it.
      dormantStash = null;
    }
  }, [writeRow, clockNow]);

  /** Begin (or revive) the visit for articleId. */
  const beginFor = useCallback(
    (id: string): ReadingSessionRecorder => {
      const nowMs = clockNow();
      const stash = dormantStash;
      dormantStash = null;
      if (
        stash &&
        stash.recorder.articleId === id &&
        nowMs - stash.endedAtMs <= REBEGIN_GUARD_MS
      ) {
        // Revival: same visit id + startedAt — the reopened visit continues
        // the stashed one (StrictMode twin mount, or a bounce-remount).
        return stash.recorder;
      }
      const rec = new ReadingSessionRecorder(id, {
        idleCapMs: optionsRef.current?.idleCapMs,
        now: optionsRef.current?.now,
      });
      rec.begin({ initialOffset: getOffsetRef.current() });
      return rec;
    },
    [clockNow],
  );

  /** The external pulse (page turns, mark-read; future read-aloud). Stable
   * identity — the host's callbacks can depend on it without churn. */
  const noteActivity = useCallback((offset?: number) => {
    const rec = activeRef.current;
    if (!rec) return;
    const o = offset ?? getOffsetRef.current();
    rec.activity(typeof o === "number" ? o : undefined);
  }, []);

  useEffect(() => {
    if (articleId === null) {
      endActive();
      return;
    }
    if (activeRef.current?.articleId !== articleId) {
      endActive();
      activeRef.current = beginFor(articleId);
    }

    const pulse = () => noteActivity();
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return; // held keys are one presence signal
      pulse();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // The dual-flush primary (Pitfall 4): persist totals at hide-time.
        // The visit stays ACTIVE — returning re-arms via the visible pulse.
        if (activeRef.current) flushActive(activeRef.current);
      } else {
        pulse();
      }
    };
    const onPageHide = () => {
      if (activeRef.current) flushActive(activeRef.current);
    };
    const intervalMs =
      optionsRef.current?.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    const timer = window.setInterval(() => {
      if (!activeRef.current) return;
      const current = activeRef.current;
      current.creditToNow();
      // Ticker writes only when something changed — an idle (parked) tab
      // stops writing entirely once its first flush landed.
      if (current.dirtySinceWrite()) writeRow(current);
    }, intervalMs);

    window.addEventListener("scroll", pulse, { passive: true });
    window.addEventListener("pointerdown", pulse, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", pulse);
      window.removeEventListener("pointerdown", pulse);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      endActive();
    };
  }, [articleId, beginFor, endActive, flushActive, noteActivity, writeRow]);

  return { noteActivity };
}
