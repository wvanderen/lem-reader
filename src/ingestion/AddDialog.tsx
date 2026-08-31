// src/ingestion/AddDialog.tsx
// Plan 16-02 Task 2 — the focused Add-to-library dialog (D16-01): a native
// <dialog> (showModal) STRUCTURAL CLONE of the BookRemoveConfirm lineage
// (open-prop sync + explicit initial focus + close/cancel listeners —
// Pitfall 1/8 discipline) hosting the original three-form control's
// four-state submission spine verbatim behind a controlled 3-way source
// picker (D16-05). Plan 16-03 deleted that control; this dialog mounts in
// its place from the Library header row (D16-03).
//
// Decision map (16-CONTEXT.md):
//   - D16-05: visible 3-way source-first picker (Web address / Paste text /
//     Upload file); ONLY the selected source's input is visible. Native
//     fieldset/radio semantics (the SettingsPanel L370-402 discipline);
//     NOT a tablist.
//   - D16-06: one combined file picker (accept=".md,.html,.pdf,.epub")
//     with the extension dispatch + per-format caps carried verbatim.
//   - D16-07: typed URL/paste text (lifted state) and a picked File
//     (always-mounted hidden input — Pattern 3a) survive source switches
//     within one dialog session.
//   - D16-08: every open resets to Web address with fresh session state —
//     no last-used-source memory.
//   - D16-09: dedupe-refuse is the calm "Already in your library."
//     message ONLY — no save, no "Open it" action, no surprise navigation.
//   - D16-10: no dismissal while a submission is in flight — the `cancel`
//     event (Esc / mobile back) is gated on the live submittingRef mirror
//     and the Cancel + submit controls are disabled.
//   - D16-11: file retry keeps the G2 reset discipline (pick clears at
//     every terminal outcome; retry = re-pick). URL/paste text is NEVER
//     cleared by an error.
//   - D16-12: success splits by kind — article closes then navigates to
//     #/article/<id>; book closes then lands on the Library via
//     onBookAdded (the skip disclosure stays durable on the BookRow).
//
// NOTE on class names (the BookRemoveConfirm.tsx L19-23 rule): this dialog
// uses its OWN .add-dialog* hooks — RemoveConfirm, BookRemoveConfirm, and
// AddDialog all three mount in LibraryView, and a shared class would break
// strict-mode `dialog.<class>` locators.
//
// Threat register (16-02-PLAN.md `<threat_model>`):
//   - T-16-04 (dedupe-refuse regression) → has()/hasBook() BEFORE
//     save/saveBook, verbatim from the original three-form control (D7-07).
//   - T-16-05 (size-cap bypass) → extension-aware caps refuse BEFORE any
//     read (PDF_MAX_BYTES / EPUB_MAX_BYTES / 5MB).
//   - T-16-06 (XSS in refusal/echo copy) → all copy renders as React text
//     children; zero innerHTML (lint:no-danger unaffected).
//   - T-16-07 (duplicate submission via mid-flight dismissal) → D16-10
//     blocking above.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ingestUrl,
  ingestHtml,
  ingestMarkdown,
  ingestPdf,
  ingestEpub,
  IngestionError,
  type IngestionSuccess,
} from "./IngestionClient";
import { dexieLibrarySource } from "./LibrarySource";
import { hasBook, saveBook } from "../persistence/booksStore";
import type { BookAsset } from "../persistence/booksStore";
import type { ValidatedAsset } from "./IngestionClient";
import type { Block } from "../content/types";
import { EPUB_MAX_BYTES, PDF_MAX_BYTES } from "./types";
// Plan 16-02 Task 1 — the refusal-copy map + chunked base64 live in
// ./ingestCopy; this dialog consumes the same exports the retired control did
// (no fork — the byte-pinned DOC-06 catalog is load-bearing surface).
import { mapReasonToCopy, bytesToBase64 } from "./ingestCopy";

type IngestStatus = "idle" | "submitting" | "success" | "error";

/**
 * assetRefBodiesInBlocks — collect the `asset:img-<12hex>` reference BODIES
 * (the scheme-stripped assetIds) from every figure in a block tree,
 * recursing through containers (blockquote children + list item content —
 * figures nest per the assetStage rewrite recursion). Phase 20 (20-04
 * Task 1): the book arm attributes envelope assets to their OWNING chapter
 * articles by walking each chapter's blocks — the envelope itself carries
 * no articleId, so the model's refs are the only attribution source
 * (D20-15 article-owned rows).
 */
