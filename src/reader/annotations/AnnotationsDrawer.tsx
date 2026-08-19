// src/reader/annotations/AnnotationsDrawer.tsx
// Phase 5 Plan 05-03 — native `<dialog>` slide-over list of highlights + notes
// in reading order (D5-09, ANNO-03/04).
//
// Reuses the D2-01 native <dialog>/showModal pattern from SettingsPanel VERBATIM
// (Pitfall 1 — capture activeElement on open, triggerRef.current?.focus() on
// close; explicit focus on first control after showModal for WebKit). Sibling
// of .settings-panel — same sheet geometry (near-full-width <640px; ~400px
// ≥640px; ::backdrop covers the article; free focus-trap + Esc + inert backdrop).
//
// Contents (UI-SPEC §Interaction 30): header row (title + × close) + body. The
// body is an `<ol>` of entries in reading order (grapheme start offset ascending
// — D5-09 canonical order, no sort/filter for MVP) OR the empty-state card.
// Each entry is a `<button class="drawer-entry">` (whole-row jump affordance —
// A11Y-07) with sibling Edit note / Delete text buttons OUTSIDE the jump button
// so they don't trigger navigation.
//
// Ambiguous/orphan entries (D5-04): jump button disabled (never navigates —
// ANNO-07); a visually-hidden note in the aria-label explains why. Edit disabled;
// Delete stays enabled.
//
// Reduced motion (A11Y-06): the drawer appears/disappears as an instant
// show/hide (the global prefers-reduced-motion gate disables the slide). No
// transition/animation property on any drawer selector.
//
// Pitfall 8: excerpts + notes render as React text children. NEVER raw HTML.
import { useEffect, useRef } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";

/** Truncation limits for drawer entries (UI-SPEC §Interaction 30). */
const EXCERPT_MAX_CHARS = 120;
const NOTE_MAX_CHARS = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\u2026";
}

export interface AnnotationsDrawerProps {
  /** Whether the drawer is open (controlled by App, same pattern as SettingsPanel). */
  open: boolean;
  /** Close the drawer (App's setter — called on Esc / scrim / × / navigate-back). */
  onClose: () => void;
  /**
   * D5-11 navigate-back: invoked when the reader taps a RESOLVED entry's jump
   * button. ArticleView implements the offset → block → page/scroll → focus
   * pipeline (D4-10/D4-11 anchor machinery in reverse).
   */
  onNavigate: (highlightId: string) => void;
  /**
   * Open the inline note popover on a highlight (after navigate-back for Edit
   * note, or directly for the popover's own Delete confirm).
   */
  onEditNote: (highlightId: string) => void;
  /**
   * Plan 13-10 (G5): export this article's highlights — the per-article
   * PORT-03 action relocated INTO the drawer (highlight-scoped action in the
   * highlight-scoped surface). ArticleView owns the handler + the
   * visually-hidden announcement region; only the trigger moved.
   */
  onExportHighlights: () => void;
  /**
   * Plan 13-10 (G5): true while a download is in flight — disables the
   * export button (the ArticleView state, threaded in).
   */
  exportingHighlights: boolean;
}

