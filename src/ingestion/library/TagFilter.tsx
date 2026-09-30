// src/ingestion/library/TagFilter.tsx
// Plan 08-03 Task 1 — TagFilter (D8-07, D8-08). A `<fieldset className="tag-
// filter">` with a visually-hidden `<legend>` ("Filter by tag") carrying one
// `<button aria-pressed={bool}>` chip per tag.
//
// Single-select radio-equivalent (D8-07): clicking a chip sets it active
// (calls `onSelect(tag)`); clicking the active chip clears it (calls
// `onSelect(null)`). Only one tag active at a time — multi-tag select is a
// later phase.
//
// Auto-prune (D8-08): the parent (LibraryView) derives the `tags` prop from
// `loadAllTags()`, which auto-prunes by construction. If the list is empty,
// this component renders NOTHING (no "no tags yet" copy — spare chrome per
// UI-SPEC §TagFilter).
//
// Forced-colors safety (UI-SPEC §Interaction 10): the `aria-pressed={bool}`
// attribute conveys active state beyond color. The CSS rule
// `.tag-chip[aria-pressed="true"]` flips border + text to `--accent` so the
// chip reads correctly in forced-colors modes (where color alone would not
// survive). Mirrors the Phase 5 mark.unresolved discipline.
interface TagFilterProps {
  /** Auto-pruned list of tags currently applied to ≥1 article. */
  tags: string[];
  /** The currently-active tag filter (null = none active). */
  activeTag: string | null;
  /**
   * Single-select toggle: called with the chip's tag to activate it, or with
   * `null` to clear (either by clicking the active chip again, or by some
   * future "clear" affordance).
   */
  onSelect: (tag: string | null) => void;
  /**
   * Issue #117 — optional VISIBLE name for hosts that show more than one
   * tag dimension (the review panel's "Article tag" / "Highlight tag"
   * filters). Renders the legend visibly in the host's label register and
   * names each chip ("Filter by article tag: …"). Absent = the shipped
   * visually-hidden "Filter by tag" legend + chip names — the LibraryView
   * host is byte-unchanged.
   */
  name?: string;
}

export function TagFilter({ tags, activeTag, onSelect, name }: TagFilterProps) {
  if (tags.length === 0) return null;
  const named = name !== undefined;
  const lowerName = name?.toLowerCase();
  return (
    <fieldset className={named ? "tag-filter tag-filter-named" : "tag-filter"}>
      <legend className={named ? "tag-filter-legend" : "visually-hidden"}>
        {name ?? "Filter by tag"}
      </legend>
      {tags.map((tag) => {
        const isActive = activeTag === tag;
        return (
          <button
            key={tag}
            type="button"
            className="tag-chip"
            aria-pressed={isActive}
            aria-label={
              isActive
                ? named
                  ? `Active ${lowerName} filter: ${tag}. Activate to clear.`
                  : `Active filter: ${tag}. Activate to clear.`
                : named
                  ? `Filter by ${lowerName}: ${tag}`
                  : `Filter by tag: ${tag}`
            }
            onClick={() => onSelect(isActive ? null : tag)}
          >
            {tag}
          </button>
        );
      })}
    </fieldset>
  );
}
