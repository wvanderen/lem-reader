// tests/unit/portability/conflicts.test.ts
// Plan 09-03 (TDD RED → GREEN) — the PORT-02 dry-run core:
//   Task 1: detectImportPreview — all five D9-14 conflict kinds + eager
//           tri-state re-resolution (D9-13) with the Pattern 8 three-source
//           article lookup + per-article cluster memoization + ZERO writes.
//   Task 2: resolveImportPlan — bulk per-kind override matrix producing the
//           fully-computed ResolvedImportPlan (keep-both mint + FK rewrite).
//
// Behavior contract under test (09-03-PLAN.md <behavior> blocks):
//   - article-revision: local article same id, different revision
//   - article-content-divergence: same id AND revision, different
//     provenance.originalHtmlHash
//   - highlight-id / note-id: incoming id exists locally
//   - location: incoming [articleId, revision] exists locally
//   - incoming records with NO local PK match count as new (added counts)
//   - every incoming highlight re-resolves eagerly across
//     bundle.articles ∪ local-Dexie ∪ bundled-fixture articles (Pitfall 4:
//     a highlight keyed to a bundled fixture article is NOT orphan while the
//     fixture is present)
//   - applyPreferencesDefault: true when no local reader-prefs row, else false
//   - dry-run performs ZERO writes (store row counts unchanged)
//
// Harness mirrors tests/unit/portability/bulk-reads.test.ts (which mirrors
// tests/unit/ingestion-tags.test.ts): fake-indexeddb via Dexie.dependencies at
// module top-level, wipeDatabase beforeEach, lazy module imports so the
// module under test sees a populated Dexie.dependencies.
import { beforeEach, describe, expect, it } from "vitest";
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
import {
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import { fixtures } from "../../../src/fixtures";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import type { ExportBundle } from "../../../src/portability/bundle";
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
      {
        kind: "paragraph",
        content: [
          { text: "Theta iota kappa lambda mu nu xi omicron pi.", marks: [] },
        ],
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
    // "epsilon zeta eta" appears exactly once in sampleArticle's normalized
    // text — the confident-resolution passage.
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

/** Seed a full local conflict surface: one article at revision 1, one
 * highlight, one note, one location — the D9-14 table's local side. */
async function seedLocalConflictSurface(): Promise<void> {
  const { db } = await loadDb();
  await db.articles.put(
    sampleArticle({ id: "art-local", revision: 1 }),
  );
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

/** A real passage of a bundled fixture — reuse the fixture's own normalized
 * text so the resolver's exact match is guaranteed non-vacuous. */
function fixturePassage(article: CanonicalArticle): string {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  return clusters.slice(10, 40).join("");
}

// ── Task 1: detectImportPreview — 5-kind dry-run (D9-14) ────────────────────

describe("detectImportPreview — conflict kinds (09-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("detects article-revision when a local article shares the id at a different revision", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [sampleArticle({ id: "art-local", revision: 2 })],
      }),
    );

    expect(preview.incoming.articles).toBe(1);
    expect(preview.added.articles).toBe(0);
    const conflict = preview.conflicts.find(
      (c) => c.kind === "article-revision",
    );
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(1);
    expect(conflict?.sampleIds).toContain("art-local");
    // Same id, different revision is a revision conflict — NOT divergence.
    expect(
      preview.conflicts.find((c) => c.kind === "article-content-divergence"),
    ).toBeUndefined();
  });

  it("detects article-content-divergence at the same id+revision with a different originalHtmlHash", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [
          sampleArticle({
            id: "art-local",
            revision: 1,
            provenance: {
              sourceUrl: "https://example.com/article",
              title: "Sample Article",
              author: "An Author",
              retrievedAt: "2026-08-11T00:00:00.000Z",
              originalHtmlHash: "sha256:" + "b".repeat(64),
            },
          }),
        ],
      }),
    );

    expect(preview.added.articles).toBe(0);
    const conflict = preview.conflicts.find(
      (c) => c.kind === "article-content-divergence",
    );
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(1);
    // Same id+revision is divergence — NOT a revision conflict.
    expect(
      preview.conflicts.find((c) => c.kind === "article-revision"),
    ).toBeUndefined();
  });

  it("treats an identical duplicate (same id+revision+hash) as neither conflict nor added", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [sampleArticle({ id: "art-local", revision: 1 })],
      }),
    );

    expect(preview.incoming.articles).toBe(1);
    expect(preview.added.articles).toBe(0);
    expect(preview.conflicts).toEqual([]);
  });

  it("detects highlight-id when an incoming highlight id exists locally", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        highlights: [
          sampleHighlight({ id: "hl-local", articleId: "art-local" }),
        ],
      }),
    );

    expect(preview.added.highlights).toBe(0);
    const conflict = preview.conflicts.find((c) => c.kind === "highlight-id");
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(1);
    expect(conflict?.sampleIds).toContain("hl-local");
  });

  it("detects note-id when an incoming note id exists locally", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        notes: [sampleNote({ id: "note-local", highlightId: "hl-local" })],
      }),
    );

    expect(preview.added.notes).toBe(0);
    const conflict = preview.conflicts.find((c) => c.kind === "note-id");
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(1);
    expect(conflict?.sampleIds).toContain("note-local");
  });

  it("detects location when an incoming [articleId, revision] key exists locally", async () => {
    const { detectImportPreview } = await loadConflicts();
    await seedLocalConflictSurface();

    const preview = await detectImportPreview(
      sampleBundle({
        locations: [
          sampleLocation({ articleId: "art-local", revision: 1 }),
        ],
      }),
    );

    expect(preview.added.locations).toBe(0);
    const conflict = preview.conflicts.find((c) => c.kind === "location");
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(1);
  });

  it("counts added per type when no local PK matches; incoming counts mirror the bundle", async () => {
    const { detectImportPreview } = await loadConflicts();

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [sampleArticle({ id: "art-new" })],
        highlights: [sampleHighlight({ id: "hl-new", articleId: "art-new" })],
        notes: [sampleNote({ id: "note-new", highlightId: "hl-new" })],
        locations: [sampleLocation({ articleId: "art-new", revision: 1 })],
      }),
    );

    expect(preview.incoming).toEqual({
      articles: 1,
      highlights: 1,
      notes: 1,
      locations: 1,
    });
    expect(preview.added).toEqual({
      articles: 1,
      highlights: 1,
      notes: 1,
      locations: 1,
    });
    expect(preview.conflicts).toEqual([]);
  });

  it("caps ConflictSummary.sampleIds at 5 for calm preview copy", async () => {
    const { detectImportPreview } = await loadConflicts();
    const { db } = await loadDb();

    // Six local highlights whose ids collide with the six incoming ones.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await db.highlights.put(
        sampleHighlight({ id: `hl-dup-${n}`, articleId: "art-sample" }),
      );
    }
    const dupHighlights = [1, 2, 3, 4, 5, 6].map((n) =>
      sampleHighlight({ id: `hl-dup-${n}`, articleId: "art-sample" }),
    );

    const preview = await detectImportPreview(
      sampleBundle({ highlights: dupHighlights }),
    );

    const conflict = preview.conflicts.find((c) => c.kind === "highlight-id");
    expect(conflict).toBeDefined();
    expect(conflict?.count).toBe(6);
    expect(conflict?.sampleIds).toHaveLength(5);
  });
});

