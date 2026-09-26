// src/ingestion/library/tagsStore.ts
// Plan 08-02 — Tag persistence surface (LIB-04). Denormalized on the article
// row (D8-05 — document-tag namespace); the `*tags` multi-entry index landed
// in Plan 02 Task 1 enables future Dexie-only queries, but the current
// implementation uses `dexieLibrarySource.list()` (toArray under the hood) +
// an in-memory Set for simplicity and to reuse the existing Zod-validated
// read path.
//
// D8-05 (document-tag namespace): tags are per-article; there is NO separate
// tag table. The distinct tag set is DERIVED from article rows on read.
//
// D8-08 (auto-prune): a tag no longer carried by ANY article disappears from
// `loadAllTags()` on the next read — NO cleanup write needed. The Set-based
// derivation is the auto-prune mechanism (Pitfall 8-3 defense — there is no
// stale tag table to forget to clean).
//
// Pitfall 9 (additive index): the `*tags` index on articles is additive;
// existing v3 rows hydrate `tags: []` via the ArticleSchema `.default([])`
// mechanism. No row migration occurs.
//
// STATE-04 (Zod-at-boundary on read): `loadAllTags` delegates to
// `dexieLibrarySource.list()` which runs `ArticleSchema.safeParse` on every
// row; corrupt rows are dropped silently (mirrors LibrarySource.ts L53-64).
// A single corrupt row does not throw or block the tag derivation.
//
// Threat register (08-02-PLAN.md `<threat_model>`):
//   - T-8-06 (Tampering, corrupt tag row) → dexieLibrarySource.list() Zod-
//     validates; corrupt rows dropped (STATE-04).
//   - T-8-07 (Tampering/XSS via tag name) → tags are plain strings; React
//       escapes text children when rendering chips. Defensive
//       `tags.filter(t => t.length > 0)` in setArticleTags mirrors the
//       `z.string().min(1)` schema constraint.
import { db } from "../../persistence/db";
import { dexieLibrarySource } from "../LibrarySource";
import { listBooks } from "../../persistence/booksStore";
import { normalizeTags, routeTagsToStoredCasing } from "./tagText";

/**
 * `loadAllTags` — Derive the distinct tag set from ALL article rows.
 *
 * Returns a sorted `string[]` of every tag carried by at least one article in
 * the Dexie library (NOT fixtures — `dexieLibrarySource.list()` reads only
 * ingested rows). Auto-prune is implicit (D8-08): a tag no longer carried by
 * any article falls out of the Set on the next read — NO cleanup write needed.
 *
 * Read path delegates to `dexieLibrarySource.list()`, which Zod-validates
 * every row (STATE-04); corrupt rows are dropped silently and do not throw.
 *
 * The returned array is sorted via `localeCompare` for deterministic chip
 * ordering in Plan 03's LibraryView.
 */
export async function loadAllTags(): Promise<string[]> {
  const articles = await dexieLibrarySource.list();
  const set = new Set<string>();
  for (const article of articles) {
    for (const tag of article.tags ?? []) {
      set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Issue #101 (review follow-up) — the fold lives in ./tagStats now (a pure,
// zero-import module) so consumers that hold rows already — the library
// rows, the shell's picker stats — can fold WITHOUT importing the Dexie
// graph this store seam carries. Re-exported here so every store-level
// consumer keeps its import site.
import { deriveTagStats } from "./tagStats";
import type { TagStat } from "./tagStats";
export { deriveTagStats } from "./tagStats";
export type { TagStat } from "./tagStats";

/**
 * loadTagStats — the store-level suggestion read for hosts that hold no
 * LibrarySnapshot (the Add dialog and the reader's TagEntry). The
 * count-returning sibling of `loadAllTags`: same persisted-rows-only
 * population (dexieLibrarySource.list() — Zod-validated, corrupt rows
 * dropped, STATE-04), extended with the book rows per D12-04, folded by
 * the ONE deriveTagStats definition. Books fail-quiet like the snapshot
 * (a books-load failure routes calmly to zero book rows).
 */
export async function loadTagStats(): Promise<TagStat[]> {
  const [articles, booksResult] = await Promise.all([
    dexieLibrarySource.list(),
    listBooks(),
  ]);
  const books = booksResult.ok ? booksResult.books : [];
  return deriveTagStats(articles, books);
}

/**
 * routeToStoredCasing — the shared write-seam discipline (issue #75 review):
 * normalize the input (trim, drop empties, case-insensitive dedupe —
 * tagText.normalizeTags), then resolve each already-known tag against the
 * PERSISTED universe (article + book rows via loadTagStats) so a stale or
 * failed picker stats read can never stack a case twin on disk. The universe
 * read fail-opens to [] — a suggestion-read failure degrades to the exact
 * write, it never fails the write.
 */
async function routeToStoredCasing(tags: readonly string[]): Promise<string[]> {
  const cleaned = normalizeTags(tags);
  if (cleaned.length === 0) return [];
  let universe: string[] = [];
  try {
    universe = (await loadTagStats()).map((s) => s.tag);
  } catch {
    universe = [];
  }
  return routeTagsToStoredCasing(cleaned, universe);
}

/**
 * `setArticleTags` — Write the tag array for a single article by id.
 *
 * Idempotent: `db.articles.update(id, { tags })` is a primary-key update; the
 * same call repeated produces the same row state. A non-existent id is a
 * no-op (Dexie `update` returns 0 rows updated; no throw).
 *
 * The input runs through `routeToStoredCasing`: trim, drop empties (mirrors
 * the `z.string().min(1)` schema constraint — a stray empty string would
 * produce an invalid row that ArticleSchema would reject on the next
 * `dexieLibrarySource.list()` read, STATE-04 corrupt-row drop), dedupe
 * case-insensitively, and Q7A-routing to the persisted casing.
 */
export async function setArticleTags(
  articleId: string,
  tags: string[],
): Promise<void> {
  const routed = await routeToStoredCasing(tags);
  await db.articles.update(articleId, { tags: routed });
}

/**
 * `setBookTags` — write the tag array for one Book by id (D12-04 — tags live
 * on the Book record, NOT per-chapter). Adopted here from booksStore (issue
 * #75 review) so tagsStore is the ONE tag-write seam: the identical
 * `routeToStoredCasing` discipline as setArticleTags, one universe read.
 * Idempotent primary-key update; a non-existent id is a no-op.
 */
export async function setBookTags(id: string, tags: string[]): Promise<void> {
  const routed = await routeToStoredCasing(tags);
  await db.books.update(id, { tags: routed });
}
