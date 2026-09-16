// tests/unit/useReadingSession.test.tsx
// Issue #34 — the useReadingSession lifecycle + flush-discipline wiring
// (the hook is the ONLY producer of readingSessions rows):
//   - a visit records exactly ONE row; pulses set start/end offsets; the
//     unmount flush writes the terminal row
//   - a second visit appends a SECOND row (append-only, one row per visit)
//   - the dormant-revival guard coalesces a bounce remount into ONE visit
//     (the StrictMode twin-mount shape: dormant end → reopen within
//     REBEGIN_GUARD_MS → same visit id, same row)
//   - the ticker flushes WHILE mounted (crash resilience) and a parked tab
//     (no pulses) stops accruing at the idle cap
//   - visibilitychange-hidden flushes without ending the visit
//   - articleId null records nothing (loading/error states)
//
// Harness: fake-indexeddb via Dexie.dependencies at module top-level,
// lazy hook import (its import chain pulls the db module), RTL renderHook,
// REAL timers with a 25ms test ticker cadence, and an injected clock so
// both the accrual arithmetic AND the rebegin guard stay deterministic.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import type { ReadingSessionRecord } from "../../src/content/schema";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idb = (globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB;
    if (!idb) return resolve();
    const req = idb.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Lazy imports — AFTER the fake-indexeddb install.
async function loadHook() {
  return await import("../../src/reader/useReadingSession");
}
async function loadRows(): Promise<ReadingSessionRecord[]> {
  const { loadAllReadingSessions } = await import(
    "../../src/persistence/readingSessionsStore"
  );
  return loadAllReadingSessions();
}

/** A manually-advanced clock — accrual follows test time; the ticker runs
 * on the real clock and credits whatever the test advanced to. */
function makeClock(startAt = 0): { now(): number; advance(ms: number): void } {
  let t = startAt;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** Dispatch a scroll event — the hook's own scroll listener is the
 * scrolling-mode pulse source. */
function scrollOnce(): void {
  window.dispatchEvent(new Event("scroll"));
}

/** jsdom's visibilityState is redefinable per instance — shadow it for the
 * hidden-flush test (restore by redefining "visible"). */
function defineVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

beforeEach(wipeDatabase);
afterEach(cleanup);

describe("useReadingSession — one row per visit (issue #34 AC 1)", () => {
  it("a visit records exactly one row; pulses set start/end offsets; unmount flushes", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();
    let offset = 0;

    const { unmount } = renderHook(() =>
      useReadingSession("hook-visit-a", () => offset, {
        now: clock.now,
        idleCapMs: 60_000,
        flushIntervalMs: 25,
      }),
    );

    // Reader scrolls: the restore-landing pulse confirms the start offset,
    // later pulses move the end offset.
    offset = 4_200;
    scrollOnce();
    clock.advance(2_000);
    offset = 6_400;
    scrollOnce();

    unmount(); // the terminal flush (the write itself is async)

    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1);
      const visit = rows[0];
      expect(visit?.articleId).toBe("hook-visit-a");
      expect(visit?.startOffset).toBe(4_200);
      expect(visit?.endOffset).toBe(6_400);
      expect(visit?.activeSeconds).toBe(2);
      expect(visit?.schemaVersion).toBe(1);
    });
  });

  it("a second visit appends a second row with its own identity", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();

    const first = renderHook(() =>
      useReadingSession("hook-visit-b", () => 0, {
        now: clock.now,
        flushIntervalMs: 25,
      }),
    );
    clock.advance(1_000);
    first.unmount();

    // Past REBEGIN_GUARD_MS on the SAME clock — a genuinely new visit.
    clock.advance(60_000);
    const second = renderHook(() =>
      useReadingSession("hook-visit-b", () => 0, {
        now: clock.now,
        flushIntervalMs: 25,
      }),
    );
    second.unmount();

    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(2);
      // Two distinct visit identities (append-only — no merge).
      expect(new Set(rows.map((r) => r.id)).size).toBe(2);
      const sorted = [...rows].sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      );
      expect(new Date(sorted[1]?.startedAt ?? 0).getTime()).toBeGreaterThan(
        new Date(sorted[0]?.startedAt ?? 0).getTime(),
      );
    });
  });

  it("a dormant end + reopen within the guard coalesces into ONE visit (StrictMode twin shape)", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();

    // Mount 1: no pulses, immediate unmount — dormant, row written (0s).
    const twinA = renderHook(() =>
      useReadingSession("hook-twin-c", () => 0, {
        now: clock.now,
        flushIntervalMs: 25,
      }),
    );
    twinA.unmount();

    // Mount 2 within the guard (no clock advance): revives the stashed
    // visit — same id, so the terminal flush UPSERTS instead of appending.
    const twinB = renderHook(() =>
      useReadingSession("hook-twin-c", () => 0, {
        now: clock.now,
        flushIntervalMs: 25,
      }),
    );
    twinB.unmount();

    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.articleId).toBe("hook-twin-c");
    });
  });
});

