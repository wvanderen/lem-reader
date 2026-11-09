// tests/unit/portability/collection-import-conflicts.spec.ts
// Issue #249 — the collection-conflict choice workflow at the import
// boundary. A same-id DIFFERENT collection is an explicit reader choice
// (keep local / use imported / keep both), never a silent keep-local
// refusal (#248's interim behavior), never an order merge, never a quiet
// entry drop:
//
//   - the PREVIEW reports every conflicted collection with both
//     arrangements' names and entry counts, plus whether keep-local is
//     still honest against the winning rows (the dialog's per-item rows)
//   - keep-local (the default) preserves the LOCAL arrangement untouched
//   - use-imported writes the incoming arrangement WHOLE — its order and
//     its targets, never merged with local order
//   - keep-both lands the incoming arrangement as a SEPARATE collection
//     under fresh identities (collection id + every entry id), targets
//     riding unchanged — references never clone readings (ADR 0011)
//   - content/structure resolution precedes collection references: an
//     arrangement is refused WHOLE when a target does not resolve against
//     the rows that actually win, and a kept-local arrangement broken by
//     the reader's own content choices is admitted honestly, never
//     silently left dangling
//   - every choice commits inside the ONE import transaction (rollback
//     unchanged), and repeated imports stay calm (no duplicates)
//
// Harness mirrors tests/unit/portability/collections-roundtrip.spec.ts
// (fake-indexeddb via Dexie.dependencies, wipeDatabase beforeEach, lazy
// module imports, hand-built v10 bundles through the shipped schemas).
import { beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  ArticleSchema,
  CollectionSchema,
} from "../../../src/content/schema";
import type { CanonicalArticle, Collection } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import type { ImportItemChoices, Overrides } from "../../../src/portability/conflicts";
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

const preferences = {
  schemaVersion: 2 as const,
  font: "serif" as const,
  size: 18 as const,
  measure: 58 as const,
  spacing: "comfortable" as const,
  theme: "sepia" as const,
  readingMode: "paginated" as const,
};

const ALL_SKIP: Overrides = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  "article-note-id": "skip",
  location: "skip",
};

/** A chaptered web work with a derived structural snapshot — the corpus a
 * work-chapter entry target needs to resolve. */