// ── Task 1: detectImportPreview — eager tri-state re-resolution (D9-13) ─────

describe("detectImportPreview — tri-state re-resolution (09-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("reports confident for a highlight keyed to an article present in the bundle", async () => {
    const { detectImportPreview } = await loadConflicts();

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [sampleArticle({ id: "art-confident" })],
        highlights: [
          sampleHighlight({ id: "hl-a", articleId: "art-confident" }),
        ],
      }),
    );

    expect(preview.resolution).toEqual({
      confident: 1,
      ambiguous: 0,
      orphan: 0,
    });
    expect(preview.fixtureBackedHighlights).toBe(0);
  });

  it("reports ambiguous for a duplicated passage with no disambiguating context", async () => {
    const { detectImportPreview } = await loadConflicts();

    const duplicated = sampleArticle({
      id: "art-ambiguous",
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "Repeated passage here.", marks: [] }],
        },
        {
          kind: "paragraph",
          content: [{ text: "Repeated passage here.", marks: [] }],
        },
      ],
    });

    const preview = await detectImportPreview(
      sampleBundle({
        articles: [duplicated],
        highlights: [
          sampleHighlight({
            id: "hl-amb",
            articleId: "art-ambiguous",
            position: { start: 0, end: 22 },
            quote: { prefix: "", exact: "Repeated passage here.", suffix: "" },
          }),
        ],
      }),
    );

    expect(preview.resolution).toEqual({
      confident: 0,
      ambiguous: 1,
      orphan: 0,
    });
  });

  it("reports orphan when the highlight's article is present nowhere (bundle ∪ local ∪ fixtures)", async () => {
    const { detectImportPreview } = await loadConflicts();

    const preview = await detectImportPreview(
      sampleBundle({
        highlights: [
          sampleHighlight({ id: "hl-ghost", articleId: "ghost-article" }),
        ],
      }),
    );

    expect(preview.resolution).toEqual({
      confident: 0,
      ambiguous: 0,
      orphan: 1,
    });
    expect(preview.fixtureBackedHighlights).toBe(0);
  });

  it("resolves a highlight keyed to a bundled fixture article against the fixture (Pitfall 4: NOT orphan)", async () => {
    const { detectImportPreview } = await loadConflicts();
    const fixture = fixtures[0]!;

    const preview = await detectImportPreview(
      sampleBundle({
        fixtureIds: [fixture.id],
        highlights: [
          sampleHighlight({
            id: "hl-fx",
            articleId: fixture.id,
            revision: 1,
            position: { start: 0, end: 30 },
            quote: { prefix: "", exact: fixturePassage(fixture), suffix: "" },
          }),
        ],
      }),
    );

    // The fixture is present in this build → the highlight re-resolves
    // against the fixture copy — non-orphan (confident or ambiguous).
    expect(preview.resolution.orphan).toBe(0);
    expect(preview.resolution.confident + preview.resolution.ambiguous).toBe(1);
    expect(preview.fixtureBackedHighlights).toBe(1);
  });

  it("reports orphan when a fixture-style article id is absent from this build's fixtures (app-version skew)", async () => {
    const { detectImportPreview } = await loadConflicts();

    const preview = await detectImportPreview(
      sampleBundle({
        fixtureIds: ["removed-fixture-id"],
        highlights: [
          sampleHighlight({
            id: "hl-fx-gone",
            articleId: "removed-fixture-id",
            position: { start: 0, end: 10 },
            quote: { prefix: "", exact: "some old fixture text", suffix: "" },
          }),
        ],
      }),
    );

    expect(preview.resolution).toEqual({
      confident: 0,
      ambiguous: 0,
      orphan: 1,
    });
    expect(preview.fixtureBackedHighlights).toBe(0);
  });

  it("lets a bundled article shadow a same-id fixture (T-9-10): resolution uses the bundle article, never fixture text", async () => {
    const { detectImportPreview } = await loadConflicts();
    const fixture = fixtures[0]!;

    // The bundle carries a REAL article whose id collides with a fixture id
    // but whose text is unrelated. Pattern 8 precedence: bundle.articles win.
    const shadow = sampleArticle({
      id: fixture.id,
      blocks: [
        {
          kind: "paragraph",
          content: [
            {
              text: "Shadow article body completely unrelated to the fixture corpus.",
              marks: [],
            },
          ],
        },
      ],
    });

    // The highlight's quote is a REAL passage of the fixture's text — it must
    // NOT resolve (no fixture-text substitution for a real article id).
    const preview = await detectImportPreview(
      sampleBundle({
        articles: [shadow],
        fixtureIds: [fixture.id],
        highlights: [
          sampleHighlight({
            id: "hl-shadow",
            articleId: fixture.id,
            revision: 1,
            position: { start: 0, end: 30 },
            quote: { prefix: "", exact: fixturePassage(fixture), suffix: "" },
          }),
        ],
      }),
    );

    expect(preview.resolution.orphan).toBe(1);
    expect(preview.fixtureBackedHighlights).toBe(0);
  });

  it("resolves against the LOCAL tier when the article was skipped from the bundle but exists in Dexie", async () => {
    const { detectImportPreview } = await loadConflicts();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle({ id: "art-local-tier" }));

    const preview = await detectImportPreview(
      sampleBundle({
        highlights: [
          sampleHighlight({ id: "hl-local-tier", articleId: "art-local-tier" }),
        ],
      }),
    );

    expect(preview.resolution.orphan).toBe(0);
    expect(preview.resolution.confident + preview.resolution.ambiguous).toBe(1);
    expect(preview.fixtureBackedHighlights).toBe(0);
  });
});

