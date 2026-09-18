// src/routes/extractionNote.ts
// Issue #41 (flow N6) — the low-confidence disclosure, the reader-visible
// surface for the persisted `ingestionMeta.extractionConfidence` signal
// (server/confidence.ts + the ingest-time ASR floor in server/ingest.ts).
// Until now that signal rode the article record without a reader face; ASR
// transcript ingests made it a silent no-op. Keying on the MODEL field (not
// on youtube-ness) keeps the surface honest for every low-confidence
// producer — an ASR transcript is never silently upgraded to trusted.
//
// PURE derivation (the effectiveMetadata.ts discipline): zero React, zero
// I/O — ArticleView owns the render, this module owns the copy policy.
// Undefined is the empty state (confidence "high" or no ingestion meta) —
// silence, never a placeholder.
import type { CanonicalArticle } from "../content/types";

/**
 * extractionNote — the calm fidelity note for an article, or undefined when
 * nothing needs disclosing (confidence "high", or no ingestionMeta — bundled
 * fixtures). ASR-sourced transcripts get the caption-specific wording; every
 * other low-confidence extraction gets the generic one. Never jargon: the
 * reader never sees "extractionConfidence", "ASR", or internal reason codes.
 */
export function extractionNote(article: CanonicalArticle): string | undefined {
  const meta = article.ingestionMeta;
  if (!meta || meta.extractionConfidence !== "low") return undefined;
  if (meta.transcript?.captionSource === "asr") {
    return "Transcribed from auto-generated captions, so the wording may not be exact.";
  }
  return "This article may be incomplete or inaccurate — it could not be read reliably.";
}
