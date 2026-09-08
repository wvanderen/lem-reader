// src/ingestion/library/EditMetadataDialog.tsx
// Plan 17-02 Task 2 — EditMetadataDialog (D17-01, D17-02, D17-03, D17-04,
// D17-08, META-01/META-03). Native <dialog> hosting the reader-owned title/
// author override write. STRUCTURAL CLONE of RemoveConfirm.tsx (the shipped
// dialog grammar) + AddDialog.tsx (labeled inputs, prevented-submit forms,
// in-flight guard) per Pitfall 8 — NO shared dialog abstraction, NO shared
// metadata-write service.
//
// Five-part dialog grammar (cloned verbatim from RemoveConfirm/AddDialog):
//   1. useEffect open↔showModal/close sync with idempotent guards
//   2. triggerRef captures document.activeElement on open; the `close`
//      listener restores it (Pitfall 1)
//   3. Explicit .focus() on [data-initial-focus] after showModal (WebKit
//      does not auto-focus modal-dialog controls)
//   4. Esc routed through the parent's onCancel: `cancel` preventDefault +
//      the live submittingRef mirror decides (the 09-05 wedge lesson /
//      16-02 double-submit guard) — no dismissal while the put is in flight
//   5. data-initial-focus on the NON-destructive control (Cancel, not Save)
//
// CRITICAL — Pitfall 8 (single write site): the ONLY override write (the
// Dexie articles-table put) lives in the Save handler in THIS file. Never
// in a catch block, never in an effect, never a shared write service.
//
// The pinned title-validity rule (OQ4 / D17-04): a blank title plus Save is
// INVALID. Save is disabled while the title is blank after trim AND
// titleReset is false, with the calm inline explanation. Reset title is the
// ONE explicit clear affordance — it re-enables Save with an empty field so
// the save OMITS the readerTitle key (whole-row put deletes it — META-03).
// Never persist a blank override: min(1) at the schema boundary would drop
// the ENTIRE row on the next safeParse read (Pitfall 2 row-poison).
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CanonicalArticle } from "../../content/types";
import { db } from "../../persistence/db";

interface EditMetadataDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The article whose metadata is being edited (null while closed). */
  article: CanonicalArticle | null;
  /** Invoked after the override put resolves. */
  onSaved: () => void;
  /** Invoked by the cancel button (or Esc). */
  onCancel: () => void;
}

