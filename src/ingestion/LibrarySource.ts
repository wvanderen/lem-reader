// src/ingestion/LibrarySource.ts
// Plan 07-06 — the Dexie-backed ArticleRepository + the composite repository
// that UNIONs in-memory fixtures with Dexie-persisted ingested articles.
// This is the D7-02 swap point: src/content/repository.ts now delegates to
// `compositeLibraryRepository`, so every existing caller (FixtureList L9,
// ArticleView L23) reads fixtures + ingested rows through the unchanged
// `listArticles` / `openArticle` wrappers.
//
// Three contracts (07-06-PLAN.md §must_haves truths):
//   1. DexieLibrarySource implements ArticleRepository (list/open) PLUS the
//      write-side surface: save(article), has(id), remove(id). The dedupe-
//      refuse check (D7-07) uses has(id) before save; remove uses a Dexie
//      transaction for the D5-12 cascade.
//   2. compositeLibraryRepository.list() UNIONs inMemoryRepository.list()
//      (fixtures) with DexieLibrarySource.list() (ingested). Ingested wins
//      on id collision — the reader's local library takes precedence over
//      bundled fixtures.
//   3. Zod-at-boundary on read (STATE-04): every Dexie row is validated
//      through `ArticleSchema.safeParse` before it leaves this module.
//      A single corrupt row is dropped (mirrors highlightsStore.ts L72-79).
//
// Threat register (07-06-PLAN.md `<threat_model>`):
//   - T-7-28 (Tampering, re-ingest overwrites article + orphans highlights)
//     → the add dialog calls has(id) BEFORE save; if has returns true, the
//     control surfaces "Already in your library." and never calls save.
//   - T-7-29 (Info Disclosure, cascade-delete misses highlights/notes/
//     locations) → remove(id) runs a Dexie transaction across all four
//     stores; commits atomically or rolls back.
import { db } from "../persistence/db";
import type { AssetRecordRow } from "../persistence/db";
import { ArticleSchema, type CanonicalArticle } from "../content/schema";
import { fixtures } from "../fixtures";
import type { ArticleRepository } from "../content/repository";
import type { ValidatedAsset } from "./IngestionClient";

/**
 * DexieLibrarySource — Dexie-backed ArticleRepository + write surface.
 *
 * list/open implement the read interface (Zod-at-boundary on read; corrupt
 * rows are dropped, never silently coerced). save/has/remove are the write
 * surface used by the add dialog (07-06 Task 2):
 *   - save(article): `db.articles.put(article)` — idempotent upsert by id.
 *   - has(id): the D7-07 dedupe-refuse check.
 *   - remove(id): D5-12 cascade-delete across articles + highlights + notes
 *     + location in a single Dexie transaction.
 */