function assetRefBodiesInBlocks(blocks: readonly Block[]): string[] {
  const ids: string[] = [];
  const visit = (nodes: readonly Block[]) => {
    for (const block of nodes) {
      if (block.kind === "figure") {
        if (block.src !== undefined && block.src.startsWith("asset:")) {
          ids.push(block.src.slice("asset:".length));
        }
      } else if (block.kind === "blockquote") {
        visit(block.children);
      } else if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
        for (const item of block.items) {
          visit(item.content);
        }
      }
    }
  };
  visit(blocks);
  return ids;
}

/**
 * bookAssetsForChapters — attribute validated envelope assets to chapter
 * articles, producing the flat BookAsset list saveBook persists (the
 * 20-03 contract). An asset referenced by TWO chapters produces TWO rows
 * (the [articleId+assetId] compound key makes rows article-owned — D20-15);
 * an envelope asset no chapter references is dropped (the attribution is
 * model-driven, never envelope-driven).
 */
function bookAssetsForChapters(
  chapters: readonly { id: string; blocks: readonly Block[] }[],
  assets: readonly ValidatedAsset[],
): BookAsset[] {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const out: BookAsset[] = [];
  for (const chapter of chapters) {
    for (const assetId of new Set(assetRefBodiesInBlocks(chapter.blocks))) {
      const asset = byId.get(assetId);
      if (asset) {
        out.push({ articleId: chapter.id, ...asset });
      }
    }
  }
  return out;
}

/** The selected intake source (D16-05). Reset to "url" on every open. */
export type AddDialogSource = "url" | "paste" | "file";

/**
 * AddDialog props — Plan 16-03 wires exactly this contract from
 * LibraryView: `open` mirrors the header-row Add button's state,
 * `onCancel` closes (Cancel button / Esc / scrim — every close path
 * routes through the open-prop mirror, the 09-06 wedge lesson), and
 * `onBookAdded` fires after a book lands so the Library can refresh.
 */
export type AddDialogProps = {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** Invoked by the Cancel button, the cancel event (Esc), and BOTH
   *  success arms AFTER the save resolves (D16-12 — close first). */
  onCancel: () => void;
  /** Invoked after a book success (after onCancel) — LibraryView bumps
   *  its refreshKey so the new book row appears. */
  onBookAdded: () => void;
};

