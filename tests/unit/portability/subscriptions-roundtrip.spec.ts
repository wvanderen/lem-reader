// tests/unit/portability/subscriptions-roundtrip.spec.ts
// Issue #121 — the bundle-v6 truth: feed subscriptions ride the export
// bundle and MERGE into the receiving Discover list on import.
//
//   - writers emit schemaVersion 6 with an ALWAYS-present subscriptions
//     array (empty on a subscription-free library — the presence-is-the-
//     contract precedent)
//   - merge semantics: subscriptions merge by the NORMALIZED VALIDATED FEED
//     URL — a feedUrl already present locally keeps the LOCAL row (its
//     local preview cache is never clobbered); a new feedUrl always writes,
//     under a minted uuid when the incoming id collides locally with a
//     DIFFERENT feed. No new ConflictKind and no reader choice (the
//     reading-sessions ride-along precedent).
//   - NO NETWORK during import: the previews ride INSIDE the rows; the
//     whole import path runs with fetch stubbed to throw.
//   - older bundles (v1..v5, no subscriptions key) still import — the
//     union-read regression.
//
// Harness mirrors tests/unit/portability/bundle-v5.spec.ts (fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach,
// lazy module imports).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { ArticleSchema, SubscriptionRecordSchema } from "../../../src/content/schema";
import type {
  CanonicalArticle,
  SubscriptionRecord,
} from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import type { Overrides } from "../../../src/portability/conflicts";
import { computeManifest } from "../../../src/portability/manifest";
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

async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}
async function loadSubscriptionsStore() {
  return await import("../../../src/persistence/subscriptionsStore");
}

function sampleArticle(id = "art-subscription-rt01"): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/subscription-article",
      title: "Subscription Round Trip Article",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "6".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body text here.", marks: [] }] },
    ],
    footnotes: [],
  });
}

function sampleSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return SubscriptionRecordSchema.parse({
    schemaVersion: 1,
    id: "sub-a",
    feedUrl: "https://journal.example.com/feed.xml",
    title: "Journal Feed",
    items: [
      {
        title: "Entry one",
        link: "https://journal.example.com/one",
        datePublished: "2026-09-20T10:00:00.000Z",
        excerpt: "First entry.",
        image: "https://journal.example.com/one.png",
      },
    ],
    subscribedAt: "2026-09-28T08:00:00.000Z",
    ...overrides,
  });
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

function bundleJsonOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** Build a REAL bundle zip at the given generation (honestly-computed
 * manifest incl. the subscriptions block when present). */
async function bundleFile(
  articles: CanonicalArticle[],
  subscriptions: SubscriptionRecord[],
  opts: { omitSubscriptionBlock?: boolean; schemaVersion?: 4 | 5 | 6 } = {},
): Promise<File> {
  const envelope: Record<string, unknown> = {
    schemaVersion: opts.schemaVersion ?? 6,
    exportedAt: "2026-09-29T12:00:00.000Z",
    appVersion: "test",
    articles,
    locations: [],
    highlights: [],
    notes: [],
    preferences: {
      schemaVersion: 2 as const,
      font: "serif" as const,
      size: 18 as const,
      measure: 58 as const,
      spacing: "comfortable" as const,
      theme: "sepia" as const,
      readingMode: "paginated" as const,
    },
    fixtureIds: [],
    books: [],
    assets: [],
  };
  if (!opts.omitSubscriptionBlock) envelope.subscriptions = subscriptions;
  const bundle = ExportBundleSchema.parse(envelope);
  const manifest = await computeManifest(bundle);
  return zipFileOf({
    "bundle.json": bundleJsonOf(JSON.parse(JSON.stringify(bundle))),
    "manifest.json": bundleJsonOf(manifest),
  });
}

const ALL_SKIP: Overrides = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
};

