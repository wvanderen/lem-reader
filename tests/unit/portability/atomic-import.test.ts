// tests/unit/portability/atomic-import.test.ts
// Plan 09-04 Task 3 (TDD RED → GREEN) — the PORT-02 atomic apply truth:
//   - applying a ResolvedImportPlan (09-03) writes new + keep-both-rewritten
//     records across all touched stores; the minted highlight id exists and
//     the rewritten note's highlightId FK matches it (Pitfall 7 survives the
//     WRITE, not just the plan)
//   - preferences write ONLY when plan.applyPreferences is true
//     (db.settings gains the reader-prefs row; applyPreferences false leaves
//     the settings store untouched)
//   - injected mid-transaction failure (a Dexie creating hook on db.notes
//     throwing on a sentinel id) → applyImport rejects AND the counts in ALL
//     stores equal their pre-apply values — full rollback, proven, not
//     asserted-by-convention (Pitfall 11 #3 / T-9-11)
//
// The happy path drives the REAL 09-03 chain: detectImportPreview →
// resolveImportPlan (keep-both on highlight-id, applyPreferences true) →
// applyImport — the exact call shape the 09-05 dialog will use.
//
// Harness mirrors tests/unit/portability/conflicts.test.ts: fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports. Dexie creating hooks FIRE INSIDE the transaction and a
// throw rolls it back — the hook is deregistered in afterEach (hooks
// persist across tests; cross-test bleed would poison sibling specs).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
  ReaderSettingsSchema,
} from "../../../src/content/schema";
import type {
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReaderSettings,
} from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import type { ExportBundle } from "../../../src/portability/bundle";
import type { Overrides } from "../../../src/portability/conflicts";
import type { z } from "zod";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-tags.test.ts).
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

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

function samplePrefs(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
  return ReaderSettingsSchema.parse({
    schemaVersion: 2,
    font: "serif",
    size: 18,
    measure: 58,
    spacing: "comfortable",
    theme: "sepia",
    readingMode: "paginated",
    ...overrides,
  });
}

type ArticleInput = z.input<typeof ArticleSchema>;

function sampleArticle(overrides: Partial<ArticleInput> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "art-sample",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Alpha beta gamma delta epsilon zeta eta.", marks: [] }],
      },
    ],
    footnotes: [],
    ...overrides,
  });
}

type HighlightInput = z.input<typeof HighlightRecordSchema>;

