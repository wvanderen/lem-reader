// tests/unit/portability/article-notes-roundtrip.spec.ts
// Issue #211 — the bundle-v8 truth: ARTICLE NOTES ride the export bundle.
//
//   - writers emit schemaVersion 8 with an ALWAYS-present articleNotes
//     array (empty on a note-free library — the presence-is-the-contract
//     books/assets/readingSessions/subscriptions precedent)
//   - round-trip: identity, created/updated timestamps, plain text,
//     annotation tags, and the articleId association survive export →
//     wipe → import verbatim; NO highlight, passage selector, or any other
//     synthesized attachment field ever appears
//   - conflicts: the established skip / overwrite / keep-both per-kind
//     semantics under a dedicated "article-note-id" kind — the selected
//     outcome AND the article association always survive
//   - older bundles (v1..v7, no articleNotes key) still import — the
//     union-read regression
//   - malformed records refuse as invalid; a damaged articleNotes block
//     refuses as corrupted; imports can NEVER leave a detached article
//     note (a note whose article is nowhere on the receiving device is
//     skipped with an honest preview count)
//
// Harness mirrors tests/unit/portability/subscriptions-roundtrip.spec.ts
// (fake-indexeddb via Dexie.dependencies at module top-level, wipeDatabase
// beforeEach, lazy module imports). The REAL service seam end to end:
// buildBundle → validateBundle → detectImportPreview → resolveImportPlan →
// applyImport → the Zod-validated store loaders. No mocks.
import { beforeEach, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { ArticleSchema } from "../../../src/content/schema";
import type { ArticleNote, CanonicalArticle } from "../../../src/content/schema";
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
async function loadArticleNotesStore() {
  return await import("../../../src/persistence/articleNotesStore");
}

function sampleArticle(id = "art-note-rt01"): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article-note-roundtrip",
      title: "Article Note Round Trip",
      author: "An Author",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "7".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text here.", marks: [] }] }],
    footnotes: [],
  });
}

/** A schema-valid ArticleNote built through the SHIPPED schema — the same
 * shape editArticleNote persists (tags normalized at the store seam; a raw
 * db write for seeding keeps the fixture byte-exact). */
function sampleNote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "an-roundtrip-1",
    articleId: "art-note-rt01",
    text: "An overarching reflection on the whole article.",
    tags: ["to-revisit", "essays"],
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-21T11:00:00.000Z",
    ...overrides,
  };
}

/** The D9-14 default — skip every kind (nothing conflicts on a fresh device). */
function ALL_SKIP(): Overrides {
  return {
    book: "skip",
    "article-revision": "skip",
    "article-content-divergence": "skip",
    "article-metadata-override": "skip",
    "highlight-id": "skip",
    "note-id": "skip",
    "article-note-id": "skip",
    location: "skip",
  };
}

function bundleJsonOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** Build a REAL bundle zip at the given generation (honestly-computed
 * manifest incl. the articleNotes block when present). */
async function bundleFile(
  articles: CanonicalArticle[],
  articleNotes: Record<string, unknown>[],
  opts: { omitArticleNotesBlock?: boolean; schemaVersion?: 1 | 2 | 3 | 4 | 5 | 6 | 7 } = {},
): Promise<File> {
  const envelope: Record<string, unknown> = {
    schemaVersion: opts.schemaVersion ?? 8,
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
    readingSessions: [],
    subscriptions: [],
    starterRemoved: false,
  };
  if (!opts.omitArticleNotesBlock) envelope.articleNotes = articleNotes;
  const bundle = ExportBundleSchema.parse(envelope);
  const manifest = await computeManifest(bundle);
  const { zipSync } = await import("fflate");
  return new File(
    [
      zipSync({
        "bundle.json": bundleJsonOf(JSON.parse(JSON.stringify(bundle))),
        "manifest.json": bundleJsonOf(manifest),
      }),
    ],
    "x.zip",
  );
}

/** Build a zip from a RAW (unvalidated) envelope — the only way to hand the
 * importer genuinely malformed bytes (the parsed helper above would throw at
 * its own self-check). The manifest is honestly computed over the raw
 * envelope so a shape-level refusal lands as "invalid", not "corrupted". */
