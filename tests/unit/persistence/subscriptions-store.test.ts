// tests/unit/persistence/subscriptions-store.test.ts
// Issue #121 — the subscriptions persistence seam: Zod-at-boundary reads
// (corrupt rows dropped calmly), the normalized-feedUrl dedupe lookup, the
// plain-array export read, and the single-row delete. The fake-indexeddb
// registry discipline mirrors subscriptions-migration.spec.ts (a dedicated
// registry keeps the app singleton isolated from sibling specs).
import { beforeEach, describe, expect, it } from "vitest";
import { SubscriptionRecordSchema } from "../../../src/content/schema";
import type { SubscriptionRecord } from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

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

async function loadStores() {
  const dbModule = await import("../../../src/persistence/db");
  const store = await import("../../../src/persistence/subscriptionsStore");
  return { db: dbModule.db, store };
}

function sampleSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return SubscriptionRecordSchema.parse({
    schemaVersion: 1,
    id: "sub-a",
    feedUrl: "https://example.com/feed.xml",
    title: "Example Feed",
    description: "A calm feed",
    items: [
      {
        title: "Entry one",
        link: "https://example.com/one",
        datePublished: "2026-09-01T10:00:00.000Z",
        excerpt: "First entry body.",
      },
    ],
    subscribedAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  });
}

describe("subscriptionsStore (issue #121)", () => {
  beforeEach(wipeDatabase);

  it("saveSubscription + listSubscriptions round-trip a validated row; loadAllSubscriptions mirrors it", async () => {
    const { store } = await loadStores();
    const record = sampleSubscription();
    await store.saveSubscription(record);

    const listed = await store.listSubscriptions();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.subscriptions).toEqual([record]);

    expect(await store.loadAllSubscriptions()).toEqual([record]);
  });

  it("drops a corrupt row calmly on every read (STATE-04 — never coerces, never blocks)", async () => {
    const { db, store } = await loadStores();
    await store.saveSubscription(sampleSubscription());
    await db.subscriptions.put({
      schemaVersion: 1,
      id: "sub-corrupt",
      // Missing title + items — invalid per SubscriptionRecordSchema.
      feedUrl: "https://corrupt.example.com/feed.xml",
    } as unknown as SubscriptionRecord);
    await store.saveSubscription(sampleSubscription({ id: "sub-b", feedUrl: "https://b.example.com/feed.xml" }));

    const listed = await store.listSubscriptions();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.subscriptions.map((s) => s.id).sort()).toEqual(["sub-a", "sub-b"]);
    expect(await store.loadAllSubscriptions()).toHaveLength(2);
  });

  it("hasSubscriptionForFeed + getSubscriptionByFeedUrl key on the normalized feedUrl index", async () => {
    const { store } = await loadStores();
    expect(await store.hasSubscriptionForFeed("https://example.com/feed.xml")).toBe(false);
    expect(await store.getSubscriptionByFeedUrl("https://example.com/feed.xml")).toBeNull();

    await store.saveSubscription(sampleSubscription());

    expect(await store.hasSubscriptionForFeed("https://example.com/feed.xml")).toBe(true);
    const found = await store.getSubscriptionByFeedUrl("https://example.com/feed.xml");
    expect(found?.id).toBe("sub-a");
    // A different feed is not subscribed.
    expect(await store.hasSubscriptionForFeed("https://other.example.com/feed.xml")).toBe(false);
  });

  it("deleteSubscription removes exactly its row and is a calm no-op on an absent id", async () => {
    const { store } = await loadStores();
    await store.saveSubscription(sampleSubscription());
    await store.saveSubscription(sampleSubscription({ id: "sub-b", feedUrl: "https://b.example.com/feed.xml" }));

    await store.deleteSubscription("sub-a");
    let listed = await store.listSubscriptions();
    expect(listed.ok ? listed.subscriptions.map((s) => s.id) : []).toEqual(["sub-b"]);

    // Absent id — no throw, no change.
    await store.deleteSubscription("sub-does-not-exist");
    listed = await store.listSubscriptions();
    expect(listed.ok ? listed.subscriptions : []).toHaveLength(1);
  });
});