function sampleHighlight(overrides: Partial<HighlightInput> = {}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "hl-sample",
    articleId: "art-sample",
    revision: 1,
    position: { start: 22, end: 39 },
    quote: { prefix: "", exact: "epsilon zeta eta", suffix: "" },
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

type NoteInput = z.input<typeof NoteRecordSchema>;

function sampleNote(overrides: Partial<NoteInput> = {}): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: "note-sample",
    highlightId: "hl-sample",
    text: "a reader note",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

type LocationInput = z.input<typeof LocationRecordSchema>;

function sampleLocation(overrides: Partial<LocationInput> = {}): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: "art-sample",
    revision: 1,
    graphemeOffset: 3,
    savedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

type BundleInput = z.input<typeof ExportBundleSchema>;

function sampleBundle(overrides: Partial<BundleInput> = {}): ExportBundle {
  return ExportBundleSchema.parse({
    schemaVersion: 1,
    exportedAt: "2026-08-15T00:00:00.000Z",
    appVersion: "test",
    articles: [],
    locations: [],
    highlights: [],
    notes: [],
    preferences: samplePrefs(),
    fixtureIds: [],
    ...overrides,
  });
}

/** Seed the local D9-14 conflict surface: art-local@1 + hl-local +
 * note-local + location art-local@1. */
async function seedLocalConflictSurface(): Promise<void> {
  const { db } = await loadDb();
  await db.articles.put(sampleArticle({ id: "art-local", revision: 1 }));
  await db.highlights.put(
    sampleHighlight({ id: "hl-local", articleId: "art-local" }),
  );
  await db.notes.put(
    sampleNote({ id: "note-local", highlightId: "hl-local" }),
  );
  await db.location.put(
    sampleLocation({ articleId: "art-local", revision: 1 }),
  );
}

/** Count rows in every store — the rollback proof's before/after map. */
async function countAllStores(): Promise<Record<string, number>> {
  const { db } = await loadDb();
  return {
    articles: await db.articles.count(),
    highlights: await db.highlights.count(),
    notes: await db.notes.count(),
    location: await db.location.count(),
    settings: await db.settings.count(),
  };
}

/** The D9-14 default: skip every kind. */
const ALL_SKIP: Overrides = {
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
};

// Dexie creating hooks persist across tests — the SAME function reference is
// registered via hook("creating", fn) and deregistered via
// hook("creating").unsubscribe(fn) in afterEach (cross-test bleed guard).
let injectedCreatingHook:
  | ((primKey: unknown, obj: { id?: string }) => void)
  | null = null;

// ── Happy path: new + keep-both-rewritten records all land ───────────────────

describe("applyImport — happy path (09-04 Task 3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("writes new + keep-both-rewritten records across all stores; the FK rewrite survives the write; preferences write under applyPreferences", async () => {
    const { applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await seedLocalConflictSurface();

    const prefs = samplePrefs({ theme: "dark" });
    const bundle = sampleBundle({
      articles: [
        sampleArticle({ id: "art-local", revision: 2 }), // revision conflict
        sampleArticle({ id: "art-new" }), // new
      ],
      highlights: [
        sampleHighlight({ id: "hl-local", articleId: "art-local" }), // id conflict → keep-both
        sampleHighlight({ id: "hl-new", articleId: "art-new" }), // new
      ],
      notes: [
        // NEW note id whose highlightId follows the rewritten highlight.
        sampleNote({ id: "note-follows", highlightId: "hl-local" }),
        sampleNote({ id: "note-new", highlightId: "hl-new" }),
      ],
      locations: [
        sampleLocation({ articleId: "art-new", revision: 1 }), // new
        // location conflict, strictly newer savedAt → LWW under overwrite.
        sampleLocation({
          articleId: "art-local",
          revision: 1,
          graphemeOffset: 9,
          savedAt: "2026-08-15T12:00:00.000Z",
        }),
      ],
      preferences: prefs,
    });

    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(
      bundle,
      preview,
      {
        ...ALL_SKIP,
        "article-revision": "overwrite",
        "highlight-id": "keep-both",
        location: "overwrite",
      },
      true, // applyPreferences
    );
    await applyImport(plan);

    // Articles: art-local replaced at the higher revision; art-new added.
    expect((await db.articles.get("art-local"))?.revision).toBe(2);
    expect(await db.articles.get("art-new")).toBeDefined();

    // Highlights: the minted keep-both id exists, the local row survived,
    // and the new highlight landed.
    const minted = plan.idRewrites.get("hl-local");
    expect(minted).toBeDefined();
    expect(minted).not.toBe("hl-local");
    expect(await db.highlights.get(minted!)).toBeDefined();
    expect(await db.highlights.get("hl-local")).toBeDefined();
    expect(await db.highlights.get("hl-new")).toBeDefined();

    // Notes: the FK rewrite SURVIVED the write — note-follows points at the
    // minted highlight id, not the stale bundle id (Pitfall 7).
    expect((await db.notes.get("note-follows"))?.highlightId).toBe(minted);
    expect(await db.notes.get("note-new")).toBeDefined();

    // Locations: compound-key rows landed; art-local's is the newer one.
    expect(await db.location.get(["art-new", 1])).toBeDefined();
    expect((await db.location.get(["art-local", 1]))?.savedAt).toBe(
      "2026-08-15T12:00:00.000Z",
    );

    // Preferences: db.settings gained the reader-prefs row with the bundle
    // preferences (applyPreferences true).
    const prefsRow = await db.settings.get("reader-prefs");
    expect(prefsRow).toBeDefined();
    expect(prefsRow?.value).toEqual(prefs);
  });

  it("leaves the settings store untouched when plan.applyPreferences is false", async () => {
    const { applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await seedLocalConflictSurface();

    const bundle = sampleBundle({
      articles: [sampleArticle({ id: "art-new" })],
      highlights: [sampleHighlight({ id: "hl-new", articleId: "art-new" })],
      notes: [sampleNote({ id: "note-new", highlightId: "hl-new" })],
      locations: [sampleLocation({ articleId: "art-new", revision: 1 })],
      preferences: samplePrefs({ theme: "dark" }),
    });

    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(bundle, preview, ALL_SKIP, false);
    await applyImport(plan);

    // The transaction's settings table participates ONLY under
    // applyPreferences — the observable contract: no reader-prefs row.
    expect(await db.settings.count()).toBe(0);
    // And the record stores DID write.
    expect(await db.articles.get("art-new")).toBeDefined();
    expect(await db.highlights.get("hl-new")).toBeDefined();
  });
});

