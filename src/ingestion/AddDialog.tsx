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
//
// Issue #4: the ingest → dedupe-refuse → atomic save POLICY (and the
// pure asset/book attribution logic) moved out of this file into
// ./addToLibrary — the service is the single home of D7-07 (it used to
// appear once per submission arm) and the outcome union it returns is
// what this dialog renders its copy from. This file keeps ONLY form
// chrome, size validation, and the calm refusal copy mapping.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EPUB_MAX_BYTES, MAX_PASTED_TRANSCRIPT_CHARS, PDF_MAX_BYTES } from "./types";
// Plan 16-02 Task 1 — the refusal-copy map lives in ./ingestCopy; this
// dialog consumes the same export the retired control did (no fork — the
// byte-pinned DOC-06 catalog is load-bearing surface).
import { mapReasonToCopy } from "./ingestCopy";
// Issue #4 — the ingest-and-persist policy service; ONE call per
// submission arm.
import { addToLibrary } from "./addToLibrary";
import type { AddToLibraryOutcome } from "./addToLibrary";
// The paste-transcript fallback dispatches on the same extractor the
// server runs (request-free) — the fallback offer appears ONLY for a URL
// that is actually a YouTube video.
import { extractYouTubeVideoId } from "./youtube";

type IngestStatus = "idle" | "submitting" | "success" | "error";

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
  /** Invoked after a book success (after onCancel) — LibraryView
   *  invalidates the library snapshot so the new book row appears. */
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
  // The paste-transcript fallback (the youtube-bot-check companion). When
  // the URL arm is refused with the bot-check reason for an actual YouTube
  // URL, the refused URL lands here and the dialog offers the manual
  // path: paste the transcript from YouTube's own transcript panel. The
  // URL is provenance only — it is never re-fetched.
  const [botCheckUrl, setBotCheckUrl] = useState<string | null>(null);
  const [transcriptValue, setTranscriptValue] = useState("");
  // The transcript fallback's metadata fields (the "no silent Transcript"
  // fix): the reader names the paste at ingest time — the title is REQUIRED,
  // and the video URL rides provenance only (prefilled from the refused
  // URL, editable, clearable). Like transcriptValue, both survive source
  // switches within one dialog session (D16-07).
  const [transcriptTitleValue, setTranscriptTitleValue] = useState("");
  const [transcriptUrlValue, setTranscriptUrlValue] = useState("");

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
      setBotCheckUrl(null);
      setTranscriptValue("");
      setTranscriptTitleValue("");
      setTranscriptUrlValue("");
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
    // A click whose target IS the dialog element itself is the dimmed
    // ::backdrop (padding: 0 + the .add-dialog-inner wrapper mean the
    // dialog border box == the visible card, so clicks on visible content
    // always target descendants). Route it through the SAME onCancel path
    // as the Cancel button / Esc (the open-prop mirror owns every close —
    // never dlg.close() here). D16-10 extends to the scrim: the live
    // submittingRef mirror decides, so an in-flight submission ignores
    // the click. No preventDefault — that is the cancel event's
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

  /**
   * applyOutcome — render ONE service outcome (issue #4). Every refusal
   * routes to a calm DOC-06 phrase via mapReasonToCopy (the dedupe-refuse
   * arrives as reason "already-in-library" — D16-09/D7-07); the two
   * success arms are the D16-12 close-first split: article closes then
   * navigates to #/article/<id>, book closes then lands on the Library
   * via onBookAdded (the skip disclosure composes from the outcome's
   * skippedChapterCount and stays durable on the BookRow).
   */
  function applyOutcome(outcome: AddToLibraryOutcome) {
    if (outcome.outcome === "refused") {
      setStatus("error");
      setMessage(mapReasonToCopy(outcome.reason));
      return;
    }
    if (outcome.outcome === "saved-book") {
      setStatus("success");
      let successCopy = "Book added to your library.";
      if (outcome.skippedChapterCount > 0) {
        successCopy +=
          outcome.skippedChapterCount === 1
            ? " 1 chapter could not be read."
            : ` ${outcome.skippedChapterCount} chapters could not be read.`;
      }
      setMessage(successCopy);
      // D16-12 book arm: close FIRST, then land on the Library where the
      // new book row now is.
      onCancel();
      onBookAdded();
      return;
    }
    setStatus("success");
    setMessage(null);
    // D16-12 article arm: close the dialog FIRST (the parent's open-prop
    // flip runs the close effect + focus restore while the trigger is
    // still mounted), THEN navigate to the reader.
    onCancel();
    window.location.hash = `#/article/${outcome.articleId}`;
  }

  /**
   * renderOutcome — applyOutcome guarded: a throw from a parent callback
   * (onCancel / onBookAdded) must not become an unhandled rejection with
   * the dialog wedged open; it surfaces as the calm catch-all copy, the
   * same surface the pre-service arms' catch blocks gave it.
   */
  function renderOutcome(outcome: AddToLibraryOutcome) {
    try {
      applyOutcome(outcome);
    } catch {
      setStatus("error");
      setMessage(mapReasonToCopy("server-error"));
    }
  }

  /**
   * runUrlPaste — the url/paste submission arm. One service call (issue
   * #4): addToLibrary owns ingest → dedupe-refuse → atomic save; the
   * outcome renders through renderOutcome. URL/paste text is NEVER cleared
   * by an error (D16-11) — no pick reset on this arm.
   */
  async function runUrlPaste(which: "url" | "paste") {
    setStatus("submitting");
    setMessage("Fetching article…");
    // A new URL submission always starts fresh — a stale fallback offer
    // from a previously refused video must not survive.
    setBotCheckUrl(null);
    const input =
      which === "url"
        ? ({ kind: "url", url: urlValue } as const)
        : ({ kind: "paste", html: htmlValue } as const);
    const outcome = await addToLibrary(input);
    // The fallback offer: the bot-check refusal for an actual YouTube URL
    // (the server returns youtube-bot-check ONLY from the YouTube branch;
    // the extractor guard keeps the offer honest when the reason ever
    // surfaces for a non-video URL).
    if (
      outcome.outcome === "refused" &&
      outcome.reason === "youtube-bot-check" &&
      which === "url" &&
      extractYouTubeVideoId(urlValue) !== null
    ) {
      setBotCheckUrl(urlValue);
      // Prefill the fallback's provenance URL with the refused video's URL
      // (editable + clearable in the form — the reader may correct it).
      setTranscriptUrlValue(urlValue);
    }
    renderOutcome(outcome);
  }

  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || urlValue.length === 0) return;
    void runUrlPaste("url");
  }

  function handlePasteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || htmlValue.length === 0) return;
    void runUrlPaste("paste");
  }

  /**
   * handleTranscriptSubmit — the paste-transcript fallback arm (the
   * youtube-bot-check companion). ONE service call with the reader-provided
   * title (required — an empty one never submits, so the pipeline never
   * fabricates a neutral title) and the refused video's URL as provenance
   * (omitted entirely when the reader cleared the field). The outcome
   * renders through renderOutcome (success closes + navigates like every
   * article arm). The oversize paste refuses BEFORE any network cost (the
   * T-16-05 earliest-enforcement pattern, the file-picker cap discipline).
   * The pasted text is NEVER cleared by an error (D16-11 — retry keeps what
   * the reader typed).
   */
  async function handleTranscriptSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedTitle = transcriptTitleValue.trim();
    if (
      status === "submitting" ||
      transcriptValue.trim().length === 0 ||
      trimmedTitle.length === 0 ||
      botCheckUrl === null
    ) {
      return;
    }
    if (transcriptValue.length > MAX_PASTED_TRANSCRIPT_CHARS) {
      setStatus("error");
      setMessage(mapReasonToCopy("response-too-large"));
      return;
    }
    const trimmedUrl = transcriptUrlValue.trim();
    setStatus("submitting");
    setMessage("Adding transcript…");
    renderOutcome(
      await addToLibrary({
        kind: "transcript-paste",
        text: transcriptValue,
        title: trimmedTitle,
        url: trimmedUrl.length > 0 ? trimmedUrl : undefined,
      }),
    );
  }

  /**
   * handleFileSubmit — the file-upload arm. The dialog keeps ONLY its
   * form-chrome duty: the extension-aware client-side cap refuses BEFORE
   * any read (T-8-14 + T-11-02 + T-12-09 — no network cost, no
   * arrayBuffer materialization), then ONE service call (issue #4) owns
   * the extension dispatch, read, ingest, dedupe-refuse, and atomic
   * save. G2: every terminal outcome routes through resetFilePick so
   * retry = re-pick (D16-11).
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
    const outcome = await addToLibrary({ kind: "file", file });
    // Uniform reset contract (G2) — the pick clears at every terminal
    // outcome of this arm.
    resetFilePick();
    renderOutcome(outcome);
  }

  // The dialog renders <form> elements with PREVENTED submits only — NO
  // dialog-method form wrapper (Chromium focus-trap interference; the
  // SettingsPanel L349-353 lesson). Every non-submitting control is
  // type="button".
  return (
    <dialog ref={dialogRef} className="add-dialog" aria-labelledby="add-dialog-title">
      <div className="add-dialog-inner">
        <h2 id="add-dialog-title">Add to your library</h2>

        {/* D16-05 — the visible 3-way source-first picker. Native
            fieldset/legend/radio semantics (the SettingsPanel L370-402
            discipline); controlled radios (checked from state — never
            uncontrolled; the Firefox persistence quirk, Pitfall 9). NOT a
            tablist (the D14-22 machinery is deliberately avoided). */}
        <fieldset className="add-source-picker" disabled={submitting}>
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
        <div className="add-source-content">
          {source === "url" && (
            <form id="add-url-form" onSubmit={handleUrlSubmit} className="add-url-form">
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
              {/* Issue #60 — the discoverability hint (decision #58): the
                  same quiet .meta voice the file source uses, ordinary text
                  in DOM order (no ARIA tricks — screen readers announce it
                  naturally), so YouTube transcript import is visible before
                  the reader tries it. Pinned byte-for-byte in the component
                  suite alongside the placeholder + radio-label no-drift
                  guards. */}
              <p className="meta">Article pages and YouTube videos</p>
            </form>
          )}

          {source === "paste" && (
            <form id="add-paste-form" onSubmit={handlePasteSubmit} className="add-paste-form">
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
            id="add-file-form"
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
              onChange={(e) => setHasFile(e.target.files !== null && e.target.files.length > 0)}
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
          </form>
        </div>
        {/* The paste-transcript fallback (the youtube-bot-check companion).
            Appears ONLY after the URL arm was refused with the bot-check
            reason for an actual YouTube URL. Calm guidance, a required
            title (the paste is named at ingest — never a fabricated
            "Transcript"), an optional prefilled video URL (provenance
            only — never re-fetched), one textarea, one button — the same
            DOC-06 voice; all copy renders as React text (T-16-06). The
            submitting/error status reuses the shared live region below. */}
        {botCheckUrl !== null && (
          <form id="add-transcript-form" onSubmit={handleTranscriptSubmit} className="add-transcript-form">
            <p className="add-transcript-guidance">
              You can still add it by hand: open the video on YouTube, open its transcript
              (below the player choose "…more" then "Show transcript"), select all the
              transcript text, copy it, and paste it here.
            </p>
            <label htmlFor="ingest-transcript-title">Title</label>
            <input
              id="ingest-transcript-title"
              name="title"
              type="text"
              autoComplete="off"
              placeholder="Name this transcript"
              value={transcriptTitleValue}
              disabled={submitting}
              onChange={(e) => setTranscriptTitleValue(e.target.value)}
            />
            <label htmlFor="ingest-transcript-url">Video URL (optional)</label>
            <input
              id="ingest-transcript-url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.youtube.com/watch?v=…"
              value={transcriptUrlValue}
              disabled={submitting}
              onChange={(e) => setTranscriptUrlValue(e.target.value)}
            />
            <label htmlFor="ingest-transcript">Paste the transcript</label>
            <textarea
              id="ingest-transcript"
              name="transcript"
              rows={6}
              placeholder="0:00&#10;First caption line…"
              value={transcriptValue}
              disabled={submitting}
              onChange={(e) => setTranscriptValue(e.target.value)}
            />
            <div className="add-transcript-actions">
              <button
                type="button"
                className="add-dialog-cancel"
                disabled={submitting}
                onClick={() => setBotCheckUrl(null)}
              >
                No thanks
              </button>
              <button
                type="submit"
                className="add-dialog-submit"
                disabled={
                  submitting ||
                  transcriptValue.trim().length === 0 ||
                  transcriptTitleValue.trim().length === 0
                }
              >
                Add transcript
              </button>
            </div>
          </form>
        )}

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
          <button
            type="submit"
            className="add-dialog-submit"
            form={`add-${source}-form`}
            disabled={
              submitting ||
              (source === "url"
                ? urlValue.length === 0
                : source === "paste"
                  ? htmlValue.length === 0
                  : !hasFile)
            }
          >
            {source === "url" ? "Add" : source === "paste" ? "Add pasted article" : "Add file"}
          </button>
        </div>

        {/* The .status live region (the original control's L450-459 shape —
            role=status / aria-live=polite / aria-atomic=true). Refusals
            + the submitting state announce here; article success closes
            and navigates away, book success closes onto the Library.
            aria-atomic="true" so the SR re-announces the whole phrase on
            every change (not just the diff). */}
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          {status === "submitting" && message !== null && <p>{message}</p>}
          {status === "error" && message !== null && <p>{message}</p>}
          {status === "success" && message !== null && <p>{message}</p>}
        </div>
      </div>
    </dialog>
  );
}
