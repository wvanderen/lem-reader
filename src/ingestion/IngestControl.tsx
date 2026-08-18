// src/ingestion/IngestControl.tsx
// Plan 07-06 — the minimal ingest control (D7-01 — URL input + paste
// textarea, zero library chrome). The control mounts above the article list
// in FixtureList (D7-02 merge surface) and routes every refusal through the
// existing `.status` live region (D7-04 — zero new chrome: no red toasts,
// no modal wizard). The calm, booklike voice (PROJECT.md `<specifics>`) is
// load-bearing — copy is calm, honest, and free of internal jargon.
//
// Four-state machine (07-06-PLAN.md §must_haves truths):
//   - idle: initial render; no message.
//   - submitting: "Fetching article…" while the network call is in flight;
//     both submit buttons disabled.
//   - success: navigation to #/article/<id> takes the user to ArticleView;
//     no separate success message needed.
//   - error: the typed IngestionFailureReason → calm DOC-06 phrase (or the
//     dedupe-refuse "Already in your library.") in the .status region.
//
// Threat register (07-06-PLAN.md `<threat_model>`):
//   - T-7-26 (Tampering, refusal copy leaks jargon) → mapReasonToCopy maps
//     every IngestionFailureReason to a calm phrase; the test
//     "does NOT leak internal jargon" guards regression.
//   - T-7-28 (Tampering, re-ingest overwrites + orphans highlights) →
//     DexieLibrarySource.has(id) BEFORE save; if has returns true, refuse
//     with "Already in your library." and never call save.
import { useRef, useState, type FormEvent } from "react";
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
import { EPUB_MAX_BYTES, PDF_MAX_BYTES, type IngestionFailureReason } from "./types";

type IngestStatus = "idle" | "submitting" | "success" | "error";

/**
 * mapReasonToCopy — D7-04 honest-failure copy mapping. Every
 * IngestionFailureReason from the 20-reason catalog (07-02 + Phase 11
 * Pattern 7 + Phase 12) is mapped to a calm DOC-06 phrase. NEVER surfaces
 * internal jargon (fixture/Zod/schema/revision/enum hyphenation) — the
 * T-7-26 + T-11-04 mitigation. The phrases mirror the existing FixtureList +
 * ArticleView status-region vocabulary so the control feels native to the
 * rest of the reader.
 *
 * Exported (Phase 11 Plan 04) so tests/unit/pdf-copy.test.ts asserts the
 * five PDF entries against the EXACT 11-RESEARCH.md §Pattern 7 strings;
 * tests/unit/epub-copy.test.ts (Phase 12 Plan 03) pins the four EPUB
 * entries byte-for-byte at this same live exported surface.
 */
export function mapReasonToCopy(reason: IngestionFailureReason): string {
  switch (reason) {
    case "ssrf-blocked-scheme":
    case "ssrf-blocked-private-ip":
    case "ssrf-blocked-metadata":
      return "This address points somewhere the reader can't reach.";
    case "fetch-failed":
      return "Couldn't reach this page.";
    case "response-too-large":
      return "This page is too large.";
    case "unsupported-content-type":
      return "This page isn't an article.";
    case "extraction-unsupported":
    case "extraction-too-low-confidence":
    case "round-trip-anchor-failed":
      return "Couldn't reliably read this page.";
    case "pdf-unreadable":
      return "This PDF couldn't be opened — it may be corrupt or not a PDF.";
    case "pdf-encrypted":
      return "This PDF is password-protected, so its text can't be read.";
    case "pdf-scanned":
      return "This PDF looks like scanned images rather than text. An OCR tool could convert it first.";
    case "pdf-multi-column":
      return "This PDF has multiple text columns, and its reading order can't be reconstructed reliably yet.";
    case "pdf-too-large":
      return "This PDF is too long or too large to read here.";
    // Phase 12 (ING-05) — the four EPUB refusal reasons. Calm DOC-06
    // strings; pinned byte-for-byte by tests/unit/epub-copy.test.ts.
    case "epub-protected":
      return "This book is protected by DRM and cannot be added.";
    case "epub-unreadable":
      return "This file could not be read as an EPUB book.";
    case "epub-empty":
      return "No readable chapters were found in this book.";
    case "epub-too-large":
      return "This book is too large to add.";
    case "already-in-library":
      return "Already in your library.";
    case "server-error":
    default:
      return "Something went wrong. Try again.";
  }
}

