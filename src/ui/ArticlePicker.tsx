// src/ui/ArticlePicker.tsx
// Issue #107 (the dropped follow-up of decision #72) — the review page's
// ONE searchable article combobox, replacing the native all-articles
// <select> stopgap that #76 shipped "until #75's TagPicker lands".
//
// The TagPicker variant-A register (issue #75 — the machinery now shared
// through useVariantAComboboxState/variantAComboboxInputProps), adapted
// for single-select:
//
//   - Type-to-filter over the EFFECTIVE title (the reader-owned override
//     when present, canonical as fallback — the one-name discipline,
//     D17-09), case-insensitive substring.
//   - The empty-query BROWSE list shows only articles WITH highlights,
//     count-descending (ties alphabetical by effective title) — the
//     filter's job is finding highlights, so zero-highlight articles are
//     noise there. Zero-highlight articles REMAIN FINDABLE BY SEARCH:
//     any non-empty query searches the whole library, zero-count rows
//     rendering after the highlighted ones with their honest "0". A
//     matching zero-count row always claims its slot — even a query that
//     matches the whole suggestion cap of highlighted articles reserves
//     the last slot for it (a bare slice over the concatenated pool
//     would let the highlighted head push every zero row out of the
//     list).
//   - Each suggestion carries its visible count (decision #72 — counts
//     render here; the TagPicker's counts-never-render rule is a tagging
//     decision, not a picker-family one).
//   - An honest no-match line when a query matches nothing (calm refusal,
//     never a silently empty dropdown).
//   - Picking is the host's decision: the review page navigates to the
//     scoped URL (#/highlights?article=<id>), where the removable scope
//     chip takes over — one slot, two states, and the URL stays the ONE
//     article-filter state (deep-linkable, Back-button friendly).
//
// Keyboard (the shared register): ArrowUp/ArrowDown move the active
// option (wrapping) — either arrow OPENS a closed-but-nonempty list
// first; Enter picks the active option while the list is open; Tab moves
// on (the listbox is never a trap); Escape is NOT intercepted — the
// route's calm-no-op contract holds. No autoFocus (lint); the picker
// mounts inertly in the filter row.
import { useMemo } from "react";
import type { CanonicalArticle } from "../content/types";
import { effectiveTitle } from "../ingestion/library/effectiveMetadata";
import {
  useVariantAComboboxState,
  variantAComboboxInputProps,
  variantAListboxId,
} from "./variantACombobox";

export interface ArticlePickerProps {
  /** The whole library (composite fixtures + ingested rows). */
  articles: readonly CanonicalArticle[];
  /** Per-article highlight counts (the ONE snapshot fold). */
  counts: ReadonlyMap<string, number>;
  /** Id for the combobox input — hosts own labeling + the e2e anchors. */
  inputId: string;
  /** Called with the picked article's id. */
  onPick: (articleId: string) => void;
}

/** The suggestion cap (the TagPicker register — search narrows beyond it). */
const MAX_SUGGESTIONS = 8;

interface ArticleOption {
  id: string;
  title: string;
  count: number;
}

export function ArticlePicker({
  articles,
  counts,
  inputId,
  onPick,
}: ArticlePickerProps) {
  const state = useVariantAComboboxState();
  const { draft, open, active, reset, lower } = state;

  const listboxId = variantAListboxId(inputId);

  const options = useMemo((): ArticleOption[] => {
    const byTitle = (a: ArticleOption, b: ArticleOption) =>
      a.title.localeCompare(b.title);
    const withCounts = articles.map((a) => ({
      id: a.id,
      title: effectiveTitle(a),
      count: counts.get(a.id) ?? 0,
    }));
    // Highlighted first (count desc, ties alphabetical); zero-count rows
    // trail alphabetically. The empty-query browse list shows ONLY the
    // highlighted head of that order.
    const highlighted = withCounts
      .filter((o) => o.count > 0)
      .sort((a, b) => b.count - a.count || byTitle(a, b));
    const zero = withCounts.filter((o) => o.count === 0).sort(byTitle);
    if (lower.length === 0) return highlighted.slice(0, MAX_SUGGESTIONS);
    const matches = (o: ArticleOption) => o.title.toLowerCase().includes(lower);
    const highlightedMatches = highlighted.filter(matches);
    const zeroMatches = zero.filter(matches);
    // Decision #72 — zero-highlight articles stay findable BY SEARCH: a
    // matching zero-count row always reserves one slot (the highlighted
    // head fills the rest; with no highlighted match the zero rows take
    // the full cap), so the cap can never silently swallow them.
    const zeroShown = zeroMatches.slice(
      0,
      Math.max(1, MAX_SUGGESTIONS - highlightedMatches.length),
    );
    return [
      ...highlightedMatches.slice(0, MAX_SUGGESTIONS - zeroShown.length),
      ...zeroShown,
    ];
  }, [articles, counts, lower]);

  // The honest no-match line: a non-empty query that matched nothing.
  const showNoMatch = lower.length > 0 && options.length === 0;
  const listOpen = open && (options.length > 0 || showNoMatch);

  function commitPick(option: ArticleOption) {
    onPick(option.id);
    reset();
  }

  const inputProps = variantAComboboxInputProps({
    state,
    inputId,
    rootClassName: ".article-picker",
    optionCount: options.length,
    onEnter: (e) => {
      // Enter NEVER submits a surrounding form while the list is open —
      // it picks the active option. With the list closed the key is
      // untouched (nothing to commit; the route's calm contracts hold).
      if (listOpen) {
        e.preventDefault();
        if (active < options.length) commitPick(options[active]!);
      }
    },
  });

  return (
    <div className="article-picker">
      <div className="article-picker-input-row">
        <input
          {...inputProps}
          className="article-picker-input"
          placeholder="Search articles…"
          aria-expanded={listOpen}
          aria-activedescendant={
            listOpen && active < options.length
              ? `${listboxId}-opt-${active}`
              : undefined
          }
        />
        {listOpen && (
          <ul className="article-picker-suggestions" id={listboxId} role="listbox">
            {options.map((o, i) => (
              <li key={o.id}>
                <div
                  role="option"
                  id={`${listboxId}-opt-${i}`}
                  aria-selected={i === active}
                  className={
                    i === active
                      ? "article-picker-suggestion active"
                      : "article-picker-suggestion"
                  }
                  // mousedown (not click) so the input keeps focus — the
                  // pick must not cost the typing anchor (the TagPicker
                  // rule; harmless here, kept for register symmetry).
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitPick(o);
                  }}
                >
                  <span className="article-picker-suggestion-text">
                    {o.title}
                  </span>
                  <span className="article-picker-count">
                    {o.count} {o.count === 1 ? "highlight" : "highlights"}
                  </span>
                </div>
              </li>
            ))}
            {showNoMatch && (
              <li>
                <div
                  role="option"
                  aria-disabled="true"
                  aria-selected={false}
                  className="article-picker-empty"
                >
                  No articles match “{draft.trim()}”
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
