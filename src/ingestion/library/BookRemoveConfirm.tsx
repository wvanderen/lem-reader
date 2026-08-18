// src/ingestion/library/BookRemoveConfirm.tsx
// Plan 12-05 Task 2 — the book-scoped destructive confirm (D12-01 cascade +
// T-12-12). STRUCTURAL CLONE of src/ingestion/library/RemoveConfirm.tsx
// (Plan 08-04), which is itself a structural clone of WipeConfirm (Phase
// 02-02) — same focus-trap + showModal + focus-restore + close-listener
// discipline (Pitfall 1) and the same data-initial-focus on the CANCEL
// button (Pitfall 8 — safer non-destructive default; an accidental Enter
// cannot remove a book). Two dialogs, two call sites, NO shared
// ConfirmDialog: abstracting would re-introduce the single-call-site risk
// the destructive-confirm pattern exists to eliminate (the 08-04 decision).
//
// CRITICAL — Pitfall 8 (T-12-12): the cascade `booksStore.removeBook(id)`
// runs ONLY inside the destructive button's onClick handler in THIS file —
// the SOLE executable removeBook call site in the codebase. Never in a
// catch block, never in an effect, never automatically. LibraryView routes
// `bookRemoveTarget !== null` to this dialog (open); the actual cascade
// fires only when the reader clicks "Remove book" below.
//
// NOTE on class names: the dialog uses its OWN .book-remove-confirm* hooks
// (NOT the shared .library-remove-confirm class) so e2e dialog locators
// stay strict-mode-unique — both dialogs mount simultaneously in
// LibraryView, and a shared class would make `dialog.library-remove-confirm`
// match two elements. Same discipline as ImportPreviewDialog (09-05).
//
// Cascade behavior (D12-01 + the plan's cascade truth): removes the Book
// row + every chapter article + every highlight + every note + every
// location row keyed to any chapter, in ONE Dexie transaction
// (booksStore.removeBook, Plan 12-03). The body copy names the consequence
// with the chapter count ("Its {N} chapters and their highlights will be
// removed.") per UI-SPEC §Copywriting — D7-04 calm voice; zero jargon.
import { useEffect, useRef } from "react";
import { removeBook } from "../../persistence/booksStore";

interface BookRemoveConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The book id to cascade-remove on confirm. */
  bookId: string;
  /** The book title — named in the body copy so the consequence is unambiguous. */
  bookTitle: string;
  /** The chapter count — named in the body copy (chapterArticleIds.length). */
  chapterCount: number;
  /** Invoked by the destructive button AFTER the cascade resolves. */
  onConfirm: () => void;
  /** Invoked by the cancel button (or Esc / scrim). */
  onCancel: () => void;
}

export function BookRemoveConfirm({
  open,
  bookId,
  bookTitle,
  chapterCount,
  onConfirm,
  onCancel,
}: BookRemoveConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — same discipline as WipeConfirm + RemoveConfirm).
  const triggerRef = useRef<HTMLElement | null>(null);

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + WebKit quirk): explicitly
      // focus the [data-initial-focus] element so the focus trap and the
      // initial reading position are predictable in WebKit. The CANCEL
      // button carries the marker — focusing the destructive action by
      // default would risk an accidental Enter removing the book and its
      // every highlight. The reader must move focus to "Remove book"
      // deliberately.
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
  }, [open]);

  // Register the `close` event listener (with cleanup). Restore focus to the
  // captured trigger (Pitfall 1). Esc-originated closes route through
  // onCancel via the cancel event (below) BEFORE the close lands — the
  // 09-06 openRef discipline: every close path resets the LibraryView state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    const handleCancel = (e: Event) => {
      // Esc on an open <dialog> fires `cancel` then `close`. Route the
      // Esc-originated close through onCancel so the open-prop mirror resets
      // (otherwise a stale open=true would wedge the dialog shut on reopen).
      e.preventDefault();
      onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleCancel);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleCancel);
    };
  }, [onCancel]);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for `booksStore.removeBook` in the codebase. It lives
  // in the destructive button's onClick — never in a catch block or effect.
  // The reader must click "Remove book" to fire this; nothing else triggers
  // it. ONE Dexie transaction: book + chapters + highlights + notes +
  // locations all go or none do (booksStore.removeBook).
  const onDestructiveClick = async () => {
    try {
      await removeBook(bookId); // cascade: book + chapters + highlights + notes + locations
    } catch {
      // Even the destructive path defends itself: if the cascade throws, we
      // still close the dialog so the reader isn't stuck. The LibraryView
      // refresh will reveal the book is still present; the reader can retry.
      // (No remove retry here — the reader explicitly consented ONCE.)
    }
    onConfirm();
  };

  return (
    <dialog
      ref={ref}
      className="book-remove-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="book-remove-title"
      aria-describedby="book-remove-body"
    >
      <div className="book-remove-confirm-inner">
        <h2 id="book-remove-title">Remove book</h2>
        <p id="book-remove-body">
          Remove {bookTitle}? Its {chapterCount}{" "}
          {chapterCount === 1 ? "chapter" : "chapters"} and their highlights
          will be removed.
        </p>
        <div className="book-remove-confirm-actions">
          {/* Destructive action — Pitfall 8: booksStore.removeBook fires
              ONLY in onDestructiveClick above. The label names the outcome
              unambiguously (UI-SPEC §Copywriting). */}
          <button
            type="button"
            className="book-remove-destructive"
            onClick={onDestructiveClick}
          >
            Remove book
          </button>
          {/* Cancel — names the actual outcome: the reader keeps the book
              and its chapters. Carries [data-initial-focus] so the explicit
              focus call lands here on open (NOT on the destructive button —
              safer default per Pitfall 8). */}
          <button
            type="button"
            className="book-remove-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Keep book
          </button>
        </div>
      </div>
    </dialog>
  );
}