async function rawBundleFile(envelope: Record<string, unknown>): Promise<File> {
  const manifest = await computeManifest(envelope as Parameters<typeof computeManifest>[0]);
  const { zipSync } = await import("fflate");
  return new File(
    [
      zipSync({
        "bundle.json": bundleJsonOf(envelope),
        "manifest.json": bundleJsonOf(manifest),
      }),
    ],
    "raw.zip",
  );
}

describe("article notes bundle v8 (issue #211)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("writers emit v8 with the ALWAYS-present articleNotes array; a note-free library emits []", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await dexieLibrarySource.save(sampleArticle());

    let entries = unzipSync((await buildBundle()).bytes);
    let bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      articleNotes?: unknown[];
    };
    expect(bundleJson.schemaVersion).toBe(8);
    expect(bundleJson.articleNotes).toEqual([]);

    // The note-free library still emits the field (presence is the v8
    // write contract — the books/assets/readingSessions/subscriptions
    // precedent).
    await wipeDatabase();
    await db.open();
    entries = unzipSync((await buildBundle()).bytes);
    bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!));
    expect(bundleJson.schemaVersion).toBe(8);
    expect(bundleJson.articleNotes).toEqual([]);
  });

  it("a v7 bundle (no articleNotes key) applies with ZERO article-note writes — the union-read regression", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    const result = await validateBundle(
      await bundleFile([sampleArticle()], [sampleNote()], {
        omitArticleNotesBlock: true,
        schemaVersion: 7,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.articleNotes).toBeUndefined();

    const preview = await detectImportPreview(result.bundle);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([]);
  });

  it("round-trip to a fresh library: identity, timestamps, text, tags, and article association land verbatim; nothing passage-shaped is synthesized", async () => {
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes, loadArticleNotes } = await loadArticleNotesStore();

    // Machine A: the article + one tagged saved note.
    const article = sampleArticle();
    await dexieLibrarySource.save(article);
    const note = sampleNote();
    await db.articleNotes.put(note as ArticleNote);

    const { bytes } = await buildBundle();

    // Machine B: a fresh device.
    await wipeDatabase();
    await db.open();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    // The envelope carried the note whole (the exporter's Zod self-check).
    expect(validation.bundle.articleNotes).toEqual([note]);

    const preview = await detectImportPreview(validation.bundle);
    // The preview counts the note honestly: 1 incoming, 1 new.
    expect(preview.incoming.articleNotes).toBe(1);
    expect(preview.added.articleNotes).toBe(1);
    expect(preview.detachedArticleNotes).toBe(0);

    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP(),
      false,
      undefined,
      validation.assets,
    );
    expect(plan.articleNotesToWrite).toEqual([note]);
    expect(plan.skipped.articleNotes).toBe(0);
    await applyImport(plan);

    // The landed row is byte-identical: same id, same created/updated
    // timestamps, same plain text, same tags, same article association.
    expect(await loadAllArticleNotes()).toEqual([note]);
    const perArticle = await loadArticleNotes(article.id);
    expect(perArticle.notes).toHaveLength(1);
    expect(perArticle.notes[0]).toEqual(note);

    // NEVER a synthesized attachment: the stored row carries no highlightId,
    // no position, no quote — no passage selector of any shape.
    const raw = await db.articleNotes.get(note.id as string);
    expect(raw).toEqual(note);
    expect(raw).not.toHaveProperty("highlightId");
    expect(raw).not.toHaveProperty("position");
    expect(raw).not.toHaveProperty("quote");
  });

  it("skip (default) on a clashing id keeps the LOCAL note — its text, tags, timestamps, and association intact", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    await db.articles.put(sampleArticle());
    const localNote = sampleNote({
      text: "The local reflection.",
      tags: ["local-only"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    await db.articleNotes.put(localNote as ArticleNote);

    const incoming = sampleNote({ updatedAt: "2026-09-22T00:00:00.000Z" });
    const result = await validateBundle(await bundleFile([sampleArticle()], [incoming]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    expect(preview.conflicts.map((c) => c.kind)).toEqual(["article-note-id"]);
    expect(preview.conflicts[0]).toMatchObject({ count: 1, sampleIds: [incoming.id] });

    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    expect(plan.articleNotesToWrite).toEqual([]);
    expect(plan.skipped.articleNotes).toBe(1);
    await applyImport(plan);

    const rows = await loadAllArticleNotes();
    expect(rows).toEqual([localNote]);
  });

  it("keep-both mints a fresh id that CARRIES the incoming text/tags/timestamps with the article association UNCHANGED; no FK rewrite", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    await db.articles.put(sampleArticle());
    const localNote = sampleNote({ text: "The local reflection.", tags: ["local-only"] });
    await db.articleNotes.put(localNote as ArticleNote);

    const incoming = sampleNote();
    const result = await validateBundle(await bundleFile([sampleArticle()], [incoming]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    const plan = await resolveImportPlan(
      result.bundle,
      preview,
      { ...ALL_SKIP(), "article-note-id": "keep-both" },
      false,
    );

    expect(plan.articleNotesToWrite).toHaveLength(1);
    const minted = plan.articleNotesToWrite[0]!;
    expect(minted.id).not.toBe(incoming.id);
    // Everything else rides verbatim — timestamps, text, tags, association.
    expect(minted).toEqual({ ...incoming, id: minted.id });
    // Article ids are never minted, so no idRewrites entry exists (the map
    // stays the highlight/passage-note FK machinery — Pitfall 7).
    expect(plan.idRewrites.size).toBe(0);

    await applyImport(plan);
    const rows = await loadAllArticleNotes();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === localNote.id)).toEqual(localNote);
    expect(rows.find((r) => r.id === minted.id)).toEqual(minted);
  });

  it("overwrite puts the incoming note whole under its OWN id (tags, timestamps, association replaced together)", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    await db.articles.put(sampleArticle());
    await db.articleNotes.put(
      sampleNote({ text: "The local reflection.", tags: ["local-only"] }) as ArticleNote,
    );

    const incoming = sampleNote();
    const result = await validateBundle(await bundleFile([sampleArticle()], [incoming]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    const plan = await resolveImportPlan(
      result.bundle,
      preview,
      { ...ALL_SKIP(), "article-note-id": "overwrite" },
      false,
    );
    expect(plan.articleNotesToWrite).toEqual([incoming]);
    await applyImport(plan);

    const rows = await loadAllArticleNotes();
    expect(rows).toEqual([incoming]);
  });

  it("a note whose article is NOWHERE on the receiving device never writes — skipped with the honest preview count", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    // The bundle carries the note but NOT its article; nothing local or
    // bundled resolves "art-gone".
    const result = await validateBundle(
      await bundleFile([sampleArticle("art-present")], [sampleNote({ articleId: "art-gone" })]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    expect(preview.detachedArticleNotes).toBe(1);
    // The detached note is neither "added" nor "conflicting" — the preview
    // must not promise it (the dangling-assets convention). "incoming"
    // mirrors the bundle's true contents.
    expect(preview.incoming.articleNotes).toBe(1);
    expect(preview.added.articleNotes).toBe(0);
    expect(preview.conflicts).toEqual([]);

    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    expect(plan.articleNotesToWrite).toEqual([]);
    expect(plan.skipped.articleNotes).toBe(1);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([]);
  });

  it("recovery drafts stay LOCAL-ONLY device state — an ArticleNoteDraft never serializes into the bundle", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();

    await db.articles.put(sampleArticle());
    await db.articleNotes.put(sampleNote() as ArticleNote);
    // A tag-only INCOMPLETE draft (issue #209's recoverable shape) — device
    // state, never library record.
    await db.articleNoteDrafts.put(
      sampleNote({
        id: "an-draft-1",
        text: "",
        tags: ["draft-tag"],
        updatedAt: "2026-09-22T00:00:00.000Z",
      }) as unknown as ArticleNote,
    );

    const { bytes } = await buildBundle();
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(bytes);
    const parsed = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      articleNotes: { id: string }[];
    };
    expect(parsed.articleNotes.map((n) => n.id)).toEqual(["an-roundtrip-1"]);
  });

  it("a note attached to a LOCAL article that does not ride the bundle still imports (association resolves locally)", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    // The local article is NOT in the bundle; the bundle carries only the
    // note (the fixture-backed-highlight carriage shape, now for notes).
    await db.articles.put(sampleArticle("art-local-only"));
    const note = sampleNote({ articleId: "art-local-only" });
    const result = await validateBundle(await bundleFile([], [note]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.fixtureIds).toEqual([]); // no fixture reference — it's a LOCAL article

    const preview = await detectImportPreview(result.bundle);
    expect(preview.detachedArticleNotes).toBe(0);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    expect(plan.articleNotesToWrite).toEqual([note]);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([note]);
  });

  it("a note attached to a bundled FIXTURE article imports (the three-source lookup resolves fixtures)", async () => {
    const { bundledFixtures } = await import("../../../src/fixtures");
    const fixture = bundledFixtures[0]!;
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    const note = sampleNote({ id: "an-fixture-1", articleId: fixture.id });
    const result = await validateBundle(await bundleFile([], [note]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    expect(preview.detachedArticleNotes).toBe(0);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    expect(plan.articleNotesToWrite).toEqual([note]);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([note]);
  });

  it.each([
    { localChoice: true, incoming: false, existingContent: false, removed: true },
    { localChoice: undefined, incoming: true, existingContent: false, removed: true },
    { localChoice: false, incoming: true, existingContent: false, removed: false },
    { localChoice: undefined, incoming: true, existingContent: true, removed: false },
  ])(
    "starter association follows the effective removal choice: %j",
    async ({ localChoice, incoming, existingContent, removed }) => {
      const { STARTER_CHOICE_KEY, STARTER_ARTICLE_ID } =
        await import("../../../src/persistence/starterArticleStore");
      const { validateBundle, applyImport } = await loadService();
      const { detectImportPreview, resolveImportPlan } = await loadConflicts();
      const { db } = await loadDb();
      await db.open();
      if (localChoice !== undefined)
        await db.settings.put({ key: STARTER_CHOICE_KEY, value: localChoice });
      if (existingContent) await db.articles.put(sampleArticle());
      const file = await bundleFile([], [sampleNote({ articleId: STARTER_ARTICLE_ID })]);
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const envelope = JSON.parse(strFromU8(entries["bundle.json"]!));
      envelope.starterRemoved = incoming;
      const result = await validateBundle(await rawBundleFile(envelope));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const preview = await detectImportPreview(result.bundle);
      expect(preview.detachedArticleNotes).toBe(removed ? 1 : 0);
      expect(preview.added.articleNotes).toBe(removed ? 0 : 1);
      const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
      expect(plan.skipped.articleNotes).toBe(removed ? 1 : 0);
      await applyImport(plan);
      const { openArticle } = await import("../../../src/content/repository");
      expect((await openArticle(STARTER_ARTICLE_ID)) === null).toBe(removed);
      expect(await db.articleNotes.count()).toBe(removed ? 0 : 1);
    },
  );

  it("the EXPORTER derives fixtureIds from article-note associations (fixtures never serialize, their referenced ids do)", async () => {
    const { bundledFixtures } = await import("../../../src/fixtures");
    const fixture = bundledFixtures[0]!;
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();

    // A local note on a FIXTURE article — the article itself must never ride
    // the bundle, but its id must join fixtureIds so machine B re-resolves
    // the note against its own bundled copy.
    await db.articleNotes.put(
      sampleNote({ id: "an-fixture-export", articleId: fixture.id }) as ArticleNote,
    );
    const { bytes } = await buildBundle();
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(bytes);
    const parsed = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      articles: unknown[];
      fixtureIds: string[];
      articleNotes: { id: string }[];
    };
    expect(parsed.articles).toEqual([]); // fixtures never serialize
    expect(parsed.fixtureIds).toEqual([fixture.id]);
    expect(parsed.articleNotes.map((n) => n.id)).toEqual(["an-fixture-export"]);
  });

  it("a note on a DANGLING-ASSETS article (not local, not fixture) is detached too — the second-order skip", async () => {
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    // The article rides the bundle but its figure bytes do not — the
    // no-broken-refs gate skips it under EVERY override, and nothing local
    // or bundled resolves the id, so the attached note detaches as well.
    const figureArticle = ArticleSchema.parse({
      ...sampleArticle("art-figure-gone"),
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "Before the figure.", marks: [] }],
        },
        { kind: "figure", src: "asset:img-a1b2c3d4e5f6", alt: "A missing figure" },
      ],
    });
    const note = sampleNote({ articleId: "art-figure-gone" });
    const result = await validateBundle(await bundleFile([figureArticle], [note]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detectImportPreview(result.bundle);
    expect(preview.danglingAssetArticles).toBe(1);
    expect(preview.detachedArticleNotes).toBe(1);

    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    expect(plan.articleNotesToWrite).toEqual([]);
    expect(plan.skipped.articleNotes).toBe(1);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([]);
  });

  it("a malformed article-note record refuses the bundle as invalid — ALL issues listed, nothing written", async () => {
    const { validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();

    const result = await validateBundle(
      await rawBundleFile({
        schemaVersion: 8,
        exportedAt: "2026-09-29T12:00:00.000Z",
        appVersion: "test",
        articles: [sampleArticle()],
        locations: [],
        highlights: [],
        notes: [],
        articleNotes: [
          sampleNote({ id: "", createdAt: "not-a-date" }),
          sampleNote({ id: "an-bad-tags", tags: ["", "ok"] }),
        ],
        preferences: {
          schemaVersion: 2,
          font: "serif",
          size: 18,
          measure: 58,
          spacing: "comfortable",
          theme: "sepia",
          readingMode: "paginated",
        },
        fixtureIds: [],
        books: [],
        assets: [],
        readingSessions: [],
        subscriptions: [],
        starterRemoved: false,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe("invalid");
    if (result.refusal.kind !== "invalid") return;
    // ALL issues, never just the first (Pitfall 11 #2).
    expect(result.refusal.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.refusal.issues.some((i) => i.includes("articleNotes"))).toBe(true);

    // The refusal short-circuits before any plan can exist: nothing was
    // validated, so nothing can be applied — the library stays empty.
    expect(await db.articles.count()).toBe(0);
  });

  it("a tampered articleNotes block refuses as corrupted (the manifest is a detection surface)", async () => {
    const { zipSync } = await import("fflate");
    const { validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.open();

    const envelope = {
      schemaVersion: 8 as const,
      exportedAt: "2026-09-29T12:00:00.000Z",
      appVersion: "test",
      articles: [sampleArticle()],
      locations: [],
      highlights: [],
      notes: [],
      articleNotes: [sampleNote()],
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
      readingSessions: [],
      subscriptions: [],
      starterRemoved: false,
    };
    const bundle = ExportBundleSchema.parse(envelope);
    const manifest = await computeManifest(bundle);
    // Tamper AFTER the manifest: the note text drifts, the block hash no
    // longer matches — the importer refuses before any transaction.
    const tampered = { ...bundle, articleNotes: [sampleNote({ text: "Rewritten by tampering." })] };
    const file = new File(
      [
        zipSync({
          "bundle.json": bundleJsonOf(JSON.parse(JSON.stringify(tampered))),
          "manifest.json": bundleJsonOf(manifest),
        }),
      ],
      "tampered.zip",
    );
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: "corrupted", failedBlocks: ["articleNotes"] });
  });

  it("a GENUINE v7 export (claimed manifest predating the articleNotes key) validates through the absent-key shim", async () => {
    const { zipSync } = await import("fflate");
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    await db.open();
    const { loadAllArticleNotes } = await loadArticleNotesStore();

    const bundle = ExportBundleSchema.parse({
      schemaVersion: 7 as const,
      exportedAt: "2026-09-29T12:00:00.000Z",
      appVersion: "test",
      articles: [sampleArticle()],
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
      readingSessions: [],
      subscriptions: [],
      starterRemoved: false,
    });
    // A genuine v7 exporter's manifest has NO articleNotes key (the block
    // did not exist). Delete it to simulate the real bytes.
    const manifest = await computeManifest(bundle);
    delete (manifest.blocks as Record<string, string>).articleNotes;
    const file = new File(
      [
        zipSync({
          "bundle.json": bundleJsonOf(JSON.parse(JSON.stringify(bundle))),
          "manifest.json": bundleJsonOf(manifest),
        }),
      ],
      "v7.zip",
    );
    const result = await validateBundle(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = await detectImportPreview(result.bundle);
    const plan = await resolveImportPlan(result.bundle, preview, ALL_SKIP(), false);
    await applyImport(plan);
    expect(await loadAllArticleNotes()).toEqual([]);
  });
});
