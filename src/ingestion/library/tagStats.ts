// src/ingestion/library/tagStats.ts
// Issue #75 (decision #71) — the count-returning tag fold, in its own PURE
// module as of the #101 review: deriveTagStats is an in-memory fold over
// rows the caller already holds, but it lived beside the Dexie seams in
// tagsStore — so a shell that wants the fold at render time dragged the
// persistence graph onto its import chain. The fold lives here (zero
// imports); tagsStore re-exports it for its store-level consumers.
//
// No persistence, no side effects; the Add-dialog store read, the library
// rows, and the shell's picker stats all funnel through this ONE definition
// so suggestion order cannot drift between hosts.

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
 * deriveTagStats — THE count-returning tag fold (issue #75, decision #71):
 * count each tag across the given article + book rows (D12-04 — books carry
 * tags too), then order count-descending with alphabetical tie-breaks.
 *
 * The fold is CASE-INSENSITIVE (issue #75 review): casing variants of the
 * same tag fold into ONE entry — "Essays"/"essays" count together — so the
 * most-used ordering the picker promises cannot be split by casing. The
 * displayed casing is the first seen in fold order (every write seam routes
 * to stored casing, so variants only exist in legacy rows).
 */
export function deriveTagStats(
  articles: ReadonlyArray<{ tags?: string[] }>,
  books: ReadonlyArray<{ tags?: string[] }>,
): TagStat[] {
  const counts = new Map<string, { tag: string; count: number }>();
  const fold = (rows: ReadonlyArray<{ tags?: string[] }>) => {
    for (const row of rows) {
      for (const tag of row.tags ?? []) {
        const key = tag.toLowerCase();
        const current = counts.get(key);
        if (current) current.count += 1;
        else counts.set(key, { tag, count: 1 });
      }
    }
  };
  fold(articles);
  fold(books);
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}
