// src/reader/SettingsPanel.tsx
// The first <dialog> in the codebase. Opened via ref.current.showModal() so the
// browser provides the focus trap, Esc dismissal, ::backdrop, and auto-inert
// of the rest of the document for FREE (A11Y-01/03 — no hand-rolled roving
// tabindex, no manual inert management). Slides over the article from the
// inline end; the article stays mounted behind the scrim (single content tree
// — A11Y-03, no duplication).
//
// CRITICAL — Pitfall 1 (A11Y-02): showModal() does NOT auto-restore focus to
// the trigger on close. We capture document.activeElement (the gear) into
// triggerRef on open, and the dialog `close` event listener calls
// triggerRef.current?.focus(). The CALL SITE (triggerRef.current?.focus()) is
// asserted by tests/component/SettingsPanel.test.tsx; the actual focus-restore
// behavior is proven by tests/e2e/panel-keyboard.spec.ts across Chromium /
// Firefox / WebKit (Pitfall 2 — jsdom cannot replicate the inert/top-layer).
//
// Form controls (UI-SPEC §Interaction 9): Typeface/Spacing/Theme = fieldset +
// legend + radio; Size/Reading-width = input type=range with visible readout.
// Every control calls useSettings().update({...}) — the live-apply happens in
// SettingsContext's effect, NOT in this component (D2-03). Reset restores
// DEFAULT_SETTINGS (D2-04). Copy is verbatim UI-SPEC §Copywriting.
//
// Plan 09-05 (D9-10) — the "Your data" cluster: Export library bundle /
// Import bundle / Export all highlights, plus the import state machine
// (validateBundle → detectImportPreview → ImportPreviewDialog → Proceed).
// Conceptually grouped with the wipe action, but WipeConfirm itself stays
// mounted in App.tsx (recovery-routed via storageState — NOT a settings
// cluster member; see 09-PATTERNS.md correction). Every result and refusal
// announces through the cluster's role="status" live region in calm DOC-06
// voice; applyImport fires ONLY in the dialog Proceed handler (Pitfall 8).
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useSettings } from "../settings/SettingsContext";
import { MEASURE_STEPS, SIZE_STEPS } from "../settings/tokens";
import type { ReaderSettings } from "../content/schema";
import type { CanonicalArticle } from "../content/types";
import { ImportPreviewDialog } from "./ImportPreviewDialog";
import { applyImport, buildBundleBytes, validateBundle } from "../portability/ExportImportService";
import type { ImportRefusal } from "../portability/ExportImportService";
import { detectImportPreview, resolveImportPlan } from "../portability/conflicts";
import type { ImportPreviewData, Overrides } from "../portability/conflicts";
import { BUNDLE_FILENAME } from "../portability/bundle";
import type { ExportBundle } from "../portability/bundle";
import { downloadBlob } from "../portability/download";
import {
  collectHighlightEntries,
  orderSectionsByRecency,
  renderLibraryHighlights,
} from "../portability/markdown";
import type { HighlightEntry, HighlightSection } from "../portability/markdown";
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
import { loadAllLocations } from "../persistence/locationStore";
import { fixtures } from "../fixtures";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** The locked download filename for the combined highlights .md export
 * (mirrors bundle.ts's BUNDLE_FILENAME discipline — one constant, no inline
 * copies for the 09-06 e2e to drift against). */
const HIGHLIGHTS_FILENAME = "lem-reader-highlights.md";

/**
 * The six refusal kinds → the locked calm .status copy (verbatim strings —
 * the 09-06 e2e asserts them). Never throws, never reveals internals: each
 * line names what happened and confirms nothing was imported.
 */
function refusalCopy(refusal: ImportRefusal): string {
  switch (refusal.kind) {
    case "not-a-zip":
      return "This file isn't a Lem Reader bundle. Nothing was imported.";
    case "unsafe-entry":
      return "This bundle contains an unsafe file entry and can't be imported. Nothing was imported.";
    case "missing-entry":
      return `This bundle is incomplete — ${refusal.name} is missing. Nothing was imported.`;
    case "newer-schema-version":
      return "This bundle was exported by a newer Lem Reader version. Please update Lem Reader and try again.";
    case "invalid":
      return `This bundle contains ${refusal.issues.length} problems and can't be imported. Nothing was imported.`;
    case "corrupted":
      return `This bundle may be corrupted — ${refusal.failedBlocks.length} record types failed integrity checking. Nothing was imported.`;
  }
}