/**
 * bytesToBase64 — binary→base64 for the PDF upload arm (ING-04). Converts
 * in 0x8000-element chunks (String.fromCharCode spread + btoa) so a
 * multi-MB PDF never hits the Function.prototype.apply / spread
 * call-stack limit — a one-shot String.fromCharCode(...bytes) on a 10MB
 * file throws RangeError. The server decodes the base64 back to bytes and
 * runs pdfToBlocks (server-only; unpdf never crosses into this bundle —
 * Pitfall 12).
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * IngestControl — minimal URL + paste-HTML control with a four-state
 * `.status` live region. Mounted above the article list in FixtureList.
 * On a successful ingest, the article lands in Dexie v3 and the reader is
 * navigated to #/article/<id> via `window.location.hash` — the existing
 * ArticleView opens it unchanged (the load-bearing invariant: the reader
 * cannot tell ingested from fixture).
 */
export function IngestControl() {
  const [urlValue, setUrlValue] = useState("");
  const [htmlValue, setHtmlValue] = useState("");
  const [status, setStatus] = useState<IngestStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // hasFile mirrors the file-input selection in React state so the submit
  // button's disabled flag re-evaluates after the OS file picker resolves.
  // (Reading `fileInputRef.current.files.length` directly in JSX would NOT
  // trigger a re-render after a pick — refs are not reactive — and the
  // button would stay disabled even after the reader selected a file.)
  const [hasFile, setHasFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * handleSubmit — shared submit handler for both forms. Picks the ingest
   * path based on `which`, runs the D7-07 dedupe-refuse check, and routes
   * every failure to a calm DOC-06 phrase.
   *
   * The success path navigates to #/article/<id>. The reader lands in
   * ArticleView unchanged — the load-bearing invariant.
   */
  async function handleSubmit(which: "url" | "paste") {
    setStatus("submitting");
    setMessage("Fetching article…");
    try {
      const result =
        which === "url"
          ? await ingestUrl(urlValue)
          : await ingestHtml(htmlValue);

      // D7-07 dedupe-refuse: check has() BEFORE save. If has returns true,
      // surface "Already in your library." and refuse the re-ingest (no
      // overwrite, no orphaned highlights).
      const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
      if (alreadyInLibrary) {
        setStatus("error");
        setMessage(mapReasonToCopy("already-in-library"));
        return;
      }

      await dexieLibrarySource.save(result.article);
      setStatus("success");
      // Navigation takes the user to ArticleView; no separate success copy
      // (clear the submitting message so the success render arm stays
      // quiet on this path).
      setMessage(null);
      window.location.hash = `#/article/${result.article.id}`;
    } catch (e) {
      setStatus("error");
      if (e instanceof IngestionError) {
        setMessage(mapReasonToCopy(e.reason));
      } else {
        // Catch-all: any non-IngestionError throw (network, JSON parse, an
        // unexpected client bug) surfaces as the generic server-error copy.
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
   * handleFileSubmit — the file-upload form (Plan 08-04, D8-15 + Phase 11
   * Plan 04, ING-04 + Phase 12 Plan 03, ING-05). Dispatch by extension:
   * `.md` → ingestMarkdown (forwards file.name so the server can run the
   * D8-17 title-fallback chain); `.pdf` → binary read + base64 →
   * ingestPdf (forwards file.name for the D11-07 title chain); `.epub` →
   * binary read + base64 → ingestEpub (the book path — book-level
   * hasBook/saveBook instead of the single-article has/save); else →
   * ingestHtml (no filename — htmlToBlocks derives title from
   * `<title>`/OpenGraph in the content).
   *
   * T-8-14 (DoS, content bomb) + T-11-02 + T-12-09: the client-side cap
   * is extension-aware and refuses BEFORE any read (Pitfall 7 — no network
   * cost, no arrayBuffer materialization). PDFs cap at PDF_MAX_BYTES with
   * the calm pdf-too-large copy; EPUBs cap at EPUB_MAX_BYTES with the calm
   * epub-too-large copy (the 11-04 earliest-enforcement pattern); `.md`/
   * `.html` keep the existing 5MB + "This page is too large." branch. The
   * server re-applies the content-length cap + decoded re-check
   * (defense-in-depth, 11-03 + 12-04).
   */
  async function handleFileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    const isPdf = /\.pdf$/i.test(file.name);
    const isEpub = /\.epub$/i.test(file.name);

    // Extension-aware client-side size cap (UI-SPEC §EXTENDED IngestControl
    // + T-8-14 + T-11-02 + T-12-09). Refused before ANY file read or POST —
    // the reader pays zero network cost for an over-cap pick. Each surface
    // is reused verbatim through mapReasonToCopy — zero new chrome.
    if (isPdf) {
      if (file.size > PDF_MAX_BYTES) {
        setStatus("error");
        setMessage(mapReasonToCopy("pdf-too-large"));
        return;
      }
    } else if (isEpub) {
      if (file.size > EPUB_MAX_BYTES) {
        setStatus("error");
        setMessage(mapReasonToCopy("epub-too-large"));
        return;
      }
    } else if (file.size > 5 * 1024 * 1024) {
      setStatus("error");
      setMessage(mapReasonToCopy("response-too-large"));
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
      // transaction (booksStore.saveBook), so a half-saved book is
      // impossible. No navigation yet — the book library surface lands in
      // 12-06; success surfaces as calm copy in the .status region, with
      // the D12-11 skip disclosure appended when skippedCount > 0.
      if (isEpub) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const b64 = bytesToBase64(bytes);
        const result = await ingestEpub(b64, file.name);

        if (await hasBook(result.book.id)) {
          setStatus("error");
          setMessage(mapReasonToCopy("already-in-library"));
          return;
        }

        await saveBook(result.book, result.articles);
        setStatus("success");
        let successCopy = "Book added to your library.";
        if (result.skippedCount > 0) {
          successCopy +=
            result.skippedCount === 1
              ? " 1 chapter could not be read."
              : ` ${result.skippedCount} chapters could not be read.`;
        }
        setMessage(successCopy);
        return;
      }

      const isMarkdown = /\.md$/i.test(file.name);
      let result: IngestionSuccess;
      if (isMarkdown) {
        result = await ingestMarkdown(await file.text(), file.name);
      } else if (isPdf) {
        // Binary read → chunked base64 → ingestPdf. Identical bytes produce
        // a pdf-<hash> id server-side, so re-uploading the same PDF hits the
        // D7-07 dedupe-refuse below (D11 id invariant).
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
        return;
      }

      await dexieLibrarySource.save(result.article);
      setStatus("success");
      // Navigation takes the user to ArticleView; no separate success copy
      // (clear the submitting message so the success render arm stays
      // quiet on this path).
      setMessage(null);
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
    }
  }

  const submitting = status === "submitting";

  return (
    <section aria-labelledby="ingest-heading" className="ingest-control">
      <h2 id="ingest-heading">Add an article</h2>

      <form onSubmit={handleUrlSubmit}>
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

      <form onSubmit={handlePasteSubmit}>
        <label htmlFor="ingest-paste">Paste HTML</label>
        <textarea
          id="ingest-paste"
          name="html"
          rows={4}
          placeholder="<article>…</article>"
          value={htmlValue}
          disabled={submitting}
          onChange={(e) => setHtmlValue(e.target.value)}
        />
        <button type="submit" disabled={submitting || htmlValue.length === 0}>
          Add pasted article
        </button>
      </form>

      {/* Plan 08-04 (D8-15) — third form: file upload. The .md branch forwards
          file.name through ingestMarkdown(text, file.name) so the server can
          apply the D8-17 title fallback chain. The .html branch calls
          ingestHtml(text) — htmlToBlocks derives title from content metadata,
          not filename. Phase 11 Plan 04 (ING-04) adds the .pdf arm: binary
          read → chunked base64 → ingestPdf(b64, file.name). Phase 12 Plan 03
          (ING-05) adds the .epub arm: binary read → chunked base64 →
          ingestEpub(b64, file.name) with the book-level dedupe-refuse +
          one-transaction saveBook path. T-8-14 + T-11-02 + T-12-09:
          extension-aware client-side cap refuses oversized files before any
          read (5MB for .md/.html, PDF_MAX_BYTES for .pdf, EPUB_MAX_BYTES
          for .epub). */}
      <form onSubmit={handleFileSubmit}>
        <label htmlFor="ingest-file">Upload a file</label>
        <p className="meta">Accepts .md, .html, PDF, and EPUB books</p>
        <input
          id="ingest-file"
          ref={fileInputRef}
          name="file"
          type="file"
          accept=".md,.html,.pdf,.epub"
          disabled={submitting}
          onChange={(e) => setHasFile(e.target.files !== null && e.target.files.length > 0)}
        />
        <button type="submit" disabled={submitting || !hasFile}>
          Add file
        </button>
      </form>

      {/* The .status live region mirrors FixtureList's existing surface
          (D7-04 — zero new chrome). Refusals + the submitting state
          announce here; single-article success navigates away (message
          nulled), while the Phase 12 book path STAYS on the list and
          surfaces its calm success copy + the D12-11 skip disclosure
          ("N chapters could not be read."). aria-atomic="true" so the SR
          re-announces the whole phrase on every change (not just the diff). */}
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
    </section>
  );
}
