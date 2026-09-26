// tests/unit/useScrollSave.test.tsx
// Issue #102 — the location-write → library-snapshot invalidation seam.
// The reader's saveLocation call-site family is singular (useScrollSave's
// flush()); after a write LANDS it must fire the ONE
// invalidateLibrarySnapshot() broadcast so the shell's Read destination
// (AppInner's deferred snapshot + deriveResumeTargets) re-derives live —
// appearing, rolling, or hiding without a page reload. Pinned here:
//   - a debounced write lands → exactly ONE broadcast, and the persisted
//     row exists (the broadcast is the .then side — it cannot precede the
//     landed write)
//   - coalesced schedules inside the debounce window produce ONE write +
//     ONE broadcast (latest-wins) — "one snapshot reload per write
//     coalesce" (the issue's ACPT-04 discipline)
//   - the visibilitychange-hidden flush lands + broadcasts immediately
//     (well inside the debounce window)
//   - saveLocationNow (the synchronous "Mark read and close" seam)
//     broadcasts
//   - a FAILED write routes STATE-05 through onStorageError and broadcasts
//     NOTHING (no persisted change → no re-derive)
//
// Harness mirrors tests/unit/useReadingSession.test.tsx: fake-indexeddb via
// Dexie.dependencies at module top-level, lazy hook import (its import
// chain pulls the db module), RTL renderHook, REAL timers (the hook's
// SAVE_DEBOUNCE_MS window is asserted by wall clock), and a passthrough
// saveLocation mock so the failure test can reject ONCE without touching
// the write-path tests.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import type { CanonicalArticle, LocationRecord } from "../../src/content/schema";
import { ArticleSchema } from "../../src/content/schema";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

// Passthrough mock: saveLocation stays REAL by default (the writes must
// exercise the actual Dexie seam); the failure test rejects exactly once.
vi.mock("../../src/persistence/locationStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/persistence/locationStore")>();
  return { ...actual, saveLocation: vi.fn(actual.saveLocation) };
});

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
  return await import("../../src/reader/useScrollSave");
}
async function loadBus() {
  return await import("../../src/ingestion/library/librarySnapshotBus");
}
async function loadRows(): Promise<LocationRecord[]> {
  const { loadAllLocations } = await import("../../src/persistence/locationStore");
  return loadAllLocations();
}
async function loadSaveLocationMock() {
  const store = await import("../../src/persistence/locationStore");
  return vi.mocked(store.saveLocation);
}

/** The hook's own debounce window (src/reader/useScrollSave.ts): 1200ms.
 * The success-path tests wait it out on the real clock via waitFor; the
 * hidden-flush/saveLocationNow tests pass well inside it (the immediacy
 * proof), so the constant stays cited here in comments only. */
const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Node-built schema-valid standalone (the read-nav.spec makeStandalone
 * discipline — the record only needs id/revision/lang; the offset comes
 * from the driven scheduler seam, never from DOM measurement). */
const article: CanonicalArticle = ArticleSchema.parse({
  id: "scroll-save-inval",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Scroll Save Invalidation Fixture",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"3".repeat(64)}`,
  },
  blocks: [{ kind: "paragraph", content: [{ text: "Body text.", marks: [] }] }],
});

/** jsdom's visibilityState is redefinable per instance — shadow it for the
 * hidden-flush test (restore by redefining "visible"). */
function defineVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

/** Subscribe a broadcast counter (every test's prologue); the returned
 * getter reads the count and the caller owns the unsubscribe. */
async function subscribeBroadcastCounter(): Promise<{
  count(): number;
  unsub(): void;
}> {
  const bus = await loadBus();
  let broadcasts = 0;
  const unsub = bus.onLibrarySnapshotInvalidated(() => {
    broadcasts += 1;
  });
  return { count: () => broadcasts, unsub };
}

beforeEach(async () => {
  await wipeDatabase();
  // mockReset restores the factory passthrough (vi.fn(actual.saveLocation))
  // and clears any unconsumed mockRejectedValueOnce from a prior test.
  const saveLocationMock = await loadSaveLocationMock();
  saveLocationMock.mockReset();
});