// ── Rollback proof: injected mid-transaction failure ─────────────────────────

describe("applyImport — atomicity / rollback (09-04 Task 3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(async () => {
    // Hooks persist — always deregister via the same fn reference
    // (cross-test bleed guard).
    if (injectedCreatingHook !== null) {
      const { db } = await loadDb();
      db.notes.hook("creating").unsubscribe(injectedCreatingHook);
      injectedCreatingHook = null;
    }
  });

  it("an injected mid-transaction failure rolls back EVERY store to its pre-apply counts", async () => {
    const { applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await seedLocalConflictSurface();

    const SENTINEL_NOTE_ID = "note-boom";
    const bundle = sampleBundle({
      articles: [
        sampleArticle({ id: "art-local", revision: 2 }), // would overwrite
        sampleArticle({ id: "art-new" }), // new
      ],
      highlights: [
        sampleHighlight({ id: "hl-local", articleId: "art-local" }), // keep-both mint
        sampleHighlight({ id: "hl-new", articleId: "art-new" }),
      ],
      notes: [
        sampleNote({ id: "note-follows", highlightId: "hl-local" }),
        sampleNote({ id: SENTINEL_NOTE_ID, highlightId: "hl-new" }), // throws here
      ],
      locations: [
        sampleLocation({ articleId: "art-new", revision: 1 }),
        sampleLocation({
          articleId: "art-local",
          revision: 1,
          graphemeOffset: 9,
          savedAt: "2026-08-15T12:00:00.000Z",
        }),
      ],
      preferences: samplePrefs({ theme: "dark" }),
    });

    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(
      bundle,
      preview,
      {
        ...ALL_SKIP,
        "article-revision": "overwrite",
        "highlight-id": "keep-both",
        location: "overwrite",
      },
      true, // settings joins the transaction — its rollback is proven too
    );

    const before = await countAllStores();
    expect(before).toEqual({
      articles: 1,
      highlights: 1,
      notes: 1,
      location: 1,
      settings: 0,
    });

    // Dexie creating hooks fire INSIDE the transaction; a throw rejects the
    // create, propagates out of the closure, and rolls the WHOLE
    // transaction back — every put that already happened is undone.
    const creatingHook = (
      _primKey: unknown,
      obj: { id?: string },
    ): void => {
      if (obj?.id === SENTINEL_NOTE_ID) {
        throw new Error("injected mid-transaction failure");
      }
    };
    injectedCreatingHook = creatingHook;
    db.notes.hook("creating", creatingHook);

    await expect(applyImport(plan)).rejects.toThrow(
      "injected mid-transaction failure",
    );

    // FULL rollback: every store equals its pre-apply counts.
    const after = await countAllStores();
    expect(after).toEqual(before);

    // And specifically: nothing from the plan leaked — the sentinel note and
    // the would-be-written article revision are both absent.
    expect(await db.notes.get(SENTINEL_NOTE_ID)).toBeUndefined();
    expect((await db.articles.get("art-local"))?.revision).toBe(1);
    expect(await db.articles.get("art-new")).toBeUndefined();
  });
});
