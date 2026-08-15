// src/reader/ImportPreviewDialog.tsx
// Plan 09-05 — ImportPreviewDialog (D9-11, PORT-02). Native <dialog>/
// alertdialog that shows the D9-11 dry-run preview (counts, conflicts by
// kind, honest ambiguous/orphan/fixture warnings) and collects the D9-14
// bulk per-kind overrides + the D9-12 "apply imported reading preferences"
// choice before the single destructive bulk write.
//
// STRUCTURAL CLONE of src/ingestion/library/RemoveConfirm.tsx (itself a
// clone of src/reader/WipeConfirm.tsx) — NOT a shared dialog component
// (Pitfall 8 isolation: each destructive call site lives ONLY in its own
// button's onClick; abstracting into a shared dialog would re-introduce the
// single-call-site risk). The clone discipline preserved verbatim:
//   - useEffect syncs the `open` prop with showModal()/close().
//   - Capture document.activeElement on open; restore focus in the `close`
//     listener (Pitfall 1 — showModal does not auto-restore).
//   - Explicit .focus() on [data-initial-focus] after showModal (WebKit
//     quirk — predictable focus trap + initial reading position).
//   - [data-initial-focus] on the NON-destructive "Cancel import" button.
//
// CRITICAL — Pitfall 8 (T-9-16): `onProceed` — which the parent (Settings
// Panel) wires to resolveImportPlan + applyImport — fires ONLY inside the
// Import button's onClick handler in THIS file. Never in a catch block,
// never in an effect, never in the file-pick handler. The reader must click
// "Import" to cross the destructive-write trust boundary.
import { useEffect, useRef, useState } from "react";
import type {
  ConflictKind,
  ImportPreviewData,
  Overrides,
  PerKindOverride,
} from "../portability/conflicts";

interface ImportPreviewDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The detectImportPreview result rendered in the body. Null when closed. */
  preview: ImportPreviewData | null;
  /**
   * Invoked by the Import button with the collected bulk per-kind overrides
   * and the preferences choice. The parent owns resolveImportPlan +
   * applyImport (the atomic write).
   */
  onProceed: (overrides: Overrides, applyPreferences: boolean) => void;
  /** Invoked by the cancel button (or Esc / scrim). Nothing is written. */
  onCancel: () => void;
}

/** Skip is the default override for EVERY kind (D9-14 skip-by-default). */
const DEFAULT_OVERRIDES: Overrides = {
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
};

/** Calm plain-word kind labels for the D9-14 conflict table (DOC-06 voice,
 * zero jargon). `one`/`other` forms keep count agreement honest. */
const KIND_LABELS: Record<ConflictKind, { one: string; other: string }> = {
  "article-revision": {
    one: "article with a different version",
    other: "articles with a different version",
  },
  "article-content-divergence": {
    one: "article with different content",
    other: "articles with different content",
  },
  "highlight-id": { one: "highlight", other: "highlights" },
  "note-id": { one: "note", other: "notes" },
  location: { one: "reading position", other: "reading positions" },
};

/** keep-both is meaningful ONLY for the id kinds (D9-14 — a minted id can
 * hold both records); on article/location kinds it behaves as skip, so the
 * option is not offered there (per Plan 09-03 semantics). */
const KEEP_BOTH_KINDS: readonly ConflictKind[] = ["highlight-id", "note-id"];

/** Plain-word select labels for each PerKindOverride choice. */
const OVERRIDE_LABELS: Record<PerKindOverride, string> = {
  skip: "Skip",
  overwrite: "Overwrite",
  "keep-both": "Keep both",
};

/** "{n} {label}" with honest singular/plural agreement. */
function countWithLabel(n: number, labels: { one: string; other: string }): string {
  return `${n} ${n === 1 ? labels.one : labels.other}`;
}

/**
 * The summary sentence: incoming counts with the added counts when they
 * differ from incoming (e.g. "3 articles (1 new)"). Built as one plain
 * string so the whole sentence is a single text node (calm voice + simple
 * live-region/aria-describedby semantics).
 */
function summarySentence(preview: ImportPreviewData): string {
  const part = (incoming: number, added: number, one: string, other: string): string => {
    const base = `${incoming} ${incoming === 1 ? one : other}`;
    return incoming !== added ? `${base} (${added} new)` : base;
  };
  return (
    `This bundle contains ${part(preview.incoming.articles, preview.added.articles, "article", "articles")}, ` +
    `${part(preview.incoming.highlights, preview.added.highlights, "highlight", "highlights")}, ` +
    `${part(preview.incoming.notes, preview.added.notes, "note", "notes")}, and ` +
    `${part(preview.incoming.locations, preview.added.locations, "reading position", "reading positions")}.`
  );
}

