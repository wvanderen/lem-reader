// tests/unit/portability/bundle-v5.spec.ts
// Issue #37 — the bundle-v5 truth: reading sessions ride the export bundle
// and MERGE into the receiving history on import.
//
//   - writers emit schemaVersion 5 with an ALWAYS-present readingSessions
//     array (empty on a session-free library — the v2 books / v4 assets
//     presence-is-the-contract precedent)
//   - the manifest gains a readingSessions block hashing JSON.stringify of
//     the parsed bundle.readingSessions on BOTH sides; v1-v4 claimed
//     manifests predate the key and are read as the empty-array hash
//   - union read: v1..v4 fixtures parse exactly as before; v6+
//     forward-refuses at the validateBundle peek (D9-04 preserved,
//     threshold > 5)
//   - merge semantics: sessions merge by their per-visit uuid PRIMARY KEY —
//     a new id always writes, an id already present locally keeps the LOCAL
//     row (no duplication, no clobbering). No new ConflictKind and no new
//     reader choice (the Phase 20 assets ride-along precedent): a visit row
//     is recorded history, not a reader-authored decision.
//   - round-trip: export → wipe → import restores articles AND their history
//
// Harness mirrors tests/unit/portability/bundle-v4.spec.ts (fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports).
import { beforeEach, describe, expect, it } from "vitest";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { ArticleSchema } from "../../../src/content/schema";
import type {
  CanonicalArticle,
  ReadingSessionRecord,
} from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import type { Overrides } from "../../../src/portability/conflicts";
import { computeManifest } from "../../../src/portability/manifest";
import { sampleBundle } from "./bundle-schema.test";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time — the documented Dexie + Node test pattern.
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

// Lazy imports — the modules under test must see a populated
// Dexie.dependencies at module-body time.
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}
/** The sessions seam, lazy (the db.ts load must see the fake-indexeddb
 * install first — the loadDb/loadService lazy-import discipline). */
async function loadSessionsStore() {
  return await import("../../../src/persistence/readingSessionsStore");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

function sampleArticle(id = "art-session-rt01"): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/session-article",
      title: "Session Round Trip Article",
      author: "Sam Session",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "3".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body text here.", marks: [] }] },
    ],
    footnotes: [],
  });
}

/** A valid ReadingSessionRecord for `articleId` (typed by construction —
 * the recorder is the only producer; tests build the same shape). */
function sampleSession(
  id: string,
  articleId: string,
  overrides: Partial<ReadingSessionRecord> = {},
): ReadingSessionRecord {
  return {
    schemaVersion: 1,
    id,
    articleId,
    startedAt: "2026-09-15T10:00:00.000Z",
    endedAt: "2026-09-15T10:05:00.000Z",
    startOffset: 0,
    endOffset: 4_200,
    activeSeconds: 240,
    ...overrides,
  };
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

function bundleJsonOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** Build a REAL v5 bundle zip: schema-parsed envelope (schemaVersion 5 +
 * the readingSessions array) + honestly-computed manifest (incl. the
 * readingSessions block). `omitSessionBlock` drops the key entirely (the
 * v4-era envelope shape). */
async function v5BundleFile(
  articles: CanonicalArticle[],
  sessions: ReadingSessionRecord[],
  opts: { omitSessionBlock?: boolean; schemaVersion?: 4 | 5 } = {},
): Promise<File> {
  const envelope: Record<string, unknown> = {
    schemaVersion: opts.schemaVersion ?? 5,
    exportedAt: "2026-09-15T12:00:00.000Z",
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
  if (!opts.omitSessionBlock) envelope.readingSessions = sessions;
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

// ── Writer emits v5 with the sessions array ──────────────────────────────────

describe("buildBundle — v5 session emission (issue #37)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("emits schemaVersion 5 with the library's reading sessions riding the readingSessions array", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());
    const visits: ReadingSessionRecord[] = [
      sampleSession("visit-a", "art-session-rt01"),
      sampleSession("visit-b", "art-session-rt01", {
        startedAt: "2026-09-15T18:00:00.000Z",
        endedAt: "2026-09-15T18:03:00.000Z",
        activeSeconds: 120,
        endOffset: 2_000,
      }),
    ];
    const { putReadingSession } = await loadSessionsStore();
    for (const v of visits) await putReadingSession(v);

    const entries = unzipSync((await buildBundle()).bytes);
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      readingSessions?: ReadingSessionRecord[];
    };

    expect(bundleJson.schemaVersion).toBe(5);
    expect(bundleJson.readingSessions).toEqual(visits);
  });

  it("a session-free library still emits the ALWAYS-PRESENT empty readingSessions array", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());

    const entries = unzipSync((await buildBundle()).bytes);
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      readingSessions?: unknown[];
    };
    // The field's presence is the v5 write contract (the books/assets
    // precedent — presence-is-the-contract).
    expect(bundleJson.schemaVersion).toBe(5);
    expect(bundleJson.readingSessions).toEqual([]);
  });

  it("validates back through validateBundle with schemaVersion 5 (round trip)", async () => {
    const { buildBundle, validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());
    const { putReadingSession } = await loadSessionsStore();
    await putReadingSession(sampleSession("visit-a", "art-session-rt01"));

    const bytes = (await buildBundle()).bytes;
    const result = await validateBundle(new File([new Uint8Array(bytes)], "x.zip"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.schemaVersion).toBe(5);
      expect(result.bundle.readingSessions).toHaveLength(1);
      expect(result.bundle.readingSessions?.[0]?.id).toBe("visit-a");
    }
  });
});