const workArticle = (overrides: Partial<CanonicalArticle> = {}): CanonicalArticle => {
  const base = ArticleSchema.parse({
    id: "art-conflict-work01",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/chaptered-work",
      title: "Chaptered Work",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "4".repeat(64),
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "First", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Body one.", marks: [] }] },
      { kind: "heading", level: 2, content: [{ text: "Second", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Body two.", marks: [] }] },
    ],
    footnotes: [],
    ...overrides,
  });
  return { ...base, structure: deriveWorkStructure(base)! };
};

/** A plain standalone article — a second resolvable target. */
const sideArticle = (): CanonicalArticle =>
  ArticleSchema.parse({
    id: "art-conflict-side02",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/side-article",
      title: "Side Article",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "5".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Side body.", marks: [] }] }],
    footnotes: [],
  });

/** A whole-article entry on the work. */
const workEntry = (id: string, addedAt: string) => ({
  id,
  target: { kind: "article" as const, articleId: "art-conflict-work01" },
  addedAt,
});

/** A whole-article entry on the standalone article. */
const sideEntry = (id: string, addedAt: string) => ({
  id,
  target: { kind: "article" as const, articleId: "art-conflict-side02" },
  addedAt,
});

/** A whole-article entry naming a MISSING reading. */
const missingEntry = (id: string, addedAt: string): Collection["entries"][number] => ({
  id,
  target: { kind: "article", articleId: "art-never-anywhere" },
  addedAt,
});

const buildCollection = (shape: {
  id: string;
  name: string;
  entries: Collection["entries"];
  createdAt?: string;
  updatedAt?: string;
}): Collection =>
  CollectionSchema.parse({
    schemaVersion: 1,
    id: shape.id,
    name: shape.name,
    entries: shape.entries,
    createdAt: shape.createdAt ?? "2026-09-02T00:00:00.000Z",
    updatedAt: shape.updatedAt ?? shape.createdAt ?? "2026-09-02T00:00:00.000Z",
  });

async function v10BundleFile(payload: {
  articles?: CanonicalArticle[];
  collections?: unknown[];
  collectionActiveEntries?: unknown[];
}): Promise<File> {
  const { ExportBundleSchema } = await import("../../../src/portability/bundle");
  const bundle = ExportBundleSchema.parse({
    schemaVersion: 10,
    exportedAt: "2026-10-01T12:00:00.000Z",
    appVersion: "test",
    articles: JSON.parse(JSON.stringify(payload.articles ?? [])),
    locations: [],
    highlights: [],
    notes: [],
    preferences,
    fixtureIds: [],
    books: [],
    assets: [],
    readingSessions: [],
    subscriptions: [],
    articleNotes: [],
    starterRemoved: true,
    collections: payload.collections ?? [],
    completions: [],
    collectionActiveEntries: payload.collectionActiveEntries ?? [],
  });
  const manifest = await computeManifest(bundle);
  return zipFileOf({
    "bundle.json": new TextEncoder().encode(JSON.stringify(JSON.parse(JSON.stringify(bundle)))),
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
  });
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

/** The full dry-run + plan pass against the freshly re-read local state.
 * `itemChoices` rides the Phase 17 per-item parameter shape extended by
 * #249's collection choices. */
async function planBundle(file: File, itemChoices: ImportItemChoices = { metadataTakeIncoming: new Set() }) {
  const { validateBundle } = await loadService();
  const { detectImportPreview, resolveImportPlan } = await loadConflicts();
  const validated = await validateBundle(file);
  if (!validated.ok)
    throw new Error(`fixture bundle invalid: ${JSON.stringify(validated.refusal)}`);
  const preview = await detectImportPreview(validated.bundle, []);
  const plan = await resolveImportPlan(validated.bundle, preview, ALL_SKIP, false, itemChoices);
  return { validated, preview, plan };
}

/** Seed local rows, build + plan the bundle in one step. When `apply` is
 * true the plan commits through the ONE transaction and the loaded db is
 * returned for row truth. */
async function seedAndPlan(payload: {
  localArticles?: CanonicalArticle[];
  localCollections?: Collection[];
  localActiveEntries?: unknown[];
  bundleArticles?: CanonicalArticle[];
  bundleCollections?: unknown[];
  bundleActiveEntries?: unknown[];
  itemChoices?: ImportItemChoices;
  apply?: boolean;
}) {
  const { db } = await loadDb();
  for (const article of payload.localArticles ?? []) await db.articles.put(article);
  for (const collection of payload.localCollections ?? []) await db.collections.put(collection);
  for (const memory of payload.localActiveEntries ?? []) {
    await db.collectionActiveEntries.put(
      memory as { schemaVersion: 1; collectionId: string; entryId: string; updatedAt: string },
    );
  }
  const { validated, preview, plan } = await planBundle(
    await v10BundleFile({
      articles: payload.bundleArticles,
      collections: payload.bundleCollections,
      collectionActiveEntries: payload.bundleActiveEntries,
    }),
    payload.itemChoices,
  );
  if (payload.apply ?? false) {
    const { applyImport } = await loadService();
    await applyImport(plan);
  }
  return { db, validated, preview, plan };
}

describe("collection import conflicts (issue #249)", () => {
  beforeEach(wipeDatabase);

  it("reports every conflicted collection to the preview with both arrangements and keep-local validity", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0001",
      name: "My order",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0001", // the SAME identity, a different arrangement
      name: "Their order",
      entries: [
        workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z"),
        sideEntry("entry-cccccccc", "2026-09-02T00:01:00.000Z"),
      ],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { preview } = await seedAndPlan({
      localArticles: [work, sideArticle()],
      localCollections: [local],
      bundleArticles: [work, sideArticle()],
      bundleCollections: [incoming],
    });
    expect(preview.conflictingCollections).toBe(1);
    expect(preview.collectionConflicts).toEqual([
      {
        id: local.id,
        localName: "My order",
        incomingName: "Their order",
        localEntryCount: 1,
        incomingEntryCount: 2,
        localValid: true,
      },
    ]);
  });

  it("reports WHY keep-local is unsafe when the local arrangement no longer resolves", async () => {
    const work = workArticle();
    // The local arrangement carries a MISSING target (dangling since some
    // earlier removal): keep-local cannot honestly be offered as safe.
    const local = buildCollection({
      id: "coll-conf-0011",
      name: "Half broken",
      entries: [
        workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z"),
        missingEntry("entry-bbbbbbbb", "2026-09-02T00:01:00.000Z"),
      ],
    });
    const incoming = buildCollection({
      id: "coll-conf-0011",
      name: "Their order",
      entries: [workEntry("entry-cccccccc", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { preview } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work],
      bundleCollections: [incoming],
    });
    expect(preview.conflictingCollections).toBe(1);
    expect(preview.collectionConflicts[0]).toMatchObject({
      id: local.id,
      localValid: false,
      localInvalidReason: "a reading isn't available",
    });
  });

  it("reports a stale chapter destination as the keep-local reason", async () => {
    const localWork = workArticle(); // chapters First + Second
    const staleDestination = "ch-999.b"; // no such chapter anywhere
    const local = buildCollection({
      id: "coll-conf-0012",
      name: "Stale plan",
      entries: [
        {
          id: "entry-aaaaaaaa",
          target: {
            kind: "work-chapter",
            articleId: localWork.id,
            destinationId: staleDestination,
          },
          addedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    const incoming = buildCollection({
      id: "coll-conf-0012",
      name: "Their plan",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { preview } = await seedAndPlan({
      localArticles: [localWork],
      localCollections: [local],
      bundleArticles: [localWork],
      bundleCollections: [incoming],
    });
    expect(preview.collectionConflicts[0]).toMatchObject({
      localValid: false,
      localInvalidReason: "a chapter isn't in the reading's current structure",
    });
  });

  it("keep-local is the default: the local arrangement survives untouched", async () => {
    const work = workArticle();
    const side = sideArticle();
    const local = buildCollection({
      id: "coll-conf-0002",
      name: "My order",
      entries: [sideEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z"), workEntry("entry-bbbbbbbb", "2026-09-02T00:01:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0002",
      name: "Their order",
      entries: [workEntry("entry-cccccccc", "2026-09-02T00:00:00.000Z"), sideEntry("entry-dddddddd", "2026-09-02T00:01:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [work, side],
      localCollections: [local],
      bundleArticles: [work, side],
      bundleCollections: [incoming],
      apply: true,
    });
    expect(plan.collectionsToWrite).toEqual([]); // never a silent overwrite or order merge
    expect(plan.skipped.collections).toBe(1);
    expect(await db.collections.get(local.id)).toEqual(local); // local order, byte-identical
  });

  it("use-imported writes the incoming arrangement WHOLE — its order and its targets", async () => {
    const work = workArticle();
    const side = sideArticle();
    const local = buildCollection({
      id: "coll-conf-0003",
      name: "My order",
      entries: [sideEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z"), workEntry("entry-bbbbbbbb", "2026-09-02T00:01:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0003",
      name: "Their order",
      entries: [workEntry("entry-cccccccc", "2026-09-02T00:00:00.000Z"), sideEntry("entry-dddddddd", "2026-09-02T00:01:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [work, side],
      localCollections: [local],
      bundleArticles: [work, side],
      bundleCollections: [incoming],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionUseImported: new Set([incoming.id]),
      },
      apply: true,
    });
    // The incoming arrangement WHOLE — byte-identical, never order-merged
    // with the local arrangement, never entry-stripped.
    expect(plan.collectionsToWrite).toEqual([incoming]);
    expect(plan.skipped.collections).toBe(0);
    expect(await db.collections.get(incoming.id)).toEqual(incoming);
  });

  it("keep-both lands the incoming arrangement as a SEPARATE collection under fresh identities", async () => {
    const work = workArticle();
    const side = sideArticle();
    const local = buildCollection({
      id: "coll-conf-0004",
      name: "My order",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z"), sideEntry("entry-bbbbbbbb", "2026-09-02T00:01:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0004", // the same id — but keep-both mints a fresh one
      name: "Their order",
      entries: [workEntry("entry-cccccccc", "2026-09-02T00:00:00.000Z"), sideEntry("entry-dddddddd", "2026-09-02T00:01:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [work, side],
      localCollections: [local],
      bundleArticles: [work, side],
      bundleCollections: [incoming],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    // Exactly ONE row writes — the minted copy (the local row is already
    // on disk; no put re-writes it).
    expect(plan.collectionsToWrite).toHaveLength(1);
    const copy = plan.collectionsToWrite[0]!;
    expect(copy.id).not.toBe(local.id);
    expect(copy.id).not.toBe(incoming.id);
    // The copy is SCHEMA-VALID as its own collection (fresh identity, the
    // incoming arrangement's name/order/stamps riding unchanged).
    expect(CollectionSchema.parse(copy)).toEqual(copy);
    expect(copy.name).toBe("Their order");
    expect(copy.entries.map((e) => e.target)).toEqual(incoming.entries.map((e) => e.target));
    // Every entry identity is FRESH — never shared with either arrangement.
    const incomingEntryIds = new Set(incoming.entries.map((e) => e.id));
    const localEntryIds = new Set(local.entries.map((e) => e.id));
    for (const entry of copy.entries) {
      expect(incomingEntryIds.has(entry.id)).toBe(false);
      expect(localEntryIds.has(entry.id)).toBe(false);
    }
    // References, never clones (ADR 0011): exactly the two readings exist —
    // the copy's targets still point at the SAME article ids.
    expect((await db.articles.toArray()).map((a) => a.id).sort()).toEqual(
      [work.id, side.id].sort(),
    );
    // Both arrangements now exist side by side; the local row is untouched.
    expect(await db.collections.get(local.id)).toEqual(local);
    expect(await db.collections.get(copy.id)).toEqual(copy);
  });

  it("keep-both rewrites the remembered active entry to the minted identities", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0005",
      name: "My order",
      entries: [workEntry("entry-local-01", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0005",
      name: "Their order",
      entries: [workEntry("entry-incoming-01", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const localMemory = {
      schemaVersion: 1,
      collectionId: local.id,
      entryId: "entry-local-01", // the LOCAL arrangement's remembered place
      updatedAt: "2026-09-03T00:00:00.000Z",
    };
    const incomingMemory = {
      schemaVersion: 1,
      collectionId: incoming.id, // the bundle's row points at the ORIGINAL id
      entryId: "entry-incoming-01",
      updatedAt: "2026-09-04T00:00:00.000Z",
    };
    const { plan, db } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      localActiveEntries: [localMemory],
      bundleArticles: [work],
      bundleCollections: [incoming],
      bundleActiveEntries: [incomingMemory],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    expect(plan.collectionsToWrite).toHaveLength(1);
    const copy = plan.collectionsToWrite[0]!;
    const rows = await db.collectionActiveEntries.toArray();
    // The LOCAL memory survives untouched (keep-both never rewrites the
    // local arrangement's own Continue place), and the incoming arrangement's
    // memory rides under the MINTED collection id + the MINTED entry id.
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.collectionId === local.id)).toEqual(localMemory);
    const copyMemory = rows.find((r) => r.collectionId === copy.id);
    expect(copyMemory).toEqual({
      schemaVersion: 1,
      collectionId: copy.id,
      entryId: copy.entries[0]!.id,
      updatedAt: incomingMemory.updatedAt,
    });
  });

  it("keep-local leaves the remembered memory decision to the local row — the bundle's row never writes", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0006",
      name: "My order",
      entries: [workEntry("entry-local-01", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0006",
      name: "Their order",
      entries: [workEntry("entry-incoming-01", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const localMemory = {
      schemaVersion: 1,
      collectionId: local.id,
      entryId: "entry-local-01",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };
    const { db } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      localActiveEntries: [localMemory],
      bundleArticles: [work],
      bundleCollections: [incoming],
      bundleActiveEntries: [{
        schemaVersion: 1,
        collectionId: incoming.id,
        entryId: "entry-incoming-01",
        updatedAt: "2026-09-04T00:00:00.000Z",
      }],
      apply: true,
    });
    // The kept-local collection keeps its LOCAL memory untouched.
    expect(await db.collectionActiveEntries.toArray()).toEqual([localMemory]);
  });

  it("preflights the kept-local arrangement against the winning rows and admits breakage honestly", async () => {
    const localWork = workArticle();
    const chapters = localWork.structure!.destinations.filter((d) => d.kind === "chapter");
    const local = buildCollection({
      id: "coll-conf-0007",
      name: "Chapter plan",
      entries: [
        {
          id: "entry-local-01",
          target: {
            kind: "work-chapter",
            articleId: localWork.id,
            destinationId: chapters[1]!.id, // "Second" — exists only in the local structure
          },
          addedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    // The incoming work: SAME id, HIGHER revision, a one-chapter structure —
    // the reader's revision-overwrite content choice makes IT the winner.
    const incomingWork = workArticle({
      revision: 2,
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "First", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Rewritten body.", marks: [] }] },
      ],
    });
    const incoming = buildCollection({
      id: "coll-conf-0007",
      name: "Their order",
      entries: [workEntry("entry-incoming-01", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { preview, db } = await seedAndPlan({
      localArticles: [localWork],
      localCollections: [local],
      bundleArticles: [incomingWork],
      bundleCollections: [incoming],
      apply: true,
    });
    // The preview ran under skip-by-default content: the LOCAL work was the
    // winner, so keep-local honestly looked valid there.
    expect(preview.collectionConflicts[0]).toMatchObject({ localValid: true });
    const overrides: Overrides = { ...ALL_SKIP, "article-revision": "overwrite" };
    const { resolveImportPlan } = await loadConflicts();
    const { validateBundle } = await loadService();
    const validated = await validateBundle(
      await v10BundleFile({ articles: [incomingWork], collections: [incoming] }),
    );
    if (!validated.ok) throw new Error("fixture bundle invalid");
    const planWithOverwrite = await resolveImportPlan(validated.bundle, preview, overrides, false, {
      metadataTakeIncoming: new Set(),
    });
    // The content choice won; the collection choice defaulted keep-local —
    // but the local arrangement's chapter target no longer resolves under
    // the winning structure. The plan honors the keep-local choice (the
    // reader's local row is never destroyed) and ADMITS the breakage.
    expect(planWithOverwrite.collectionsToWrite).toEqual([]);
    expect(planWithOverwrite.skipped.collections).toBe(1);
    expect(planWithOverwrite.collectionConflictsKeptLocalBroken).toBe(1);
    await (await loadService()).applyImport(planWithOverwrite);
    expect(await db.collections.get(local.id)).toEqual(local); // never destroyed
  });

  it("use-imported cannot rescue an arrangement whose targets only resolved under the bundle's content", async () => {
    // The determinism window #248 documented: the PREVIEW resolves incoming
    // targets against the bundle's snapshots (skip-by-default had not been
    // overturned when the reader read it) — but at PLAN time the reader's
    // content choice decides what actually wins. A work-chapter target that
    // only resolves through the bundle's structure is refused WHOLE, no
    // matter which collection choice the reader picked: content/structure
    // resolution strictly precedes collection references.
    const localWork = workArticle({
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Only", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Local single chapter.", marks: [] }] },
      ],
    });
    const incomingWork = workArticle(); // two chapters — targets resolve HERE only
    const chapters = incomingWork.structure!.destinations.filter((d) => d.kind === "chapter");
    const incoming = buildCollection({
      id: "coll-conf-0008",
      name: "Their plan",
      entries: [
        {
          id: "entry-incoming-01",
          target: {
            kind: "work-chapter",
            articleId: incomingWork.id,
            destinationId: chapters[1]!.id, // "Second" — not in the winning local structure
          },
          addedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [localWork],
      bundleArticles: [incomingWork],
      bundleCollections: [incoming],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionUseImported: new Set([incoming.id]),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    // Under skip-by-default content the LOCAL work wins — its one-chapter
    // structure cannot resolve "Second" — so the gate refuses the incoming
    // arrangement whole. Neither choice set reaches it; nothing writes.
    expect(plan.collectionsToWrite).toEqual([]);
    expect(plan.skipped.collections).toBe(1);
    expect(await db.collections.toArray()).toEqual([]);
  });

  it("many-to-many targets stay references: two collections share one reading without cloning it", async () => {
    const work = workArticle();
    const first = buildCollection({
      id: "coll-conf-0021",
      name: "Morning",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const second = buildCollection({
      id: "coll-conf-0022",
      name: "Evening",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:01:00.000Z")],
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [work],
      bundleArticles: [work],
      bundleCollections: [first, second],
      apply: true,
    });
    expect(plan.collectionsToWrite).toEqual([first, second]);
    // Both arrangements exist; the shared reading exists ONCE.
    expect((await db.collections.toArray()).map((c) => c.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect((await db.articles.toArray()).map((a) => a.id)).toEqual([work.id]);
  });

  it("keep-both of a target shared with the local collection adds a reference, never a reading", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0023",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0023",
      name: "Theirs",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { db } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work],
      bundleCollections: [incoming],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    // Two collections, one shared target identity, one reading on disk.
    expect((await db.collections.toArray())).toHaveLength(2);
    expect((await db.articles.toArray()).map((a) => a.id)).toEqual([work.id]);
  });

  it("repeated imports stay calm: a second identical import conflicts again but keeps local", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0024",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0024",
      name: "Theirs",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const file = await v10BundleFile({ articles: [work], collections: [incoming] });
    // First import: keep-both — the copy lands beside the local row.
    const first = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work],
      bundleCollections: [incoming],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    expect(first.db ? await first.db.collections.toArray() : []).toHaveLength(2);
    // Second import of the SAME bundle with the keep-local default: the
    // incoming row conflicts with the ORIGINAL local row again — keep local,
    // no third row, no duplicate articles.
    const second = await planBundle(file);
    expect(second.preview.conflictingCollections).toBe(1);
    expect(second.plan.collectionsToWrite).toEqual([]);
    expect(second.plan.skipped.collections).toBe(1);
    const { applyImport } = await loadService();
    await applyImport(second.plan);
    const { db } = await loadDb();
    expect(await db.collections.toArray()).toHaveLength(2); // local + the one keep-both copy
    expect(await db.articles.toArray()).toHaveLength(1);
  });

  it("an identical re-import after keep-local is the calm no-op", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0025",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const file = await v10BundleFile({ articles: [work], collections: [local] });
    await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work],
      bundleCollections: [local],
      apply: true,
    });
    const second = await planBundle(file);
    // Same bytes again: identical row — no conflict, no write, no skip.
    expect(second.preview.conflictingCollections).toBe(0);
    expect(second.plan.collectionsToWrite).toEqual([]);
    expect(second.plan.skipped.collections).toBe(1); // the identical no-op still counts honestly
  });

  it("neither choice can land an arrangement whose targets are invalid — a valid local row is never overwritten by one", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0031",
      name: "Valid mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incomingBroken = buildCollection({
      id: "coll-conf-0031",
      name: "Broken theirs",
      entries: [missingEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { preview, plan, db } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work],
      bundleCollections: [incomingBroken],
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionUseImported: new Set([incomingBroken.id]),
        collectionKeepBoth: new Set([incomingBroken.id]),
      },
      apply: true,
    });
    // The gate refused the incoming row WHOLE before any choice was
    // consulted: the invalid arrangement is unresolved (the #248 warning),
    // not a choice row, and the valid local collection survives untouched.
    expect(preview.unresolvedCollections).toBe(1);
    expect(preview.conflictingCollections).toBe(0);
    expect(plan.collectionsToWrite).toEqual([]);
    expect(plan.skipped.collections).toBe(1);
    expect(await db.collections.get(local.id)).toEqual(local);
  });

  it("simultaneous reading conflicts and the collection choice resolve independently", async () => {
    const work = workArticle();
    const side = sideArticle();
    const local = buildCollection({
      id: "coll-conf-0032",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0032",
      name: "Theirs",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { db } = await loadDb();
    // Local conflicts on several other kinds at once: the side article moved
    // revision, a highlight id and a location exist locally too.
    await db.articles.put(work);
    await db.articles.put(side);
    await db.collections.put(local);
    await db.highlights.put({
      id: "hl-shared-1",
      schemaVersion: 1,
      articleId: side.id,
      revision: 1,
      quote: { prefix: "", exact: "Side body.", suffix: "" },
      position: { start: 0, end: 10 },
      color: "yellow",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    await db.location.put({
      schemaVersion: 1,
      articleId: side.id,
      revision: 1,
      graphemeOffset: 3,
      savedAt: "2026-09-01T00:00:00.000Z",
    });
    const revisedSide: CanonicalArticle = {
      ...side,
      revision: 2,
    };
    const { validateBundle } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { ExportBundleSchema } = await import("../../../src/portability/bundle");
    const bundle = ExportBundleSchema.parse({
      schemaVersion: 10,
      exportedAt: "2026-10-01T12:00:00.000Z",
      appVersion: "test",
      articles: JSON.parse(JSON.stringify([work, revisedSide])),
      locations: [{
        schemaVersion: 1,
        articleId: side.id,
        revision: 1, // the SAME [articleId+revision] key as the local row
        graphemeOffset: 5,
        savedAt: "2026-09-05T00:00:00.000Z",
      }],
      highlights: [{
        id: "hl-shared-1",
        schemaVersion: 1,
        articleId: side.id,
        revision: 2,
        quote: { prefix: "", exact: "Side body.", suffix: "" },
        position: { start: 0, end: 10 },
        color: "yellow",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }],
      notes: [],
      preferences,
      fixtureIds: [],
      books: [],
      assets: [],
      readingSessions: [],
      subscriptions: [],
      articleNotes: [],
      starterRemoved: true,
      collections: JSON.parse(JSON.stringify([incoming])),
      completions: [],
      collectionActiveEntries: [],
    });
    const manifest = await computeManifest(bundle);
    const file = zipFileOf({
      "bundle.json": new TextEncoder().encode(JSON.stringify(JSON.parse(JSON.stringify(bundle)))),
      "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    });
    const validated = await validateBundle(file);
    if (!validated.ok) throw new Error(`fixture bundle invalid: ${JSON.stringify(validated.refusal)}`);
    const preview = await detectImportPreview(validated.bundle, []);
    // Every kind is visible as its own conflict; the collection conflict is
    // one of them, never entangled with the reading conflicts.
    expect(preview.conflictingCollections).toBe(1);
    expect(preview.conflicts.map((c) => c.kind)).toContain("article-revision");
    expect(preview.conflicts.map((c) => c.kind)).toContain("highlight-id");
    expect(preview.conflicts.map((c) => c.kind)).toContain("location");
    const plan = await resolveImportPlan(validated.bundle, preview, ALL_SKIP, false, {
      metadataTakeIncoming: new Set(),
      collectionUseImported: new Set([incoming.id]),
    });
    // Skip-by-default keeps every reading conflict local; the collection
    // choice still resolves exactly as chosen.
    expect(plan.articlesToWrite).toEqual([]);
    expect(plan.highlightsToWrite).toEqual([]);
    expect(plan.locationsToWrite).toEqual([]);
    expect(plan.collectionsToWrite).toEqual([incoming]);
  });

  it("an over-determined bundle resolves one id once — a repeated identical row never doubles a choice", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0041",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0041",
      name: "Theirs",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { plan, db } = await seedAndPlan({
      localArticles: [work],
      localCollections: [local],
      bundleArticles: [work, work], // an over-determined article block too
      bundleCollections: [incoming, incoming], // the SAME conflicting row twice
      itemChoices: {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
      apply: true,
    });
    // FIRST row wins the choice — exactly ONE copy lands; the repeated row
    // is the honest skipped no-op. Never two copies under one conflict.
    expect(plan.collectionsToWrite).toHaveLength(1);
    expect(plan.skipped.collections).toBe(1);
    const rows = await db.collections.toArray();
    expect(rows).toHaveLength(2); // local + the one copy
    expect(rows.filter((c) => c.name === "Theirs")).toHaveLength(1);
  });

  it("rolls a keep-both copy back when its write fails mid-transaction", async () => {
    const work = workArticle();
    const local = buildCollection({
      id: "coll-conf-0033",
      name: "Mine",
      entries: [workEntry("entry-aaaaaaaa", "2026-09-02T00:00:00.000Z")],
    });
    const incoming = buildCollection({
      id: "coll-conf-0033",
      name: "Theirs",
      entries: [workEntry("entry-bbbbbbbb", "2026-09-02T00:00:00.000Z")],
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const { db } = await loadDb();
    await db.articles.put(work);
    await db.collections.put(local);
    const { validated, plan } = await planBundle(
      await v10BundleFile({ articles: [work], collections: [incoming] }),
      {
        metadataTakeIncoming: new Set(),
        collectionKeepBoth: new Set([incoming.id]),
      },
    );
    void validated;
    const copy = plan.collectionsToWrite[0]!;
    expect(copy.id).not.toBe(incoming.id); // the minted identity is what fails
    // The injected creating-hook failure on the COPY's id rolls the whole
    // transaction back — no article, no collection state anywhere.
    const sentinel = (primKey: unknown, obj: { id?: string }): void => {
      if (obj.id === copy.id) throw new Error("injected keep-both failure");
      void primKey;
    };
    db.collections.hook("creating", sentinel);
    try {
      const { applyImport } = await loadService();
      await expect(applyImport(plan)).rejects.toThrow("injected keep-both failure");
    } finally {
      db.collections.hook("creating").unsubscribe(sentinel);
    }
    expect(await db.articles.toArray()).toHaveLength(1); // the seeded local work — nothing added
    expect(await db.collections.toArray()).toEqual([local]); // the untouched local row, no copy
  });
});