describe("useReadingSession — flush discipline (issue #34 AC 5)", () => {
  it("the ticker flushes WHILE mounted and a parked tab stops accruing at the idle cap", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();

    const { unmount } = renderHook(() =>
      useReadingSession("hook-ticker-d", () => 0, {
        now: clock.now,
        idleCapMs: 60_000,
        flushIntervalMs: 25,
      }),
    );

    // Crash resilience: the visit's row lands WITHOUT any unmount.
    clock.advance(5_000);
    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.activeSeconds).toBe(5);
    });

    // Parked tab: no pulses for 10 minutes — credited stops at the 60s cap.
    // (The initial 5s sit INSIDE the begin-seeded cap window — there was no
    // pulse to re-arm it — so the total caps at exactly 60s.)
    clock.advance(10 * 60_000);
    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows[0]?.activeSeconds).toBe(60);
    });

    // Longer parking never inflates further — the ticker stops writing
    // (no dirty, no churn) and the capped total stands.
    clock.advance(10 * 60_000);
    await waitFor(async () => {
      // Give any (never-dirty) ticker fire a real tick to observe it.
      await new Promise((r) => setTimeout(r, 60));
      const rows = await loadRows();
      expect(rows[0]?.activeSeconds).toBe(60);
    });

    unmount();
  });

  it("visibilitychange-hidden flushes the row without ending the visit", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();

    const { unmount } = renderHook(() =>
      useReadingSession("hook-hidden-e", () => 0, {
        now: clock.now,
        flushIntervalMs: 3_600_000, // ticker effectively off — the hidden event is the flush
      }),
    );

    clock.advance(3_000);
    defineVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    // The row lands while STILL mounted (the visit continues on return).
    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.activeSeconds).toBe(3);
    });

    defineVisibility("visible");
    unmount();
    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1); // upserted, never duplicated
    });
  });

  it("the external pulse path (the paginated page-turn entry point) accrues and idle-caps with NO window scroll", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();
    let offset = 0;

    const { result, unmount } = renderHook(() =>
      useReadingSession("hook-paged-f", () => offset, {
        now: clock.now,
        idleCapMs: 60_000,
        flushIntervalMs: 25,
      }),
    );

    // Paginated page turns fire NO window scroll (the 18-03 Pitfall 2
    // shape) — ArticleView's handleAnchorChange calls noteActivity(offset)
    // directly. Drive ONLY that entry point here.
    offset = 300;
    result.current.noteActivity(offset); // turn 1 (confirm the start offset)
    clock.advance(30_000);
    offset = 700;
    result.current.noteActivity(offset); // turn 2 at t=30s
    clock.advance(300_000); // parked, no further turns — a real ticker tick lands the capped totals
    await waitFor(async () => {
      const rows = await loadRows();
      expect(rows).toHaveLength(1);
      // Credited: 30s between the turns + the 60s cap — never the parking.
      expect(rows[0]?.activeSeconds).toBe(30 + 60);
      expect(rows[0]?.startOffset).toBe(300);
      expect(rows[0]?.endOffset).toBe(700);
    });

    unmount();
  });

  it("articleId null records nothing (loading/error states)", async () => {
    const { useReadingSession } = await loadHook();
    const clock = makeClock();

    const { unmount } = renderHook(() =>
      useReadingSession(null, () => 0, {
        now: clock.now,
        flushIntervalMs: 25,
      }),
    );
    scrollOnce();
    clock.advance(5_000);
    unmount();

    await waitFor(async () => {
      // Settled, still nothing — a load that never resolved attributes no
      // time and writes no row.
      await new Promise((r) => setTimeout(r, 40));
      expect(await loadRows()).toHaveLength(0);
    });
  });
});
