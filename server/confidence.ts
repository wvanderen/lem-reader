// server/confidence.ts
// The ING-06 confidence model. Derives the extraction outcome state from the
// article's block tree + a Readability pre-check signal. Locked formula from
// 07-RESEARCH.md §Confidence Thresholds L529-546 + 07-CONTEXT.md
// `<decisions>` L44, reshaped by ADR-0003 (reading-first ingestion):
//   - isProbablyReaderable false           → low ("page-not-readerable") — flagged, never refused
//   - unsupportedBlockRatio > 0.4          → low ("high-unsupported-ratio") [Pitfall 1]
//   - blockCount >= 3 && textLength >= 500 → confident (matches Readability charThreshold)
//   - else                                 → low ("extraction-thin")
//
// ADR-0003: the "unsupported" state is GONE. Readability's pre-check is no
// longer a veto — a page it dislikes still gets extracted (the zero-block
// guard in server/ingest.ts handles the truly-empty case), and its weak
// readability signal downgrades confidence to "low" so the article enters
// the library flagged with the reader-visible note. Readable text is never
// refused for being imperfect.
//
// Pitfall 2 honored: textLength is computed via the SHARED normalizeText
// (src/content/normalizeText.ts) — never a fork. Forking would silently
// orphan every annotation anchor. The IngestionMetaSchema.extractionConfidence
// field persists only "high" | "low" (07-02).
import type { CanonicalArticle } from "../src/content/schema";
import { normalizeText } from "../src/content/normalizeText";

/** ConfidenceResult — the derived two-state outcome. `reason` is present on
 * the `low` variant; the `confident` variant carries no reason. */
export interface ConfidenceResult {
  state: "confident" | "low";
  reason?: string;
}

/** Inputs to deriveConfidence. `isReaderable` is Readability's cheap
 * isProbablyReaderable() pre-check (a negative signal — a page Readability
 * dislikes is admitted flagged low, never refused per ADR-0003). Future
 * calibration may add textToContentRatio / linkDensity here. */
export interface ConfidenceSignals {
  isReaderable: boolean;
}

/** The unsupported-block ratio above which extraction is flagged low-confidence
 * even if blockCount + textLength would otherwise pass (Pitfall 1 — a high
 * unsupported ratio means extraction grabbed chrome, not article body). */
const HIGH_UNSUPPORTED_RATIO = 0.4;

/** The minimum block count for a confident extraction (title + 2 paragraphs). */
const MIN_CONFIDENT_BLOCKS = 3;

/** The minimum normalized-text length for a confident extraction. Matches
 * Readability's own charThreshold:500 default (07-RESEARCH.md L538). */
const MIN_CONFIDENT_TEXT_LENGTH = 500;

/**
 * deriveConfidence — the two-state formula (ADR-0003). Pure function; no I/O.
 * Call sites: /server/ingest.ts orchestrator (07-05) runs this AFTER extraction
 * + sanitize to stamp the article confident or low — both enter the library;
 * low surfaces the reader-visible fidelity note (ING-06, DOC-06 copy).
 */
export function deriveConfidence(
  article: CanonicalArticle,
  signals: ConfidenceSignals,
): ConfidenceResult {
  // 1. Readability pre-check — a negative signal, not a veto (ADR-0003).
  if (!signals.isReaderable) {
    return { state: "low", reason: "page-not-readerable" };
  }

  // 2. Compute the three signals. textLength via the SHARED normalizer
  // (Pitfall 2 — no fork). unsupportedRatio = fraction of blocks that fell
  // through to UnsupportedBlock during the DOM walk.
  const blockCount = article.blocks.length;
  const textLength = normalizeText(article).length;
  const unsupportedCount = article.blocks.filter((b) => b.kind === "unsupported").length;
  const unsupportedRatio = unsupportedCount / Math.max(1, blockCount);

  // 3. Pitfall 1 — high unsupported ratio means extraction grabbed chrome.
  // Checked BEFORE the block/text threshold so a 50%-unsupported extraction
  // is flagged low even if it technically has enough text.
  if (unsupportedRatio > HIGH_UNSUPPORTED_RATIO) {
    return { state: "low", reason: "high-unsupported-ratio" };
  }

  // 4. Confident threshold (RESEARCH.md L538 — matches Readability charThreshold:500).
  if (blockCount >= MIN_CONFIDENT_BLOCKS && textLength >= MIN_CONFIDENT_TEXT_LENGTH) {
    return { state: "confident" };
  }

  // 5. Readerable but thin — honest low-confidence.
  return { state: "low", reason: "extraction-thin" };
}