export function EditMetadataDialog({
  open,
  article,
  onSaved,
  onCancel,
}: EditMetadataDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element (the row's edit button) on open
  // so the close handler can restore focus (Pitfall 1).
  const triggerRef = useRef<HTMLElement | null>(null);

  // ── Field state (D17-03/D17-04) ─────────────────────────────────────────
  // titleValue seeds from the existing override (or empty — the canonical
  // value is visible ONLY as the placeholder, display-only, never
  // persisted). An empty author field IS the no-override state; only the
  // title needs the explicit titleReset flag (empty title + no Reset is the
  // one invalid combination).
  const [titleValue, setTitleValue] = useState("");
  const [authorValue, setAuthorValue] = useState("");
  const [titleReset, setTitleReset] = useState(false);
  const [saving, setSaving] = useState(false);
  // Live mirror rewritten EVERY render (the AddDialog L110-116 discipline):
  // the long-lived `cancel` listener below must read the CURRENT saving
  // state, not a stale closure capture.
  const submittingRef = useRef(false);
  submittingRef.current = saving;

  // The pinned validity rule: a blank title cannot be saved UNLESS Reset
  // title was pressed (the explicit clear affordance).
  const saveBlocked = titleValue.trim().length === 0 && !titleReset;

  // ── Dialog shell — RemoveConfirm clone + the AddDialog D16-08 reset ────
  // Sync the `open` prop with the underlying <dialog> state (idempotent
  // guards). On EVERY false→true transition the field state RESETS from
  // the captured article's current override state — a prior canceled edit
  // never leaks into the next one, and a fresh open after a save shows the
  // persisted override.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus trap, inert backdrop, Esc fires cancel
      // Fresh field state from the article's CURRENT override state.
      setTitleValue(article?.readerTitle ?? "");
      setAuthorValue(article?.readerAuthor ?? "");
      setTitleReset(false);
      setSaving(false);
      // Cross-engine focus management (Pitfall 1 + WebKit quirk — the
      // 02-01 lesson): explicitly focus [data-initial-focus] — the Cancel
      // button (the non-destructive control; an accidental Enter must not
      // commit a write).
      const initial =
        dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ??
        dlg;
      initial.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open transition only; `article` is read solely for the fresh-open reset
  }, [open]);

  // Register the `close` + `cancel` listeners (with cleanup) — the
  // RemoveConfirm focus-restore clone + the AddDialog D16-10 in-flight gate.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      // Pitfall 1: restore focus to the captured trigger (the row's edit
      // button).
      triggerRef.current?.focus();
    };
    const handleDialogCancel = (e: Event) => {
      // Esc on an open <dialog> fires `cancel` then `close`. ALWAYS
      // preventDefault so the browser never closes the dialog itself —
      // the React open-prop mirror owns every close path (the 09-06
      // wedge lesson).
      e.preventDefault();
      // D16-10 discipline: no dismissal while the put is in flight. The
      // live submittingRef mirror (not a stale closure) decides — stay
      // open, no state churn, no "did it save?" ambiguity.
      if (submittingRef.current) return;
      onCancel();
    };
    // A click whose target IS the dialog element itself is the dimmed
    // ::backdrop (padding: 0 + the .edit-metadata-inner wrapper mean the
    // dialog border box == the visible card, so clicks on visible content
    // always target descendants). Route it through the SAME onCancel path
    // as the Cancel button / Esc (the open-prop mirror owns every close —
    // never dlg.close() here). The D16-10 in-flight gate extends to the
    // scrim: the live submittingRef mirror decides, so an in-flight save
    // ignores the click. No preventDefault — that is the cancel event's
    // Esc-specific browser guard.
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target !== dlg) return;
      if (submittingRef.current) return;
      onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleDialogCancel);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleDialogCancel);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onCancel]);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY override write site (the Dexie articles-table put) for
  // reader-owned overrides. It fires
  // ONLY from the prevented-submit form's Save path — never in a catch
  // block or effect. The row is a spread of the captured article plus
  // conditionally-spread override keys present ONLY when the trimmed input
  // is non-empty: a whole-row put replaces the stored row, so omitting a
  // key deletes it (META-03 — never assign an empty-string value to an
  // override key; min(1) would drop the entire row on the next safeParse
  // read). Provenance, id, revision, and blocks are carried untouched by
  // the spread (META-01).
  async function handleSave() {
    if (!article || saving) return;
    const trimmedTitle = titleValue.trim();
    const trimmedAuthor = authorValue.trim();
    if (trimmedTitle.length === 0 && !titleReset) return; // blank-and-not-reset: the disabled rule, defensively
    setSaving(true);
    try {
      // Rule 1 fix: the captured article may ALREADY carry override keys
      // (this dialog reopens on overridden rows) — destructure them OUT of
      // the base spread first, or `...article` would re-carry them and the
      // conditional spreads below could never omit a cleared field. Only
      // the freshly-trimmed values re-enter the row.
      const {
        readerTitle: _previousTitle,
        readerAuthor: _previousAuthor,
        ...base
      } = article;
      const row = {
        ...base,
        ...(trimmedTitle ? { readerTitle: trimmedTitle } : {}),
        ...(trimmedAuthor ? { readerAuthor: trimmedAuthor } : {}),
      };
      await db.articles.put(row);
    } catch {
      // Even the save path defends itself: if the put throws, close calmly
      // (the RemoveConfirm discipline) — the parent's refreshKey
      // re-derivation shows the unchanged row; the reader can retry.
    }
    onSaved();
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    // ONE prevented-submit form — never a method-dialog form (the 02-01
    // Chromium focus-trap lesson).
    e.preventDefault();
    if (saving || saveBlocked) return;
    void handleSave();
  }

  function handleTitleChange(value: string) {
    setTitleValue(value);
    setTitleReset(false); // any title input change un-flags Reset
  }

  return (
    <dialog
      ref={ref}
      className="edit-metadata"
      aria-labelledby="edit-metadata-heading"
    >
      <div className="edit-metadata-inner">
        <h2 id="edit-metadata-heading">Edit title and author</h2>
        <form onSubmit={handleFormSubmit} className="edit-metadata-form">
          {/* Title field — placeholder carries the CANONICAL title
              (D17-03/D17-08: the canonical value is visible ONLY here,
              display-only, never persisted). */}
          <div className="edit-metadata-field">
            <label htmlFor="edit-metadata-title">Title</label>
            <input
              id="edit-metadata-title"
              name="title"
              type="text"
              autoComplete="off"
              placeholder={article?.provenance.title ?? ""}
              value={titleValue}
              disabled={saving}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
            {/* Reset title — the ONE explicit clear affordance (OQ4). Sets
                the field empty AND flags titleReset so Save stays enabled:
                the save then omits readerTitle and the canonical title
                returns. */}
            <button
              type="button"
              className="edit-metadata-reset"
              disabled={saving}
              onClick={() => {
                setTitleValue("");
                setTitleReset(true);
              }}
            >
              Reset title
            </button>
          </div>
          {/* Author field — placeholder carries the canonical author, or
              "No author" when canonical is absent (D17-03/D17-08). An empty
              author field IS the no-override state (D17-04) — Reset author
              just empties the field; no flag needed. */}
          <div className="edit-metadata-field">
            <label htmlFor="edit-metadata-author">Author</label>
            <input
              id="edit-metadata-author"
              name="author"
              type="text"
              autoComplete="off"
              placeholder={article?.provenance.author ?? "No author"}
              value={authorValue}
              disabled={saving}
              onChange={(e) => setAuthorValue(e.target.value)}
            />
            <button
              type="button"
              className="edit-metadata-reset"
              disabled={saving}
              onClick={() => setAuthorValue("")}
            >
              Reset author
            </button>
          </div>
          {/* Calm inline explanation — visible exactly while Save is
              blocked by the blank-and-not-reset rule (D17-04). */}
          {saveBlocked && (
            <p className="edit-metadata-hint">
              Type a title, or choose Reset to keep the original.
            </p>
          )}
          <div className="edit-metadata-actions">
            <button
              type="submit"
              className="edit-metadata-save"
              disabled={saveBlocked || saving}
            >
              Save
            </button>
            {/* Cancel — carries [data-initial-focus] so the explicit focus
                call lands here on open (NOT on Save — the non-destructive
                default; an accidental Enter cannot commit a write). */}
            <button
              type="button"
              className="edit-metadata-cancel"
              onClick={onCancel}
              data-initial-focus
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