// ── Manifest readingSessions block on BOTH compute sides ─────────────────────

describe("manifest readingSessions block (issue #37)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("manifest.json blocks.readingSessions equals the recomputed hash over the parsed v5 bundle", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());
    const { putReadingSession } = await loadSessionsStore();
    await putReadingSession(sampleSession("visit-a", "art-session-rt01"));

    const entries = unzipSync((await buildBundle()).bytes);
    const parsed = ExportBundleSchema.parse(
      JSON.parse(strFromU8(entries["bundle.json"]!)),
    );
    const claimed = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      blocks: Record<string, string>;
    };
    const recomputed = await computeManifest(parsed);
    expect(claimed.blocks.readingSessions).toBe(recomputed.blocks.readingSessions);
    // The other blocks keep their hashes (strengthen-only).
    expect(claimed.blocks.articles).toBe(recomputed.blocks.articles);
    expect(claimed.blocks.preferences).toBe(recomputed.blocks.preferences);
  });

  it("a v4 bundle with its v4-era manifest (no readingSessions key) still validates — the absent claimed key reads as the empty-array hash", async () => {
    const { validateBundle } = await loadService();
    const file = await v5BundleFile([sampleArticle()], [], {
      omitSessionBlock: true,
      schemaVersion: 4,
    });
    // Strip the readingSessions key from the CLAIMED manifest — the exact
    // shape a Phase-20 exporter produced.
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const claimed = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      algorithm: "sha256";
      blocks: Record<string, string>;
    };
    const { readingSessions: _dropped, ...oldBlocks } = claimed.blocks;
    const legacyFile = zipFileOf({
      "bundle.json": entries["bundle.json"]!,
      "manifest.json": bundleJsonOf({ algorithm: claimed.algorithm, blocks: oldBlocks }),
    });
    const result = await validateBundle(legacyFile);
    expect(result.ok).toBe(true);
  });
});

// ── Union read + forward refusal ─────────────────────────────────────────────

describe("union read + forward refusal (issue #37)", () => {
  it("parses a v5 bundle with a readingSessions array and retains it; tolerates a sessions-less v5 envelope on read", () => {
    const session = sampleSession("visit-a", "example-article");
    const v5 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 5,
      readingSessions: [session],
    });
    expect(v5.success).toBe(true);
    if (v5.success) {
      expect(v5.data.schemaVersion).toBe(5);
      expect(v5.data.readingSessions).toEqual([session]);
    }
    // Optional field, version-independent (the books/assets tolerance).
    const bare = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 5,
    });
    expect(bare.success).toBe(true);
  });

  it("rejects schemaVersion 6 at the schema (forward-compat gate); v5 parses since issue #37", () => {
    const v5 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 5,
    });
    expect(v5.success).toBe(true);
    const v6 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 6,
    });
    expect(v6.success).toBe(false);
  });

  it("peeks a v6 bundle BEFORE the full parse and refuses newer-schema-version calmly", async () => {
    const { validateBundle } = await loadService();
    // schemaVersion 6 AND other damage — the calm newer-version refusal wins.
    const damaged: Record<string, unknown> = {
      ...sampleBundle(),
      schemaVersion: 6,
      articles: "not-an-array",
    };
    const result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(damaged),
        "manifest.json": bundleJsonOf({ algorithm: "sha256", blocks: {} }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "newer-schema-version",
        bundleVersion: 6,
      });
    }
  });
});

// ── Merge semantics + round trip ─────────────────────────────────────────────

