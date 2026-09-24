// src/ingestion/library/RowTagsPopover.tsx
// Issue #75 (decision #71) — the row-tags popover: ONE shared surface for
// every library row's tag-glyph trigger. A native popover="auto" panel
// (top layer, free light-dismiss + Esc — the .tag-popover discipline from
// Plan 13-10) anchored to the OPEN row's trigger button through CSS anchor
// positioning (D21-05 precedent; probe-verified on all three pinned
// engines). The trigger carries `anchor-name: --row-tags-<id>`
// (LibraryRow.rowTagsAnchorName); this panel reads it through the
// --row-tags-anchor custom property so the geometry stays in CSS.
//
// Commit discipline: every picker change writes through setArticleTags
// immediately (fire-and-forget — no lost edits on light-dismiss), while
// the LibraryView-level invalidation waits for CLOSE (one reload per
// editing session, not per toggle; the list behind the popover refreshes
// once). Dexie write failures land in the calm .status live region
// (TagEntry's A11Y-08 voice), never thrown.
//
// Focus: the trigger's focus is captured at open and restored at close —
// but ONLY when focus currently sits inside the panel (Esc / light-dismiss
// / Done). The programmatic close path (target → null) leaves focus where
// the interaction left it. focusOnMount hands focus to the picker input:
// the popover was EXPLICITLY opened, so the Pitfall 8-5 inert-at-mount rule
// does not apply (that rule governs ArticleView's page mount, and the
// reader's TagEntry host keeps it).
import { useEffect, useRef, useState } from "react";
import type { TagStat } from "./tagsStore";
import { setArticleTags } from "./tagsStore";
import { TagPicker } from "../../ui/TagPicker";

export interface RowTagsTarget {
  /** The article whose tags are being edited. */
  id: string;
  /** The EFFECTIVE title (D17-09) — names the dialog + the Done reset. */
  title: string;
  /** The row's current tags (exact stored casings). */
  tags: string[];
  /** The trigger's anchor-name (rowTagsAnchorName). */
  anchor: string;
}

export interface RowTagsPopoverProps {
  /** Non-null ⇒ the popover shows anchored to that row's trigger. */
  target: RowTagsTarget | null;
  /** Suggestion stats (the ONE deriveTagStats fold, snapshot-fed). */
  stats: TagStat[];
  /**
   * Close request from ANY dismissal (Esc, light-dismiss, Done, the
   * programmatic target flip). LibraryView clears the target and
   * invalidates the snapshot here — ONE reload per editing session.
   */
  onClose: () => void;
}

export function RowTagsPopover({ target, stats, onClose }: RowTagsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);

  // Open/close seam — the ArticleView tagsOpen pattern (idempotent twin
  // runs; the toggle-event close routes back through onClose).
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    if (target && !el.matches(":popover-open")) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setDraft(target.tags);
      setErrorCopy(null);
      el.showPopover();
    } else if (!target && el.matches(":popover-open")) {
      el.hidePopover();
    }
  }, [target]);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const handleToggle = (e: Event) => {
      const next = (e as ToggleEvent).newState === "open";
      if (next) return;
      // Close (user dismissal OR the programmatic flip). Restore focus to
      // the trigger only when the panel held it; then route through onClose
      // (idempotent — LibraryView clears an already-cleared target).
      if (el.contains(document.activeElement)) triggerRef.current?.focus();
      onClose();
    };
    el.addEventListener("toggle", handleToggle);
    return () => el.removeEventListener("toggle", handleToggle);
  }, [onClose]);

  function handleChange(next: string[]) {
    if (!target) return;
    setDraft(next);
    setErrorCopy(null);
    setArticleTags(target.id, next).catch(() => {
      // The row stays unchanged on disk; the draft may diverge until the
      // next snapshot reload. Calm voice (D7-04).
      setErrorCopy("Couldn't save tag.");
    });
  }

  return (
    <div
      ref={popoverRef}
      popover="auto"
      role="dialog"
      aria-label={target ? `Tags for ${target.title}` : "Tags"}
      className="row-tags-popover"
      style={{ "--row-tags-anchor": target?.anchor } as React.CSSProperties}
    >
      {target && (
        <>
          <label htmlFor={`row-tags-${target.id}`} className="visually-hidden">
            Add or search a tag
          </label>
          <TagPicker
            stats={stats}
            selected={draft}
            onChange={handleChange}
            inputId={`row-tags-${target.id}`}
            focusOnMount
          />
          <div className="row-tags-footer">
            {errorCopy !== null && (
              <div className="status" role="status" aria-live="polite" aria-atomic="true">
                <p>{errorCopy}</p>
              </div>
            )}
            <button type="button" className="btn btn-quiet row-tags-done" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
