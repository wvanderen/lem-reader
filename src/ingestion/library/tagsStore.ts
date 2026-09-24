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

/**
 * TagStat — one tag's usage count (issue #75, decision #71): the picker's
 * suggestion currency. Counts NEVER render — they only order suggestions
 * (most-used first) — and the derivation is in memory, so no Dexie schema,
 * index, or migration changes (D8-05/D8-08 untouched; auto-prune stays
 * implicit: a tag no longer carried by any row falls out of the next read).
 */
export interface TagStat {
  tag: string;
  count: number;
}

/**
 * deriveTagStats — THE count-returning tag fold (issue #75, decision #71),
 * the pure core both suggestion sources share: count each tag across the
 * given article + book rows (D12-04 — books carry tags too), then order
 * count-descending with alphabetical tie-breaks. No persistence, no side
 * effects; the Add-dialog store read and the snapshot host both funnel
 * through this ONE definition so suggestion order cannot drift between
 * hosts.
 */
export function deriveTagStats(
  articles: ReadonlyArray<{ tags?: string[] }>,
  books: ReadonlyArray<{ tags?: string[] }>,
): TagStat[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  for (const book of books) {
    for (const tag of book.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

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
 * `setArticleTags` — Write the tag array for a single article by id.
 *
 * Idempotent: `db.articles.update(id, { tags })` is a primary-key update; the
 * same call repeated produces the same row state. A non-existent id is a
 * no-op (Dexie `update` returns 0 rows updated; no throw).
 *
 * Defensively drops empty-string tags before writing (`tags.filter(t =>
 * t.length > 0)`) to mirror the `z.string().min(1)` schema constraint — a
 * stray empty string would produce an invalid row that ArticleSchema would
 * reject on the next `dexieLibrarySource.list()` read (STATE-04 corrupt-row
 * drop).
 */
export async function setArticleTags(
  articleId: string,
  tags: string[],
): Promise<void> {
  const cleaned = tags.filter((t) => t.length > 0);
  await db.articles.update(articleId, { tags: cleaned });
}