// ── Task 1: detectImportPreview — preferences default + write-free ──────────

describe("detectImportPreview — preferences + zero writes (09-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("applyPreferencesDefault is true on a fresh device (no reader-prefs row)", async () => {
    const { detectImportPreview } = await loadConflicts();
    const preview = await detectImportPreview(sampleBundle());
    expect(preview.applyPreferencesDefault).toBe(true);
  });

  it("applyPreferencesDefault is false when a local reader-prefs row exists", async () => {
    const { detectImportPreview } = await loadConflicts();
    const { db } = await loadDb();
    await db.settings.put({ key: "reader-prefs", value: samplePrefs() });

    const preview = await detectImportPreview(sampleBundle());
    expect(preview.applyPreferencesDefault).toBe(false);
  });

  it("performs ZERO writes: row counts across all five stores are unchanged", async () => {
    const { detectImportPreview } = await loadConflicts();
    const { db } = await loadDb();
    await seedLocalConflictSurface();

    // A bundle touching every conflict kind + the fixture tier — the fullest
    // read surface — must not write a single row anywhere.
    const fixture = fixtures[0]!;
    const bundle = sampleBundle({
      articles: [sampleArticle({ id: "art-local", revision: 2 })],
      highlights: [
        sampleHighlight({ id: "hl-local", articleId: "art-local" }),
        sampleHighlight({
          id: "hl-fx",
          articleId: fixture.id,
          revision: 1,
          position: { start: 0, end: 30 },
          quote: { prefix: "", exact: fixturePassage(fixture), suffix: "" },
        }),
      ],
      notes: [sampleNote({ id: "note-local", highlightId: "hl-local" })],
      locations: [sampleLocation({ articleId: "art-local", revision: 1 })],
    });

    const before = {
      articles: await db.articles.count(),
      settings: await db.settings.count(),
      location: await db.location.count(),
      highlights: await db.highlights.count(),
      notes: await db.notes.count(),
    };
    expect(before.articles).toBe(1);
    expect(before.highlights).toBe(1);
    expect(before.notes).toBe(1);
    expect(before.location).toBe(1);

    await detectImportPreview(bundle);

    const after = {
      articles: await db.articles.count(),
      settings: await db.settings.count(),
      location: await db.location.count(),
      highlights: await db.highlights.count(),
      notes: await db.notes.count(),
    };
    expect(after).toEqual(before);
  });
});
