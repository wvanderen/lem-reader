// src/ingestion/library/tagText.ts
// Issue #75 review follow-up — the ONE pure tag-text vocabulary, shared by
// every seam that touches tag strings (the TagPicker's case routing, the
// addToLibrary save seam, the tagsStore write seams). Storage stays
// exact-match on the row (no migration, D8-05), so this module is where the
// acceptance "a case-insensitive duplicate selects the stored casing" (Q7A)
// actually lives: normalize first (no empties, no case twins), then route to
// the persisted casing when the tag already exists.

/**
 * sameTag — case-insensitive tag equality (the Q7A comparison).
 */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * normalizeTags — trim, drop empties (mirrors the `z.string().min(1)` schema
 * constraint — a stray empty string would produce a row the next read drops,
 * STATE-04), and dedupe case-insensitively with the FIRST-seen casing
 * winning. One definition for the shapes that previously repeated in
 * addToLibrary's cleanTagsForSave, the setArticleTags/setBookTags empty
 * filters, and the picker's draft hygiene.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}

/**
 * routeTagsToStoredCasing — Q7A at the write seam: each input tag resolves
 * to the universe's stored casing when a case-insensitive match exists, so a
 * stale or failed picker stats read can never stack a case twin on disk.
 * Unknown tags pass through untouched (create-new); normalization is the
 * caller's job (call normalizeTags first).
 */
export function routeTagsToStoredCasing(
  tags: readonly string[],
  universe: readonly string[],
): string[] {
  return tags.map((tag) => universe.find((known) => sameTag(known, tag)) ?? tag);
}
