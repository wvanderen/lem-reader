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
import { useState, type FormEvent } from "react";
import {
  ingestUrl,
  ingestHtml,
  IngestionError,
} from "./IngestionClient";
import { dexieLibrarySource } from "./LibrarySource";
import type { IngestionFailureReason } from "./types";

type IngestStatus = "idle" | "submitting" | "success" | "error";

/**
 * mapReasonToCopy — D7-04 honest-failure copy mapping. Every
 * IngestionFailureReason from the 11-reason catalog (07-02) is mapped to a
 * calm DOC-06 phrase. NEVER surfaces internal jargon (fixture/Zod/schema/
 * revision) — the T-7-26 mitigation. The phrases mirror the existing
 * FixtureList + ArticleView status-region vocabulary so the control feels
 * native to the rest of the reader.
 */
function mapReasonToCopy(reason: IngestionFailureReason): string {
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
    case "already-in-library":
      return "Already in your library.";
    case "server-error":
    default:
      return "Something went wrong. Try again.";
  }
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
      // Navigation takes the user to ArticleView; no separate success copy.
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

      {/* The .status live region mirrors FixtureList's existing surface
          (D7-04 — zero new chrome). Refusals + the submitting state
          announce here; success navigates away so no success copy is
          needed. aria-atomic="true" so the SR re-announces the whole
          phrase on every change (not just the diff). */}
      <div
        className="status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status === "submitting" && message !== null && <p>{message}</p>}
        {status === "error" && message !== null && <p>{message}</p>}
      </div>
    </section>
  );
}