export class DexieLibrarySource implements ArticleRepository {
  /**
   * list — return all Dexie-persisted articles (NOT fixtures). Each row is
   * validated through ArticleSchema.safeParse; corrupt rows are silently
   * dropped (mirrors highlightsStore.ts L72-79 — a single corrupt row must
   * not block the rest of the library). The compositeLibraryRepository
   * merges the result with fixtures separately.
   */
  async list(): Promise<CanonicalArticle[]> {
    const rows = await db.articles.toArray();
    const valid: CanonicalArticle[] = [];
    for (const row of rows) {
      const parsed = ArticleSchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      }
      // else: drop the corrupt row silently — STATE-04 says never coerce.
    }
    return valid;
  }

  /**
   * open — return one article by id, or null. Validates the row on read.
   */
  async open(id: string): Promise<CanonicalArticle | null> {
    const row = await db.articles.get(id);
    if (!row) return null;
    const parsed = ArticleSchema.safeParse(row);
    return parsed.success ? parsed.data : null;
  }

  /**
   * save — atomic article+assets upsert by id (Phase 20 — D20-04/D20-15:
   * a saved article is always complete). The article row AND its asset rows
   * land in ONE Dexie read-write transaction over articles + assets; an
   * asset-put failure (e.g. QuotaExceeded) rolls back the article put too.
   * `article` and `assets` are validated by construction (the only producer
   * is IngestionClient's re-validation chain). Throws propagate to the
   * caller (the add dialog), which surfaces them as "Something went wrong."
   *
   * Upsert replacement (D20-07): the article's OLD asset rows are
   * range-deleted inside the SAME transaction before the new puts — a
   * re-ingest where a previously-accepted figure now refuses leaves no
   * orphan blob. The default `assets = []` keeps every existing call site
   * (url/paste/markdown/pdf paths — real asset wiring is 20-04 scope)
   * compiling and behaving unchanged.
   *
   * The `createdAt` stamp and every Blob are built BEFORE the transaction
   * opens (the saveBook stamp-before-transaction discipline — the closure
   * stays a pure put/delete sequence: no Zod, no crypto, no network inside,
   * the 09-04 rule).
   */
  async save(
    article: CanonicalArticle,
    assets: ValidatedAsset[] = [],
  ): Promise<void> {
    const createdAt = new Date().toISOString();
    const rows: AssetRecordRow[] = assets.map((asset) => ({
      articleId: article.id,
      assetId: asset.assetId,
      contentType: asset.contentType,
      byteLength: asset.byteLength,
      // TS 7 BlobPart strictness (the 09-01 BufferSource lesson): copy
      // into a fresh ArrayBuffer-backed Uint8Array (the Blob constructor
      // copies the bytes anyway).
      data: new Blob([new Uint8Array(asset.bytes)], {
        type: asset.contentType,
      }),
      createdAt,
    }));
    await db.transaction("rw", db.articles, db.assets, async () => {
      // Upsert replacement FIRST (D20-07): re-ingest replaces the asset
      // set wholesale — the articleId index exists exactly for this range
      // delete.
      await db.assets.where("articleId").equals(article.id).delete();
      await db.articles.put(article);
      for (const row of rows) {
        await db.assets.put(row);
      }
    });
  }

  /**
   * has — the D7-07 dedupe-refuse check. The add dialog calls this
   * BEFORE save; if has returns true, the control surfaces
   * "Already in your library." and refuses the re-ingest.
   */
  async has(id: string): Promise<boolean> {
    return (await db.articles.get(id)) !== undefined;
  }

  /**
   * remove — D5-12 cascade-delete: removes the article AND every highlight,
   * note, location, and asset row keyed to it, in a single Dexie
   * transaction. The transaction guarantees atomicity — either every
   * related row commits the delete, or all roll back (Pitfall 10 — no
   * orphaned highlights/notes; Phase 20 extends the same guarantee to
   * article-owned asset blobs — D20-15: an asset's lifecycle is exactly its
   * article's).
   *
   * The compound-index range queries (highlights/location) mirror
   * highlightsStore.ts L66-69 and locationStore.ts: the `[articleId+revision]`
   * compound index is queried as an array range covering every revision of
   * the article. Notes cascade through their `highlightId` FK: collect the
   * to-be-deleted highlight ids, then delete every note whose highlightId
   * is in that set. Assets cascade through the v6 `articleId` index — ONE
   * range delete line inside this same transaction (D17-13 shape).
   */
  async remove(id: string): Promise<void> {
    await db.transaction(
      "rw",
      db.articles,
      db.highlights,
      db.notes,
      db.location,
      db.assets,
      async () => {
        // Collect the to-be-deleted highlight ids BEFORE deleting them so
        // the notes cascade has the FK set. Within a Dexie transaction,
        // reads see the in-transaction state — querying AFTER the highlights
        // delete would return zero rows and the notes would orphan.
        const highlightIds = (
          await db.highlights
            .where("[articleId+revision]")
            .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
            .primaryKeys()
        ).map((k) => (Array.isArray(k) ? k[0] : k));

        await db.articles.delete(id);

        // Highlights: delete every row for this article across all revisions.
        await db.highlights
          .where("[articleId+revision]")
          .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
          .delete();

        // Notes: cascade through the collected highlight ids. The highlights'
        // primary key is the plain string `id` (not the compound
        // `[articleId+revision]` index), so .primaryKeys() returns string[].
        // The defensive map() guards against compound PKs in case a future
        // schema change alters the highlights primary key.
        if (highlightIds.length > 0) {
          await db.notes.where("highlightId").anyOf(highlightIds).delete();
        }

        // Location: delete every saved location for this article.
        await db.location
          .where("[articleId+revision]")
          .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
          .delete();

        // Assets: every article-owned blob goes with the article (D20-15) —
        // the v6 articleId index range delete, same transaction.
        await db.assets.where("articleId").equals(id).delete();
      },
    );
  }
}

/**
 * dexieLibrarySource — the module-level singleton. The add dialog (Task 2)
 * imports this directly to call has/save; compositeLibraryRepository uses
 * it internally for list/open.
 */
export const dexieLibrarySource = new DexieLibrarySource();

/**
 * compositeLibraryRepository — the D7-02 swap target. UNIONs in-memory
 * fixtures (the v1.0 corpus, bundled JSON) with Dexie-persisted ingested
 * articles. The module-level wrappers in src/content/repository.ts
 * (listArticles / openArticle) delegate to this composite, so FixtureList
 * and ArticleView read fixtures + ingested rows through the unchanged
 * single-import surface.
 *
 * id collision: ingested wins (the reader's local library takes precedence
 * over a bundled fixture). The merge iterates ingested first, fixtures
 * second; the `seen` set dedupes by id, so the first-seen (ingested) wins.
 */
export const compositeLibraryRepository: ArticleRepository = {
  async list() {
    const [fixtureList, ingestedList] = await Promise.all([
      Promise.resolve([...fixtures]),
      dexieLibrarySource.list(),
    ]);
    const seen = new Set<string>();
    const merged: CanonicalArticle[] = [];
    // Ingested first — wins on id collision (D7-07: reader's local library
    // takes precedence over bundled fixtures).
    for (const a of [...ingestedList, ...fixtureList]) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        merged.push(a);
      }
    }
    return merged;
  },

  async open(id) {
    const ingested = await dexieLibrarySource.open(id);
    if (ingested) return ingested;
    return fixtures.find((a) => a.id === id) ?? null;
  },
};