describe("session merge + round trip (issue #37)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("merges NEW session ids into existing history; a same-id session keeps the LOCAL row (no duplication, no clobbering)", async () => {
    const { validateBundle } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { applyImport } = await loadService();
    const { db } = await loadDb();

    // LOCAL: the article + a visit whose totals refined AFTER the bundle
    // was exported (the flush discipline — the local row is the fresher).
    await db.articles.put(sampleArticle());
    const localVisit = sampleSession("visit-shared", "art-session-rt01", {
      activeSeconds: 999,
      endOffset: 9_999,
      endedAt: "2026-09-15T11:00:00.000Z",
    });
    const { putReadingSession } = await loadSessionsStore();
    await putReadingSession(localVisit);

    // BUNDLE: the identical article + the STALE snapshot of visit-shared
    // (no clobbering target) + a genuinely new visit (the merge target).
    const bundleVisits = [
      sampleSession("visit-shared", "art-session-rt01"),
      sampleSession("visit-new", "art-session-rt01", {
        startedAt: "2026-09-15T18:00:00.000Z",
        endedAt: "2026-09-15T18:03:00.000Z",
        activeSeconds: 120,
        endOffset: 2_000,
      }),
    ];
    const result = await validateBundle(
      await v5BundleFile([sampleArticle()], bundleVisits),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    // Only the new id rides the plan; the shared id keeps local silently.
    expect(plan.sessionsToWrite.map((s) => s.id)).toEqual(["visit-new"]);
    await applyImport(plan);

    const rows = await loadAllRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "visit-shared")).toEqual(localVisit);
    expect(rows.find((r) => r.id === "visit-new")).toEqual(bundleVisits[1]);
  });

  it("sessions ride even when their article is a skipped conflict — merge keys on the visit uuid, not the article resolution", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();

    // LOCAL: the article at revision 1.
    await db.articles.put(sampleArticle());

    // BUNDLE: revision 2 (a revision conflict) + a session for that id.
    const refreshed = ArticleSchema.parse({
      ...sampleArticle(),
      revision: 2,
      provenance: {
        ...sampleArticle().provenance,
        originalHtmlHash: "sha256:" + "4".repeat(64),
      },
    });
    const visit = sampleSession("visit-skipped-article", "art-session-rt01");
    const result = await validateBundle(await v5BundleFile([refreshed], [visit]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    expect(plan.articlesToWrite).toHaveLength(0); // article skipped
    expect(plan.sessionsToWrite).toEqual([visit]); // history still merges
    await applyImport(plan);
    expect((await db.articles.get("art-session-rt01"))?.revision).toBe(1);
    expect(await db.readingSessions.get("visit-skipped-article")).toEqual(visit);
  });

  it("round-trip: export → wipe → import restores articles AND their history (the acceptance criterion)", async () => {
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();

    // Machine A: one article, two visits, a highlight, a location.
    const article = sampleArticle();
    await db.articles.put(article);
    const visits = [
      sampleSession("visit-rt-1", article.id),
      sampleSession("visit-rt-2", article.id, {
        startedAt: "2026-09-15T18:00:00.000Z",
        endedAt: "2026-09-15T18:03:00.000Z",
        activeSeconds: 120,
        endOffset: 2_000,
      }),
    ];
    const { putReadingSession } = await loadSessionsStore();
    for (const v of visits) await putReadingSession(v);

    const bytes = (await buildBundle()).bytes;

    // The wipe.
    await wipeDatabase();

    // Machine B (or the same device post-wipe): import restores everything.
    const result = await validateBundle(new File([new Uint8Array(bytes)], "rt.zip"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    await applyImport(plan);

    expect(await db.articles.get(article.id)).toEqual(article);
    expect(await loadAllRows()).toEqual(visits);
  });

  it("a v4 bundle (no readingSessions key) applies with ZERO session writes — the union-read regression", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();

    const result = await validateBundle(
      await v5BundleFile([sampleArticle()], [], {
        omitSessionBlock: true,
        schemaVersion: 4,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.readingSessions).toBeUndefined();

    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);
    expect(plan.sessionsToWrite).toEqual([]);
    await applyImport(plan);
    expect(await db.readingSessions.count()).toBe(0);
  });

  it("an injected mid-transaction failure rolls back sessions AND articles — db.readingSessions joins the atomic transaction", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();

    // LOCAL: the article + its visit.
    await db.articles.put(sampleArticle());
    const localVisit = sampleSession("visit-local", "art-session-rt01");
    const { putReadingSession } = await loadSessionsStore();
    await putReadingSession(localVisit);

    // BUNDLE: a second article + a session on it.
    const other = sampleArticle("art-session-rt02");
    const incomingVisit = sampleSession("visit-incoming", "art-session-rt02");
    const result = await validateBundle(await v5BundleFile([other], [incomingVisit]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = await detectImportPreview(result.bundle, result.assets);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP, false);

    // Inject a creating-hook failure on the incoming session put — the
    // throw must unwind the WHOLE transaction (the T-20-22 pattern).
    const hook = (_key: unknown, obj: { id?: string }): void => {
      if (obj?.id === "visit-incoming") {
        throw new Error("injected session-put failure");
      }
    };
    db.readingSessions.hook("creating", hook);
    try {
      await expect(applyImport(plan)).rejects.toThrow("injected session-put failure");
    } finally {
      db.readingSessions.hook("creating").unsubscribe(hook);
    }

    // FULL rollback: no partial article, and the local visit is untouched.
    expect(await db.articles.get("art-session-rt02")).toBeUndefined();
    expect(await db.readingSessions.get("visit-local")).toEqual(localVisit);
    expect(await db.readingSessions.count()).toBe(1);
  });
});

/** Whole-table read through the store seam (STATE-04 — Zod-validated). */
async function loadAllRows(): Promise<ReadingSessionRecord[]> {
  const { loadAllReadingSessions } = await import(
    "../../../src/persistence/readingSessionsStore"
  );
  return await loadAllReadingSessions();
}