/** "{n} {noun}" with honest singular/plural agreement (calm DOC-06 voice). */
function counted(n: number, one: string, other: string): string {
  return `${n} ${n === 1 ? one : other}`;
}

/**
 * Web Crypto availability (RESEARCH Pitfall 6 / T-9-18). On an insecure
 * context crypto.subtle is undefined and manifest hashing would throw a
 * TypeError on digest — the three data actions disable with a calm status
 * message instead (mirrors StorageBanner's graceful-degradation posture;
 * dev localhost and HTTPS hosting are both secure contexts, so this is the
 * defensive surface).
 */
function hasWebCrypto(): boolean {
  const subtle = (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle;
  return subtle !== undefined;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // The trigger that opened the dialog — captured on open so the close handler
  // can restore focus (Pitfall 1 / A11Y-02). HTMLElement, not HTMLButton,
  // because document.activeElement is typed as Element | null.
  const triggerRef = useRef<HTMLElement | null>(null);

  const { settings, update, reset } = useSettings();

  // Sync the `open` prop with the underlying <dialog> state. showModal()/close
  // are idempotent guards — only flip when state actually differs.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Pitfall 1: capture the focused element BEFORE showModal moves focus
      // into the dialog. document.activeElement is the gear (the trigger).
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + WebKit quirk): Chromium
      // auto-focuses the first focusable control on showModal, but WebKit
      // leaves focus on <body> (cycling body↔dialog without reaching controls).
      // Explicitly focus the first focusable control so the focus trap and the
      // initial reading position are predictable everywhere. The .settings-close
      // button is the first focusable element in DOM order (panel header).
      const first =
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ?? dlg;
      first.focus();
    } else if (!open && dlg.open) {
      dlg.close(); // fires the `close` event → the listener below runs
    }
  }, [open]);

  // Register the `close` event listener (with cleanup). On close: flip React
  // state via onClose() and restore focus to the captured trigger (Pitfall 1).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      onClose();
      // A11Y-02: restore focus to the trigger. showModal does not do this for us.
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  // Form-change dispatchers — call update() with the typed patch. The
  // SettingsContext live-applies each change via applyTheme (D2-03).
  const onFont = (font: ReaderSettings["font"]) => update({ font });
  const onSize = (size: ReaderSettings["size"]) => update({ size });
  const onMeasure = (measure: ReaderSettings["measure"]) => update({ measure });
  const onSpacing = (spacing: ReaderSettings["spacing"]) => update({ spacing });
  const onTheme = (theme: ReaderSettings["theme"]) => update({ theme });
  const onReset = () => reset(); // D2-04 — restores DEFAULT_SETTINGS

  // ── Plan 09-05 (D9-10): the "Your data" cluster state machine ───────────
  // One busy kind at a time (all three buttons disable while any data action
  // runs — calm single-flight); dataMessage carries every progress/result/
  // refusal line through the cluster's role="status" live region.
  type DataBusy = "idle" | "export-bundle" | "export-highlights" | "import";
  const [dataBusy, setDataBusy] = useState<DataBusy>("idle");
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  // The validated bundle + its dry-run preview — set together on validation
  // success, cleared together on Proceed/Cancel. The preview dialog opens
  // while importPreview !== null.
  const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  // Ref-based file picker (IngestControl discipline) triggered by the
  // "Import bundle" button.
  const importFileRef = useRef<HTMLInputElement>(null);
  // Computed ONCE per mount (Pitfall 6 / T-9-18 — see hasWebCrypto above).
  const [secureContext] = useState(hasWebCrypto);

  // Insecure context: disable the three actions with the calm status line
  // instead of letting crypto.subtle.digest throw a TypeError mid-export.
  useEffect(() => {
    if (!secureContext) {
      setDataMessage("Export and import need a secure connection (HTTPS).");
    }
  }, [secureContext]);

  const dataActionsDisabled = !secureContext || dataBusy !== "idle";

  /** Export the whole-library .zip bundle (PORT-01). */
  const handleExportBundle = async () => {
    setDataBusy("export-bundle");
    setDataMessage("Building your bundle…");
    try {
      const bytes = await buildBundleBytes();
      downloadBlob([bytes], BUNDLE_FILENAME, "application/zip");
      // Terminal-granularity summary (RESEARCH A6): re-read the article
      // count through the same Zod-validated loader the build used.
      const articles = await dexieLibrarySource.list();
      setDataMessage(
        `Exported ${counted(articles.length, "article", "articles")} to ${BUNDLE_FILENAME}.`,
      );
    } catch {
      setDataMessage("Export didn't complete. Nothing was exported.");
    } finally {
      setDataBusy("idle");
    }
  };

  /** Export all highlights as one combined .md (PORT-03). */
  const handleExportHighlights = async () => {
    setDataBusy("export-highlights");
    setDataMessage("Collecting highlights…");
    try {
      const [saved, highlights, notes, locations] = await Promise.all([
        dexieLibrarySource.list(),
        loadAllHighlights(),
        loadAllNotes(),
        loadAllLocations(),
      ]);
      // Fixtures join the article set (first-seen wins — a saved article
      // shadows a same-id fixture) so fixture-backed highlights resolve
      // (the same Pattern 8 precedence detectImportPreview uses).
      const seen = new Set<string>();
      const articles: CanonicalArticle[] = [];
      for (const a of [...saved, ...fixtures]) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          articles.push(a);
        }
      }
      const entries = collectHighlightEntries(articles, highlights, notes);
      // Group into per-article sections (only articles with ≥1 entry get a
      // section — an empty `## title` block would be noise, not calm).
      // D9-09 never-drop: entries whose article exists NOWHERE in the export
      // set (vanished article — removed-with-corrupt-row or fixture skew)
      // become the combined file's trailing unmatched section instead of
      // being silently dropped; their notes ride along.
      const articleById = new Map(articles.map((a) => [a.id, a] as const));
      const entriesByArticle = new Map<string, HighlightEntry[]>();
      for (const entry of entries) {
        const list = entriesByArticle.get(entry.highlight.articleId) ?? [];
        list.push(entry);
        entriesByArticle.set(entry.highlight.articleId, list);
      }
      const sections: HighlightSection[] = [];
      const unmatched: HighlightEntry[] = [];
      for (const [articleId, list] of entriesByArticle) {
        const article = articleById.get(articleId);
        if (article !== undefined) {
          sections.push({ article, entries: list });
        } else {
          unmatched.push(...list);
        }
      }
      const md = renderLibraryHighlights(orderSectionsByRecency(sections, locations), unmatched);
      downloadBlob([md], HIGHLIGHTS_FILENAME, "text/markdown");
      setDataMessage(
        `Exported ${counted(highlights.length, "highlight", "highlights")} to ${HIGHLIGHTS_FILENAME}.`,
      );
    } catch {
      setDataMessage("Export didn't complete. Nothing was exported.");
    } finally {
      setDataBusy("idle");
    }
  };

  /** The import state machine's file-pick stage: validate → refuse calmly,
   * or open the preview dialog. NEVER writes (Pitfall 8 — the write lives
   * only in the dialog's Proceed handler below). */
  const handleImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setDataBusy("import");
    setDataMessage("Reading bundle…");
    try {
      const result = await validateBundle(file);
      if (!result.ok) {
        setDataMessage(refusalCopy(result.refusal));
        // Reset so re-picking the SAME refused file re-fires onChange —
        // the retry path must never be a silent no-op.
        e.target.value = "";
        return;
      }
      const preview = await detectImportPreview(result.bundle);
      setImportBundle(result.bundle);
      setImportPreview(preview);
      setDataMessage(null);
    } catch {
      // validateBundle never throws by contract (09-04); this guards the
      // preview's local reads. Nothing has been written either way.
      setDataMessage("Import didn't complete. Nothing was changed.");
      e.target.value = "";
    } finally {
      setDataBusy("idle");
    }
  };

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for applyImport in this component. It lives in the
  // preview dialog's Proceed handler — never in a catch block, effect, or
  // the file-pick handler above. The reader must click "Import" in the
  // ImportPreviewDialog to fire this; nothing else triggers it.
  const handleImportProceed = async (overrides: Overrides, applyPreferences: boolean) => {
    if (importBundle === null || importPreview === null) return;
    setDataBusy("import");
    setDataMessage("Importing…");
    try {
      const plan = await resolveImportPlan(
        importBundle,
        importPreview,
        overrides,
        applyPreferences,
      );
      await applyImport(plan); // atomic 5-store transaction — rolls back on throw
      const skipped =
        plan.skipped.articles +
        plan.skipped.highlights +
        plan.skipped.notes +
        plan.skipped.locations;
      let message = `Imported ${counted(plan.articlesToWrite.length, "article", "articles")}, ${counted(plan.highlightsToWrite.length, "highlight", "highlights")}, ${counted(plan.notesToWrite.length, "note", "notes")}, and ${counted(plan.locationsToWrite.length, "reading position", "reading positions")}.`;
      if (skipped > 0) {
        message += ` ${counted(skipped, "item", "items")} ${skipped === 1 ? "was" : "were"} skipped.`;
      }
      setDataMessage(message);
    } catch {
      // The Dexie transaction rolled back — local data is unchanged.
      setDataMessage("Import didn't complete. Nothing was changed.");
    } finally {
      setImportPreview(null);
      setImportBundle(null);
      // Reset so re-picking the same bundle file re-fires onChange.
      if (importFileRef.current !== null) importFileRef.current.value = "";
      setDataBusy("idle");
    }
  };

  /** Cancel import — nothing is written; IndexedDB is untouched. */
  const handleImportCancel = () => {
    setImportPreview(null);
    setImportBundle(null);
    if (importFileRef.current !== null) importFileRef.current.value = "";
    setDataMessage(null);
  };

  // The panel renders a <div> wrapper, NOT a <form method="dialog">. The
  // earlier form-wrapped variant caused a focus-trap edge case in Chromium
  // (focus briefly escaped to <body> during the wrap-around). Every control
  // here is type="button" with a React onChange/onClick handler, so no form
  // submission behavior is needed.
  return (
    <>
      <dialog ref={ref} className="settings-panel" aria-labelledby="settings-title">
        <div className="settings-panel-inner">
          <div className="settings-panel-header">
            <h2 id="settings-title">Reading settings</h2>
            <button
              type="button"
              className="settings-close"
              aria-label="Close reading settings"
              onClick={onClose}
            >
              <CloseIcon aria-hidden="true" />
            </button>
          </div>

          <fieldset className="settings-section">
            <legend>Typeface</legend>
            <label className="settings-row">
              <input
                type="radio"
                name="font"
                value="serif"
                checked={settings.font === "serif"}
                onChange={() => onFont("serif")}
              />
              <span>Serif</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="font"
                value="sans"
                checked={settings.font === "sans"}
                onChange={() => onFont("sans")}
              />
              <span>Sans</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="font"
                value="dyslexic"
                checked={settings.font === "dyslexic"}
                onChange={() => onFont("dyslexic")}
              />
              <span>Dyslexia-friendly</span>
            </label>
          </fieldset>

          <fieldset className="settings-section">
            <legend>
              Text size <span className="settings-value">{settings.size} px</span>
            </legend>
            {/* Stepped range over SIZE_STEPS — min/max bound the slider, step
              matches the gap between consecutive steps so arrow keys land on a
              valid value. aria-valuenow carries the current value for AT. */}
            <input
              type="range"
              name="size"
              min={SIZE_STEPS[0]}
              max={SIZE_STEPS[SIZE_STEPS.length - 1]}
              step={SIZE_STEPS[1] - SIZE_STEPS[0]}
              value={settings.size}
              aria-label="Text size"
              aria-valuenow={settings.size}
              aria-valuemin={SIZE_STEPS[0]}
              aria-valuemax={SIZE_STEPS[SIZE_STEPS.length - 1]}
              onChange={(e) => {
                const next = Number(e.currentTarget.value);
                if (SIZE_STEPS.includes(next as (typeof SIZE_STEPS)[number])) {
                  onSize(next as ReaderSettings["size"]);
                }
              }}
            />
          </fieldset>

          <fieldset className="settings-section">
            <legend>
              Reading width <span className="settings-value">{settings.measure} ch</span>
            </legend>
            <input
              type="range"
              name="measure"
              min={MEASURE_STEPS[0]}
              max={MEASURE_STEPS[MEASURE_STEPS.length - 1]}
              step={MEASURE_STEPS[1] - MEASURE_STEPS[0]}
              value={settings.measure}
              aria-label="Reading width"
              aria-valuenow={settings.measure}
              aria-valuemin={MEASURE_STEPS[0]}
              aria-valuemax={MEASURE_STEPS[MEASURE_STEPS.length - 1]}
              onChange={(e) => {
                const next = Number(e.currentTarget.value);
                if (MEASURE_STEPS.includes(next as (typeof MEASURE_STEPS)[number])) {
                  onMeasure(next as ReaderSettings["measure"]);
                }
              }}
            />
          </fieldset>

          <fieldset className="settings-section">
            <legend>Spacing</legend>
            <label className="settings-row">
              <input
                type="radio"
                name="spacing"
                value="compact"
                checked={settings.spacing === "compact"}
                onChange={() => onSpacing("compact")}
              />
              <span>Compact</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="spacing"
                value="comfortable"
                checked={settings.spacing === "comfortable"}
                onChange={() => onSpacing("comfortable")}
              />
              <span>Comfortable</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="spacing"
                value="spacious"
                checked={settings.spacing === "spacious"}
                onChange={() => onSpacing("spacious")}
              />
              <span>Spacious</span>
            </label>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Theme</legend>
            <label className="settings-row">
              <input
                type="radio"
                name="theme"
                value="sepia"
                checked={settings.theme === "sepia"}
                onChange={() => onTheme("sepia")}
              />
              <span>Sepia</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={settings.theme === "light"}
                onChange={() => onTheme("light")}
              />
              <span>Light</span>
            </label>
            <label className="settings-row">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={settings.theme === "dark"}
                onChange={() => onTheme("dark")}
              />
              <span>Dark</span>
            </label>
          </fieldset>

          {/* Plan 09-05 (D9-10) — the "Your data" cluster: the three
            whole-library data actions + the import file picker + the status
            live region. Conceptually grouped with the wipe action (which
            stays recovery-routed in App.tsx — 09-PATTERNS.md correction).
            All buttons type="button" (the panel avoids form submission). */}
          <fieldset className="settings-section settings-data">
            <legend>Your data</legend>
            <div className="settings-data-actions">
              <button
                type="button"
                className="settings-data-action"
                onClick={handleExportBundle}
                disabled={dataActionsDisabled}
              >
                Export library bundle
              </button>
              <button
                type="button"
                className="settings-data-action"
                onClick={() => importFileRef.current?.click()}
                disabled={dataActionsDisabled}
              >
                Import bundle
              </button>
              <button
                type="button"
                className="settings-data-action"
                onClick={handleExportHighlights}
                disabled={dataActionsDisabled}
              >
                Export all highlights
              </button>
            </div>
            {/* Visually-hidden file picker (IngestControl ref discipline) —
              triggered by the Import bundle button; disabled together with
              it. tabIndex -1 keeps the hidden input off the Tab ring (the
              button is the keyboard path). */}
            <input
              ref={importFileRef}
              type="file"
              accept=".zip"
              className="visually-hidden"
              aria-label="Bundle file"
              tabIndex={-1}
              disabled={dataActionsDisabled}
              onChange={handleImportChange}
            />
            {/* The D2-13 pattern: polite/atomic status region carrying every
              progress, result, and refusal line in calm DOC-06 voice. */}
            <div className="status" role="status" aria-live="polite" aria-atomic="true">
              {dataMessage !== null && <p>{dataMessage}</p>}
            </div>
          </fieldset>

          <div className="settings-footer">
            {/* The Reset button's accessible name conveys the consequence (D2-04,
              UI-SPEC §Copywriting line 317); applyTheme + SettingsContext state
              flip together the moment it's clicked. */}
            <button type="button" className="settings-reset" onClick={onReset}>
              Reset to defaults
            </button>
          </div>
        </div>
      </dialog>

      {/* Plan 09-05 (D9-11) — the import preview + confirm dialog. Opens on
        validation success (importPreview !== null); Proceed is the ONLY path
        to applyImport (see the Pitfall 8 handler above). Mounted OUTSIDE the
        settings dialog so the native top layer stacks cleanly and the DOM
        reading order stays un-nested. */}
      <ImportPreviewDialog
        open={importPreview !== null}
        preview={importPreview}
        onProceed={handleImportProceed}
        onCancel={handleImportCancel}
      />
    </>
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
