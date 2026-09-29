// src/routes/extractionNote.ts
// Issue #41 (flow N6) — the low-confidence disclosure, the reader-visible
// surface for the persisted `ingestionMeta.extractionConfidence` signal
// (server/confidence.ts + the ingest-time ASR floor in server/ingest.ts).
// Until now that signal rode the article record without a reader face; ASR
// transcript ingests made it a silent no-op. Keying on the MODEL field (not
// on youtube-ness) keeps the surface honest for every low-confidence
// producer — an ASR transcript is never silently upgraded to trusted.
//
// ADR-0003 extends this module into the note-copy policy for ALL flagged
// admissions: partial content (extractionWarnings) and degraded annotations
// (annotationsDegraded) get their sentences here too. TWO render surfaces
// compose from these derivations: ArticleView owns the reader-view render
// (including the "See the original." link from provenance.sourceUrl), and
// since issue #112 the Add dialog's saved-result card composes the SAME
// sentences from the addToLibrary outcome payload (its link JSX is that
// surface's structural twin — the dialog-grammar clone discipline, no
// shared component). This module owns the copy.
//
// PURE derivation (the effectiveMetadata.ts discipline): zero React, zero
// I/O. Undefined/empty is the empty state (confidence "high", no warnings,
// annotations reliable, or no ingestion meta) — silence, never a placeholder.
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
  if (meta.transcript?.captionSource === "pasted") {
    return "Transcript added by pasting the text manually, so it may differ from the video's captions.";
  }
  return "This article may be incomplete or inaccurate — it could not be read reliably.";
}

/** The sentence heading the partial-content disclosure when any
 * extractionWarning exists (ADR-0003). ArticleView appends the
 * "See the original." link when the article has a sourceUrl. */
export const PARTIAL_CONTENT_NOTE = "Some content could not be processed.";

/** partialContentWarnings — the per-part disclosure lines (image refusals,
 * unsupported parts, transcript warnings), or [] when nothing fell. */
export function partialContentWarnings(article: CanonicalArticle): string[] {
  return article.ingestionMeta?.extractionWarnings ?? [];
}

/** annotationsNote — the degraded-anchoring disclosure (ADR-0003): the
 * round-trip probe found ambiguous samples, so highlight anchoring may be
 * unreliable; the text itself is fully readable. */
export function annotationsNote(article: CanonicalArticle): string | undefined {
  return article.ingestionMeta?.annotationsDegraded === true
    ? "Highlights may be unreliable on this article."
    : undefined;
}
