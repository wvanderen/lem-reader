// src/ui/TagPicker.tsx
// Issue #75 (decision #71) — the ONE shared tag picker: variant A refined,
// validated live on prototype/tagging-issue-71. One mental model on every
// host surface (library-row popover, Add dialog, the reader's TagEntry):
//
//   - Type-to-filter combobox over existing tags, MOST-USED order (the
//     count-desc fold in tagsStore.deriveTagStats; ties alphabetical).
//     Counts never render — they order only (Q6).
//   - Case-insensitive matching ROUTES to the existing tag's stored casing
//     (typing "ESSAYS" selects "essays"; Q7) — storage stays exact-match,
//     no migration. The same routing runs against the current selection,
//     so a near-case duplicate toggles OFF instead of stacking a twin.
//   - Create-new inline: a typed draft with no case-insensitive match
//     offers an explicit "Add …" option at the end of the list (click or
//     Enter); toggling a selected tag removes it.
//   - Selected tags as PILL CHIPS with the × inside, rendered BELOW the
//     input: adding the first tag never shifts the typing anchor. The pill
//     register rides the foundation vocabulary (--radius-pill; the × rides
//     the shared .tag-chip-remove anatomy — the .review-scope-chip
//     precedent from issue #76).
//
// Keyboard: ArrowUp/ArrowDown move the active option (wrapping) — either
// arrow OPENS a closed-but-nonempty list first, so both pick paths work
// from a bare focus (the issue #75 review's ArrowUp-asymmetry fix) — Enter
// picks, Tab moves on (the listbox is never a trap), Escape is NOT
// intercepted — the host popover/dialog owns dismissal. Focus management
// is the house explicit pattern: an explicitly-opened popover may move
// focus via focusOnMount, but the picker NEVER focuses itself on mount
// (the reader's TagEntry is inert at ArticleView mount — Pitfall 8-5; the
// React autoFocus prop is banned by lint).
import { useEffect, useMemo, useRef, useState } from "react";
import type { TagStat } from "../ingestion/library/tagsStore";
import { sameTag } from "../ingestion/library/tagText";

export interface TagPickerProps {
  /** The existing tags with usage counts (most-used first). */
  stats: TagStat[];
  /** The current selection (exact stored casings). */
  selected: string[];
  /** Called with the next selection after every pick/remove. */
  onChange: (next: string[]) => void;
  /** Id for the combobox input — hosts own labeling + the e2e anchors. */
  inputId: string;
  /**
   * Explicit focus hand-off for hosts that OPEN the picker (the row-tags
   * popover). Hosts that mount the picker inertly (the reader's TagEntry —
   * Pitfall 8-5) must leave it false/absent.
   */
  focusOnMount?: boolean;
}

function findExisting(stats: TagStat[], text: string): TagStat | undefined {
  const trimmed = text.trim();
  return stats.find((s) => sameTag(s.tag, trimmed));
}

/**
 * toggleTag — Q7A routing: a near-case duplicate resolves to the existing
 * tag's stored casing (stats first, then the selection itself — a tag
 * created this session may not be in a stale stats read yet); otherwise
 * the trimmed text joins. Toggling an already-selected tag removes it.
 * (The tagsStore write seams re-route against the persisted universe, so a
 * commit that raced a stale stats read still cannot stack a case twin.)
 */
function toggleTag(
  selected: string[],
  stats: TagStat[],
  text: string,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return selected;
  const existing =
    findExisting(stats, trimmed)?.tag ??
    selected.find((t) => sameTag(t, trimmed));
  return selected.includes(existing ?? trimmed)
    ? selected.filter((t) => t !== existing)
    : [...selected, existing ?? trimmed];
}