export function ImportPreviewDialog({
  open,
  preview,
  onProceed,
  onCancel,
}: ImportPreviewDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — same discipline as WipeConfirm + RemoveConfirm).
  const triggerRef = useRef<HTMLElement | null>(null);

  // The D9-14 bulk per-kind override choices + the D9-12 preferences choice.
  const [overrides, setOverrides] = useState<Overrides>(DEFAULT_OVERRIDES);
  const [applyPreferences, setApplyPreferences] = useState(false);

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + WebKit quirk, same as
      // WipeConfirm/RemoveConfirm): explicitly focus the [data-initial-focus]
      // element so the focus trap and the initial reading position are
      // predictable in WebKit. The CANCEL button carries the marker —
      // focusing the destructive action by default would risk an accidental
      // Enter importing over local data. The reader must move focus to
      // "Import" deliberately.
      const initial =
        dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ??
        dlg;
      initial.focus();
      // Fresh choices on every open: skip-by-default overrides (D9-14) and
      // the preview's D9-12 fresh-device preferences default. A prior
      // canceled import never leaks into the next one.
      setOverrides({ ...DEFAULT_OVERRIDES });
      setApplyPreferences(preview?.applyPreferencesDefault ?? false);
    } else if (!open && dlg.open) {
      dlg.close();
    }
    // NOTE: `preview` is read only for the open-transition reset above; it
    // does not re-run the modal sync when it changes while already open.
  }, [open, preview]);

  // Register the `close` event listener (with cleanup). Restore focus to the
  // captured trigger (Pitfall 1).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, []);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY place `onProceed` is invoked (the parent routes it to
  // resolveImportPlan + applyImport). It lives in the Import button's
  // onClick — never in a catch block, effect, or the file-pick handler.
  // The reader must click "Import" to fire this; nothing else triggers it.
  const onImportClick = () => {
    onProceed(overrides, applyPreferences);
  };

  return (
    <dialog
      ref={ref}
      className="import-preview"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      aria-describedby="import-preview-body"
    >
      <div className="import-preview-inner">
        <h2 id="import-preview-title">Import this bundle?</h2>
        {preview !== null && (
          <div id="import-preview-body" className="import-preview-body">
            <p className="import-preview-summary">{summarySentence(preview)}</p>
            {preview.conflicts.length > 0 && (
              <ul className="import-preview-conflicts">
                {preview.conflicts.map((c) => (
                  <li key={c.kind} className="import-preview-conflict">
                    <span>
                      {c.count} conflicting{" "}
                      {c.count === 1 ? KIND_LABELS[c.kind].one : KIND_LABELS[c.kind].other}
                    </span>
                    <select
                      aria-label={`Import choice for ${KIND_LABELS[c.kind].other}`}
                      value={overrides[c.kind]}
                      onChange={(e) =>
                        setOverrides({
                          ...overrides,
                          [c.kind]: e.target.value as PerKindOverride,
                        })
                      }
                    >
                      <option value="skip">{OVERRIDE_LABELS.skip}</option>
                      <option value="overwrite">{OVERRIDE_LABELS.overwrite}</option>
                      {KEEP_BOTH_KINDS.includes(c.kind) && (
                        <option value="keep-both">{OVERRIDE_LABELS["keep-both"]}</option>
                      )}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            {(preview.resolution.ambiguous > 0 ||
              preview.resolution.orphan > 0 ||
              preview.fixtureBackedHighlights > 0) && (
              <ul className="import-preview-warnings">
                {preview.resolution.ambiguous > 0 && (
                  <li>
                    {countWithLabel(preview.resolution.ambiguous, {
                      one: "highlight",
                      other: "highlights",
                    })}{" "}
                    will import as ambiguous.
                  </li>
                )}
                {preview.resolution.orphan > 0 && (
                  <li>
                    {countWithLabel(preview.resolution.orphan, {
                      one: "highlight",
                      other: "highlights",
                    })}{" "}
                    will import as orphan.
                  </li>
                )}
                {preview.fixtureBackedHighlights > 0 && (
                  <li>
                    {countWithLabel(preview.fixtureBackedHighlights, {
                      one: "highlight",
                      other: "highlights",
                    })}{" "}
                    anchor to bundled sample articles.
                  </li>
                )}
              </ul>
            )}
            <label className="import-preview-preferences">
              <input
                type="checkbox"
                checked={applyPreferences}
                onChange={(e) => setApplyPreferences(e.target.checked)}
              />
              Apply imported reading preferences
            </label>
          </div>
        )}
        <div className="import-preview-actions">
          {/* Destructive action — Pitfall 8: onProceed (the parent's
              applyImport bulk write) fires ONLY in onImportClick above. The
              button label names the consequence unambiguously. */}
          <button type="button" className="import-preview-proceed" onClick={onImportClick}>
            Import
          </button>
          {/* Cancel — names the actual outcome: nothing is written, local
              data is untouched. Carries [data-initial-focus] so the explicit
              focus call lands here on open (NOT on the destructive button —
              safer default per Pitfall 8). */}
          <button
            type="button"
            className="import-preview-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Cancel import
          </button>
        </div>
      </div>
    </dialog>
  );
}