export function AddDialog({ open, onCancel, onBookAdded }: AddDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element (the Add button) on open so
  // the close handler can restore focus (Pitfall 1 — same discipline as
  // BookRemoveConfirm / SettingsPanel).
  const triggerRef = useRef<HTMLElement | null>(null);

  // ── Session state (D16-07/D16-08) ──────────────────────────────────────
  // Lifted out of the per-source inputs so typed values survive source
  // switches (the inputs unmount freely; the state does not).
  const [source, setSource] = useState<AddDialogSource>("url");
  const [urlValue, setUrlValue] = useState("");
  const [htmlValue, setHtmlValue] = useState("");
  const [status, setStatus] = useState<IngestStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // hasFile mirrors the file-input selection in React state so the submit
  // button's disabled flag re-evaluates after the OS file picker resolves
  // (refs are not reactive — the 08-04 discipline).
  const [hasFile, setHasFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitting = status === "submitting";
  // Live mirror rewritten EVERY render (Pitfall 3 — the LibraryView L236
  // liveContextRef discipline): the long-lived `cancel` listener below
  // must read the CURRENT submitting state, not a stale closure capture.
  // Mirrors the BookRemoveConfirm L98-104 + LibraryView L236 discipline.
  const submittingRef = useRef(false);
  submittingRef.current = submitting;

  /**
   * resetFilePick — the single reset seam for the upload picker (Plan
   * 13-08, gap G2; carried verbatim from the original control's L148-151). Clears
   * the input's value so re-picking the SAME file re-fires onChange (a
   * stale value would make same-file retry a silent no-op) and drops the
   * hasFile mirror so Add file returns to disabled. Every terminal
   * outcome of handleFileSubmit, the Remove file control, and the open
   * reset below route through this ONE helper — no scattered clears.
   */
  function resetFilePick() {
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
    setHasFile(false);
  }

  // ── Dialog shell — BookRemoveConfirm clone (L63-86 + the 02-01 lesson) ──
  // Sync the `open` prop with the underlying <dialog> state (idempotent
  // guards). On EVERY false→true transition the session state RESETS
  // (D16-08 — the dialog always opens on Web address, fresh: no
  // last-used-source memory, no stale typed text, no stale pick).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Pitfall 1: capture the focused element (the Add button) BEFORE
      // showModal moves focus into the dialog.
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus trap, inert backdrop, Esc fires cancel
      // D16-08: fresh session state on every open.
      setSource("url");
      setUrlValue("");
      setHtmlValue("");
      setStatus("idle");
      setMessage(null);
      resetFilePick();
      // Cross-engine focus management (Pitfall 1 + WebKit quirk — the
      // 02-01 lesson): Chromium auto-focuses the first focusable control
      // on showModal, WebKit leaves focus on <body>. Explicitly focus
      // [data-initial-focus] — the Web address radio (the first choice of
      // the first decision the reader makes; nothing destructive).
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

  // Register the `close` + `cancel` listeners (with cleanup) — the
  // BookRemoveConfirm L92-111 clone with the D16-10 in-flight gate.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      // Pitfall 1 / A11Y-02: restore focus to the captured trigger.
      triggerRef.current?.focus();
    };
    const handleDialogCancel = (e: Event) => {
      // Esc on an open <dialog> fires `cancel` then `close`. ALWAYS
      // preventDefault so the browser never closes the dialog itself —
      // the React open-prop mirror owns every close path (the 09-06
      // wedge lesson: a stale open=true would wedge the dialog shut).
      e.preventDefault();
      // D16-10: no dismissal while a submission is in flight. The live
      // submittingRef mirror (not a stale closure) decides — stay open,
      // no state churn, no zombie request, no "did it save?" ambiguity.
      if (submittingRef.current) return;
      onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleDialogCancel);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleDialogCancel);
    };
  }, [onCancel]);

  /**
   * handleSubmit — the url/paste submission spine, carried verbatim from
   * the original control's L161-197 with the D16-12 close-first adaptation. Every
   * failure routes to a calm DOC-06 phrase via mapReasonToCopy; the
   * D7-07 dedupe-refuse check runs has() BEFORE save (refusal-only —
   * D16-09); URL/paste text is NEVER cleared by an error (D16-11).
   */
  async function handleSubmit(which: "url" | "paste") {
    setStatus("submitting");
    setMessage("Fetching article…");
    try {
      const result =
        which === "url"
          ? await ingestUrl(urlValue)
          : await ingestHtml(htmlValue);

      // D7-07 dedupe-refuse: check has() BEFORE save. If has returns
      // true, surface "Already in your library." and refuse the re-ingest
      // (no overwrite, no orphaned highlights, no "Open it" action).
      const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
      if (alreadyInLibrary) {
        setStatus("error");
        setMessage(mapReasonToCopy("already-in-library"));
        return;
      }

      // Phase 20 (20-04 Task 1 — D20-04/D20-15): the article AND its
      // validated envelope assets save together in ONE Dexie transaction
      // (LibrarySource.save's atomic upsert). A saved article is always
      // complete — refused figures never reached the envelope, and every
      // accepted asset lands with its owning article or not at all.
      await dexieLibrarySource.save(result.article, result.assets);
      setStatus("success");
      setMessage(null);
      // D16-12 article arm: close the dialog FIRST (the parent's open-prop
      // flip runs the close effect + focus restore while the trigger is
      // still mounted), THEN navigate to the reader.
      onCancel();
      window.location.hash = `#/article/${result.article.id}`;
    } catch (e) {
      setStatus("error");
      if (e instanceof IngestionError) {
        setMessage(mapReasonToCopy(e.reason));
      } else {
        // Catch-all: any non-IngestionError throw surfaces as the generic
        // server-error copy.
        setMessage(mapReasonToCopy("server-error"));
      }
    }
  }

  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || urlValue.length === 0) return;
    void handleSubmit("url");
  }

  function handlePasteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || htmlValue.length === 0) return;
    void handleSubmit("paste");
  }

  /**
   * handleFileSubmit — the file-upload arm, carried verbatim from
   * the original control's L231-351 with the D16-12 close-first adaptation.
   * Dispatch by extension: `.md` → ingestMarkdown (forwards file.name for
   * the D8-17 title fallback); `.pdf` → binary read + chunked base64 →
   * ingestPdf; `.epub` → binary read + chunked base64 → ingestEpub (the
   * book path — book-level hasBook/saveBook instead of the single-article
   * has/save); else → ingestHtml (title derived from content metadata).
   *
   * T-8-14 + T-11-02 + T-12-09: the extension-aware client-side cap
   * refuses BEFORE any read (no network cost, no arrayBuffer
   * materialization). G2: every terminal outcome routes through
   * resetFilePick so retry = re-pick (D16-11).
   */
  async function handleFileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    const isPdf = /\.pdf$/i.test(file.name);
    const isEpub = /\.epub$/i.test(file.name);

    if (isPdf) {
      if (file.size > PDF_MAX_BYTES) {
        setStatus("error");
        setMessage(mapReasonToCopy("pdf-too-large"));
        resetFilePick();
        return;
      }
    } else if (isEpub) {
      if (file.size > EPUB_MAX_BYTES) {
        setStatus("error");
        setMessage(mapReasonToCopy("epub-too-large"));
        resetFilePick();
        return;
      }
    } else if (file.size > 5 * 1024 * 1024) {
      setStatus("error");
      setMessage(mapReasonToCopy("response-too-large"));
      resetFilePick();
      return;
    }

    setStatus("submitting");
    setMessage("Reading file…");
    try {
      // Phase 12 (ING-05): the book arm. Binary read → chunked base64 →
      // ingestEpub; the book ok-variant carries book + chapter articles +
      // skippedCount. Book-level dedupe-refuse: hasBook(book.id) BEFORE
      // saveBook (D7-07 at book level — re-uploading identical bytes
      // produces the same content-hash book id). The save is ONE Dexie
      // transaction (booksStore.saveBook).
      if (isEpub) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const b64 = bytesToBase64(bytes);
        const result = await ingestEpub(b64, file.name);

        if (await hasBook(result.book.id)) {
          setStatus("error");
          setMessage(mapReasonToCopy("already-in-library"));
          resetFilePick();
          return;
        }

        // Phase 20 (20-04 Task 1 — D20-04/D20-15): the book arm threads
        // the SAME validated assets into saveBook's one-transaction
        // chapter upsert. The envelope carries no articleId, so each
        // chapter's blocks attribute its owned rows (bookAssetsForChapters
        // above). Zero chapter assets until 20-06's container extraction
        // fills the book envelope — the wiring is complete NOW.
        await saveBook(
          result.book,
          result.articles,
          bookAssetsForChapters(result.articles, result.assets),
        );
        setStatus("success");
        let successCopy = "Book added to your library.";
        if (result.skippedCount > 0) {
          successCopy +=
            result.skippedCount === 1
              ? " 1 chapter could not be read."
              : ` ${result.skippedCount} chapters could not be read.`;
        }
        setMessage(successCopy);
        // G2: the pick clears at every terminal outcome (retry = re-pick).
        resetFilePick();
        // D16-12 book arm: close FIRST, then land on the Library where the
        // new book row now is (the D12-11 skip disclosure stays durable on
        // the BookRow — no in-dialog copy needed).
        onCancel();
        onBookAdded();
        return;
      }

      const isMarkdown = /\.md$/i.test(file.name);
      let result: IngestionSuccess;
      if (isMarkdown) {
        result = await ingestMarkdown(await file.text(), file.name);
      } else if (isPdf) {
        // Binary read → chunked base64 → ingestPdf. Identical bytes
        // produce a pdf-<hash> id server-side, so re-uploading the same
        // PDF hits the D7-07 dedupe-refuse below (D11 id invariant).
        const bytes = new Uint8Array(await file.arrayBuffer());
        const b64 = bytesToBase64(bytes);
        result = await ingestPdf(b64, file.name);
      } else {
        result = await ingestHtml(await file.text());
      }

      // D7-07 dedupe-refuse (identical to the url/paste paths).
      const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
      if (alreadyInLibrary) {
        setStatus("error");
        setMessage(mapReasonToCopy("already-in-library"));
        resetFilePick();
        return;
      }

      // Phase 20 (20-04 Task 1): the file arm mirrors the url/paste arm —
      // validated envelope assets ride the article into the ONE Dexie
      // save transaction (markdown/html uploads can carry figures).
      await dexieLibrarySource.save(result.article, result.assets);
      setStatus("success");
      setMessage(null);
      // Uniform reset contract (G2) — keeps every terminal outcome
      // identical.
      resetFilePick();
      // D16-12 article arm: close FIRST, then navigate.
      onCancel();
      window.location.hash = `#/article/${result.article.id}`;
    } catch (err) {
      setStatus("error");
      if (err instanceof IngestionError) {
        setMessage(mapReasonToCopy(err.reason));
      } else {
        // Non-typed throw (file read, JSON parse, unexpected client bug) —
        // surface as the generic server-error copy.
        setMessage(mapReasonToCopy("server-error"));
      }
      resetFilePick();
    }
  }

  // The dialog renders <form> elements with PREVENTED submits only — NO
  // dialog-method form wrapper (Chromium focus-trap interference; the
  // SettingsPanel L349-353 lesson). Every non-submitting control is
  // type="button".
  return (
    <dialog
      ref={dialogRef}
      className="add-dialog"
      aria-labelledby="add-dialog-title"
    >
      <div className="add-dialog-inner">
        <h2 id="add-dialog-title">Add to your library</h2>

        {/* D16-05 — the visible 3-way source-first picker. Native
            fieldset/legend/radio semantics (the SettingsPanel L370-402
            discipline); controlled radios (checked from state — never
            uncontrolled; the Firefox persistence quirk, Pitfall 9). NOT a
            tablist (the D14-22 machinery is deliberately avoided). */}
        <fieldset className="add-source-picker">
          <legend>Add from</legend>
          <label className="add-source-row">
            <input
              type="radio"
              name="source"
              value="url"
              checked={source === "url"}
              onChange={() => setSource("url")}
              data-initial-focus
            />
            <span>Web address</span>
          </label>
          <label className="add-source-row">
            <input
              type="radio"
              name="source"
              value="paste"
              checked={source === "paste"}
              onChange={() => setSource("paste")}
            />
            <span>Paste text</span>
          </label>
          <label className="add-source-row">
            <input
              type="radio"
              name="source"
              value="file"
              checked={source === "file"}
              onChange={() => setSource("file")}
            />
            <span>Upload file</span>
          </label>
        </fieldset>

        {/* D16-05/D16-07 — only the selected source's input group is
            visible. The URL/paste groups unmount freely: their values
            live in the lifted urlValue/htmlValue state, so switching
            sources never loses typed text. The accessible names + ids are
            the byte-stable anchors the e2e suite drives. */}
        {source === "url" && (
          <form onSubmit={handleUrlSubmit} className="add-url-form">
            <label htmlFor="ingest-url">Add by URL</label>
            <input
              id="ingest-url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://example.com/article"
              value={urlValue}
              disabled={submitting}
              onChange={(e) => setUrlValue(e.target.value)}
            />
            <button type="submit" disabled={submitting || urlValue.length === 0}>
              Add
            </button>
          </form>
        )}

        {source === "paste" && (
          <form onSubmit={handlePasteSubmit} className="add-paste-form">
            <label htmlFor="ingest-paste">Paste HTML or text</label>
            <textarea
              id="ingest-paste"
              name="html"
              rows={4}
              placeholder="<article>…</article>"
              value={htmlValue}
              disabled={submitting}
              onChange={(e) => setHtmlValue(e.target.value)}
            />
            <button
              type="submit"
              disabled={submitting || htmlValue.length === 0}
            >
              Add pasted article
            </button>
          </form>
        )}

        {/* Pattern 3a (D16-07) — the file group stays ALWAYS MOUNTED; the
            `hidden` attribute (on BOTH the form and the input — never
            unmounting) hides it when another source is selected.
            Unmounting the input would clear input.files (read-only,
            non-reassignable) and silently drop a picked File mid-session.
            fileInputRef + the G2 resetFilePick seam work byte-unchanged
            against the always-mounted input. */}
        <form
          onSubmit={handleFileSubmit}
          className="add-file-form"
          hidden={source !== "file"}
        >
          <label htmlFor="ingest-file">Upload a file</label>
          <p className="meta">Accepts .md, .html, PDF, and EPUB books</p>
          <input
            id="ingest-file"
            ref={fileInputRef}
            name="file"
            type="file"
            accept=".md,.html,.pdf,.epub"
            hidden={source !== "file"}
            disabled={submitting}
            onChange={(e) =>
              setHasFile(e.target.files !== null && e.target.files.length > 0)
            }
          />
          {hasFile && (
            <button
              type="button"
              className="add-remove-file"
              disabled={submitting}
              onClick={resetFilePick}
            >
              Remove file
            </button>
          )}
          <button type="submit" disabled={submitting || !hasFile}>
            Add file
          </button>
        </form>

        <div className="add-dialog-actions">
          {/* D16-10 — the Cancel control is inert while a submission is in
              flight (defense in depth alongside the cancel-event gate). */}
          <button
            type="button"
            className="add-dialog-cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>

        {/* The .status live region (the original control's L450-459 shape —
            role=status / aria-live=polite / aria-atomic=true). Refusals
            + the submitting state announce here; article success closes
            and navigates away, book success closes onto the Library.
            aria-atomic="true" so the SR re-announces the whole phrase on
            every change (not just the diff). */}
        <div
          className="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {status === "submitting" && message !== null && <p>{message}</p>}
          {status === "error" && message !== null && <p>{message}</p>}
          {status === "success" && message !== null && <p>{message}</p>}
        </div>
      </div>
    </dialog>
  );
}