afterEach(cleanup);

describe("useScrollSave — the landed write broadcasts ONE invalidation (issue #102)", () => {
  it("a debounced write lands, then broadcasts exactly once", async () => {
    const { useScrollSave } = await loadHook();
    const broadcasts = await subscribeBroadcastCounter();

    const { result } = renderHook(() => useScrollSave(article, { current: null }));
    result.current.scheduleLocationSave(42);

    // The debounce window is 1200ms — the broadcast arriving inside this
    // waitFor proves the real timer flushed and the write landed first
    // (the broadcast is the promise's .then side).
    await waitFor(() => expect(broadcasts.count()).toBe(1), { timeout: 5_000 });
    // No second broadcast from a write that already landed.
    await settle(150);
    expect(broadcasts.count()).toBe(1);

    const rows = await loadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.articleId).toBe("scroll-save-inval");
    expect(rows[0]?.revision).toBe(1);
    expect(rows[0]?.graphemeOffset).toBe(42);
    broadcasts.unsub();
  });

  it("coalesced schedules inside the window: ONE write, ONE broadcast, latest-wins", async () => {
    const { useScrollSave } = await loadHook();
    const broadcasts = await subscribeBroadcastCounter();

    const { result } = renderHook(() => useScrollSave(article, { current: null }));
    result.current.scheduleLocationSave(1);
    result.current.scheduleLocationSave(2);
    result.current.scheduleLocationSave(3);

    await waitFor(() => expect(broadcasts.count()).toBe(1), { timeout: 5_000 });
    await settle(150);
    expect(broadcasts.count()).toBe(1);

    const rows = await loadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.graphemeOffset).toBe(3);
    broadcasts.unsub();
  });

  it("the visibilitychange-hidden flush lands + broadcasts immediately (inside the debounce window)", async () => {
    const { useScrollSave } = await loadHook();
    const broadcasts = await subscribeBroadcastCounter();

    const { result } = renderHook(() => useScrollSave(article, { current: null }));
    result.current.scheduleLocationSave(7);
    defineVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    // The write + broadcast must NOT wait out the 1200ms debounce — this
    // waitFor passing in well under it is the immediacy proof.
    await waitFor(() => expect(broadcasts.count()).toBe(1), { timeout: 800 });
    const rows = await loadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.graphemeOffset).toBe(7);

    defineVisibility("visible");
    broadcasts.unsub();
  });

  it("saveLocationNow (the synchronous mark-read seam) lands + broadcasts", async () => {
    const { useScrollSave } = await loadHook();
    const broadcasts = await subscribeBroadcastCounter();

    const { result } = renderHook(() => useScrollSave(article, { current: null }));
    result.current.saveLocationNow(9);

    await waitFor(() => expect(broadcasts.count()).toBe(1), { timeout: 800 });
    const rows = await loadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.graphemeOffset).toBe(9);
    broadcasts.unsub();
  });

  it("a FAILED write routes STATE-05 and broadcasts nothing", async () => {
    const { useScrollSave } = await loadHook();
    const saveLocationMock = await loadSaveLocationMock();
    saveLocationMock.mockRejectedValueOnce(new Error("simulated storage failure"));
    const broadcasts = await subscribeBroadcastCounter();
    const onStorageError = vi.fn();

    const { result } = renderHook(() =>
      useScrollSave(article, { current: null }, { onStorageError }),
    );
    result.current.scheduleLocationSave(5);
    defineVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    // The failure routes through the STATE-05 vocabulary (unknown error
    // name → the conservative "unavailable").
    await waitFor(() => expect(onStorageError).toHaveBeenCalledWith("unavailable"), {
      timeout: 2_000,
    });
    // Nothing landed → nothing re-derives.
    await settle(150);
    expect(broadcasts.count()).toBe(0);
    expect(await loadRows()).toHaveLength(0);

    defineVisibility("visible");
    broadcasts.unsub();
  });
});