export function AnnotationsDrawer({
  open,
  onClose,
  onNavigate,
  onEditNote,
  onExportHighlights,
  exportingHighlights,
}: AnnotationsDrawerProps): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the trigger (the annotations-trigger button in the header) on open
  // so the close listener can restore focus (Pitfall 1 — same discipline as
  // SettingsPanel).
  const triggerRef = useRef<HTMLElement | null>(null);

  const { highlights } = useHighlightOverlay();

  // Sort by reading order: grapheme start offset ascending (D5-09 canonical
  // order). Ambiguous/orphan entries use the stored hint position; confident
  // entries use the resolved position. Falls back to a large offset so
  // unresolved entries appear at the end if their position is null.
  const sorted = [...highlights].sort((a, b) => {
    const aStart = a.resolvedPosition?.start ?? a.record.position.start ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.resolvedPosition?.start ?? b.record.position.start ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });

  // Sync the `open` prop with the underlying <dialog> state (VERBATIM from
  // SettingsPanel L42-79 — Pitfall 1 + WebKit quirk).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal();
      // Explicit focus on first focusable control (WebKit quirk — does not
      // auto-focus modal-dialog controls).
      const first =
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ?? dlg;
      first.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Register the `close` event listener (with cleanup). Restore focus to the
  // captured trigger (Pitfall 1).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      onClose();
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  const countFormatter = new Intl.NumberFormat(navigator.language);

  return (
    <dialog
      ref={ref}
      className="annotations-drawer"
      aria-labelledby="annotations-drawer-title"
    >
      <div className="annotations-drawer-inner">
        <div className="annotations-drawer-header">
          <h2 id="annotations-drawer-title">
            Highlights and notes
            {sorted.length > 0 && (
              <span className="annotations-drawer-count">
                {countFormatter.format(sorted.length)}
              </span>
            )}
          </h2>
          {/* Plan 13-10 (G5) — the relocated per-article Export button
              (09-05 D9-06/PORT-03). Reuses the generic .article-export-
              highlights quiet-button tokens; .annotations-drawer-export is
              the drawer-scoped hook. Disabled while a download is in
              flight; the result announces through ArticleView's
              visually-hidden live region (the handler stays there). */}
          <button
            type="button"
            className="article-export-highlights annotations-drawer-export"
            onClick={onExportHighlights}
            disabled={exportingHighlights}
          >
            Export highlights
          </button>
          <button
            type="button"
            className="annotations-drawer-close"
            aria-label="Close highlights and notes"
            onClick={onClose}
          >
            <CloseIcon aria-hidden="true" />
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="status drawer-empty" role="status">
            <h3>No highlights yet</h3>
            <p>
              Select any text in the article to highlight it. You can add a note
              to any highlight, and come back here to find them.
            </p>
          </div>
        ) : (
          <ol className="drawer-list">
            {sorted.map((h) => {
              const excerpt = h.record.quote.exact;
              const noteText = h.note?.text ?? "";
              const isUnresolved = h.status === "ambiguous" || h.status === "orphan";
              const flagText =
                h.status === "ambiguous"
                  ? "Couldn't find a unique match"
                  : h.status === "orphan"
                    ? "Couldn't relocate this highlight"
                    : null;
              // D5-04 explanatory body under the flag (UI-SPEC §Interaction
              // 30). Ambiguous: the passage may have changed; the reader can
              // still read the excerpt below or delete the highlight. Orphan
              // shares the same body — the flag text already distinguishes
              // the kind. Edit is disabled because the underlying anchor is
              // uncertain; Delete stays enabled (D5-04 — "delete is always
              // available").
              const unresolvedBody = isUnresolved
                ? "The passage may have changed. You can still read the highlighted text below or delete this highlight."
                : null;

              // Build the aria-label for the jump button (UI-SPEC §Copywriting).
              const ariaLabel = isUnresolved
                ? `Go to highlight: ${truncate(excerpt, 60)}. This highlight can't be located, so jumping is disabled.`
                : `Go to highlight: ${truncate(excerpt, 60)}${noteText ? `; ${truncate(noteText, 60)}` : ""}`;

              return (
                <li key={h.record.id}>
                  <button
                    type="button"
                    className="drawer-entry"
                    aria-label={ariaLabel}
                    disabled={isUnresolved}
                    onClick={() => {
                      if (!isUnresolved) {
                        onNavigate(h.record.id);
                      }
                    }}
                  >
                    <span className="drawer-entry-excerpt">
                      {truncate(excerpt, EXCERPT_MAX_CHARS)}
                    </span>
                    {flagText && (
                      <span className="drawer-entry-flag">{flagText}</span>
                    )}
                    {unresolvedBody && (
                      <span className="drawer-entry-body">{unresolvedBody}</span>
                    )}
                    {!flagText && noteText.length > 0 && (
                      <span className="drawer-entry-note">
                        {truncate(noteText, NOTE_MAX_CHARS)}
                      </span>
                    )}
                  </button>
                  <span className="drawer-entry-actions">
                    <button
                      type="button"
                      className="drawer-entry-action"
                      onClick={() => onEditNote(h.record.id)}
                      disabled={isUnresolved}
                    >
                      Edit note
                    </button>
                    <button
                      type="button"
                      className="drawer-entry-action"
                      onClick={() => onEditNote(h.record.id)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </dialog>
  );
}

function CloseIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