describe("subscriptions bundle v6 (issue #121)", () => {
  beforeEach(async () => {
    await wipeDatabase();
    // NO NETWORK, structurally proven: any fetch during these imports is a
    // failure (the previews ride inside the rows — nothing re-fetches).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("import must not touch the network");
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writers emit v6 with the ALWAYS-present subscriptions array; a subscription-free library emits []", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();
    await db.articles.put(sampleArticle());
    await loadSubscriptionsStore().then((s) =>
      s.saveSubscription(sampleSubscription()),
    );

    let entries = unzipSync((await buildBundle()).bytes);
    let bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      subscriptions?: SubscriptionRecord[];
    };
    expect(bundleJson.schemaVersion).toBe(6);
    expect(bundleJson.subscriptions).toEqual([sampleSubscription()]);

    // The subscription-free library still emits the field (presence is the
    // v6 write contract).
    await wipeDatabase();
    await db.open();
    entries = unzipSync((await buildBundle()).bytes);
    bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!));
    expect(bundleJson.schemaVersion).toBe(6);
    expect(bundleJson.subscriptions).toEqual([]);
  });

  it("merges a duplicate by normalized feed URL keeping the LOCAL row + its cache; a new feed writes; an over-normalized spelling merges too", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { saveSubscription, loadAllSubscriptions } = await loadSubscriptionsStore();

    // LOCAL: subscription with the RICHER (fresher, reader-captured) cache.
    const localRow = sampleSubscription({
      items: [{ title: "Local fresher entry", excerpt: "The local cache." }],
    });
    await db.articles.put(sampleArticle());
    await saveSubscription(localRow);

    // BUNDLE: the same feed under a DIFFERENT id and a fragment-carrying
    // (non-normalized) spelling of the same URL, with a STALE cache + a
    // genuinely new feed.
    const staleDuplicate = sampleSubscription({
      id: "sub-incoming-dup",
      feedUrl: "https://journal.example.com/feed.xml#latest",
      title: "Journal Feed (stale)",
      items: [{ title: "Stale incoming entry" }],
    });
    const newFeed = sampleSubscription({
      id: "sub-incoming-new",
      feedUrl: "https://other.example.com/feed",
      title: "Other Feed",
    });
    const result = await validateBundle(
      await bundleFile([sampleArticle()], [staleDuplicate, newFeed]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    // Only the new feed rides the plan; the duplicate keeps local silently.
    expect(plan.subscriptionsToWrite.map((s) => s.id)).toEqual(["sub-incoming-new"]);
    await applyImport(plan);

    const rows = await loadAllSubscriptions();
    expect(rows).toHaveLength(2);
    // The LOCAL row + its cache survive byte-identically (never clobbered).
    expect(rows.find((r) => r.id === "sub-a")).toEqual(localRow);
    expect(rows.find((r) => r.id === "sub-incoming-new")).toEqual(newFeed);
  });

  it("mints a fresh id when the incoming id collides locally with a DIFFERENT feed (a put can never re-point a local row)", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { saveSubscription, getSubscriptionByFeedUrl } = await loadSubscriptionsStore();

    await db.articles.put(sampleArticle());
    await saveSubscription(sampleSubscription()); // owns id "sub-a"

    const incoming = sampleSubscription({
      id: "sub-a", // SAME id, DIFFERENT feed
      feedUrl: "https://elsewhere.example.com/feed.xml",
      title: "Elsewhere Feed",
    });
    const result = await validateBundle(await bundleFile([sampleArticle()], [incoming]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    expect(plan.subscriptionsToWrite).toHaveLength(1);
    const minted = plan.subscriptionsToWrite[0]!;
    expect(minted.id).not.toBe("sub-a");
    expect(minted.feedUrl).toBe("https://elsewhere.example.com/feed.xml");
    await applyImport(plan);

    // The local row is untouched; the incoming feed landed under the mint.
    expect((await getSubscriptionByFeedUrl("https://journal.example.com/feed.xml"))?.id).toBe("sub-a");
    expect(
      (await getSubscriptionByFeedUrl("https://elsewhere.example.com/feed.xml"))?.id,
    ).toBe(minted.id);
  });

  it("round-trip: export → wipe → import restores the subscription AND its preview cache (no network)", async () => {
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { saveSubscription, loadAllSubscriptions } = await loadSubscriptionsStore();

    const article = sampleArticle();
    const row = sampleSubscription();
    await db.articles.put(article);
    await saveSubscription(row);

    const bytes = (await buildBundle()).bytes;
    await wipeDatabase();
    await db.open();

    const result = await validateBundle(new File([new Uint8Array(bytes)], "rt.zip"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    await applyImport(plan);

    expect(await db.articles.get(article.id)).toEqual(article);
    expect(await loadAllSubscriptions()).toEqual([row]);
  });

  it("a v5 bundle (no subscriptions key) applies with ZERO subscription writes — the union-read regression", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllSubscriptions } = await loadSubscriptionsStore();

    const result = await validateBundle(
      await bundleFile([sampleArticle()], [], {
        omitSubscriptionBlock: true,
        schemaVersion: 5,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.subscriptions).toBeUndefined();

    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    expect(plan.subscriptionsToWrite).toEqual([]);
    await applyImport(plan);
    expect(await loadAllSubscriptions()).toEqual([]);
  });
});