export function TagPicker({
  stats,
  selected,
  onChange,
  inputId,
  focusOnMount = false,
}: TagPickerProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Explicit focus management (the house dialog pattern — an
  // explicitly-opened popover may move focus). No autoFocus prop (lint).
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const listboxId = `${inputId}-listbox`;
  const createOptionId = `${listboxId}-create`;

  const lower = draft.trim().toLowerCase();
  const exactExists = lower.length > 0 && findExisting(stats, draft) !== undefined;
  const list = useMemo(
    () =>
      stats
        .filter(
          (s) =>
            // Already-selected tags (any casing) never re-appear as
            // suggestions — picking them again would only remove them.
            !selected.some((t) => sameTag(t, s.tag)) &&
            (lower.length === 0 || s.tag.toLowerCase().includes(lower)),
        )
        .slice(0, 8),
    [stats, selected, lower],
  );
  // The inline create option exists only for a non-empty draft with no
  // case-insensitive exact match (the "no match" branch of Q7A).
  const showCreate = lower.length > 0 && !exactExists;
  const optionCount = list.length + (showCreate ? 1 : 0);
  const listOpen = open && optionCount > 0;

  function commitPick(text: string) {
    onChange(toggleTag(selected, stats, text));
    setDraft("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && optionCount > 0) {
      e.preventDefault();
      // Either arrow opens a closed-but-nonempty list — ArrowUp must not
      // mutate `active` invisibly with Enter then committing nothing.
      setOpen(true);
      setActive((a) =>
        e.key === "ArrowDown"
          ? (a + 1) % optionCount
          : (a - 1 + optionCount) % optionCount,
      );
    } else if (e.key === "Enter") {
      // Enter NEVER submits a surrounding form (the Add dialog's prevented
      // submits tolerate this; the explicit preventDefault keeps it true).
      e.preventDefault();
      if (listOpen) {
        if (active < list.length) commitPick(list[active]!.tag);
        else commitPick(draft);
      } else if (lower.length > 0) {
        commitPick(draft);
      }
    }
  }

  return (
    <div className="tag-picker">
      <div className="tag-picker-input-row">
        <input
          ref={inputRef}
          id={inputId}
          className="tag-picker-input"
          type="text"
          placeholder="Add or search a tag…"
          value={draft}
          autoComplete="off"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            listOpen
              ? active < list.length
                ? `${listboxId}-opt-${active}`
                : createOptionId
              : undefined
          }
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            // Focus opens the browse list: with an empty draft it shows the
            // most-used tags as-is — the click-to-pick path (the reader can
            // tag without typing at all). The blur handler closes it again.
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (
              !e.currentTarget.closest(".tag-picker")?.contains(e.relatedTarget as Node | null)
            ) {
              setOpen(false);
            }
          }}
        />
        {listOpen && (
          <ul className="tag-picker-suggestions" id={listboxId} role="listbox">
            {list.map((s, i) => (
              <li key={s.tag}>
                <div
                  role="option"
                  id={`${listboxId}-opt-${i}`}
                  aria-selected={i === active}
                  className={
                    i === active ? "tag-picker-suggestion active" : "tag-picker-suggestion"
                  }
                  // mousedown (not click) so the input keeps focus — the
                  // pick must not cost the typing anchor.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitPick(s.tag);
                  }}
                >
                  {s.tag}
                </div>
              </li>
            ))}
            {showCreate && (
              <li>
                <div
                  role="option"
                  id={createOptionId}
                  aria-selected={active === list.length}
                  className={
                    active === list.length
                      ? "tag-picker-suggestion tag-picker-create active"
                      : "tag-picker-suggestion tag-picker-create"
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitPick(draft);
                  }}
                >
                  Add “{draft.trim()}”
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
      {/* Chips sit BELOW the input: entering the first tag never shifts the
          field (the reader's typing anchor stays put — the validated
          variant-A anatomy). */}
      {selected.length > 0 && (
        <ul className="tag-picker-chips">
          {selected.map((name) => (
            <li key={name}>
              <span className="tag-picker-pill">
                <span className="tag-picker-pill-text">{name}</span>
                <button
                  type="button"
                  className="tag-chip-remove tag-picker-pill-remove"
                  aria-label={`Remove tag ${name}`}
                  onClick={() => onChange(selected.filter((t) => t !== name))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
