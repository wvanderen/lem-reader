// server/confidence.ts
// Plan 07-03 Task 2 — the ING-06 three-state confidence model. Derives the
// extraction outcome state from the article's block tree + a Readability
// pre-check signal. Locked formula from 07-RESEARCH.md §Confidence Thresholds
// L529-546 + 07-CONTEXT.md `<decisions>` L44:
//   - isProbablyReaderable false           → unsupported ("page-not-readerable")
//   - unsupportedBlockRatio > 0.4          → low ("high-unsupported-ratio") [Pitfall 1]
//   - blockCount >= 3 && textLength >= 500 → confident (matches Readability charThreshold)
//   - else                                 → low ("extraction-thin")
//
// Pitfall 2 honored: textLength is computed via the SHARED normalizeText
// (src/content/normalizeText.ts) — never a fork. Forking would silently
// orphan every annotation anchor. The IngestionMetaSchema.extractionConfidence
// field persists only "high" | "low" (07-02); the "unsupported" state is
// refused upstream (never reaches persistence) — surfaced to the client as
// IngestionFailureReason "extraction-unsupported".
//
// The empirical corpus calibration (RESEARCH.md L544-546) is OUT OF SCOPE for
// this plan — ship the locked formula; the calibration harness is a later
// enhancement, not a phase-exit gate.
import type { CanonicalArticle } from "../src/content/schema";
import { normalizeText } from "../src/content/normalizeText";

/** ConfidenceResult — the derived three-state outcome. `reason` is present on
 * the `unsupported` and `low` variants (mapped to a status phrase by the
 * client); the `confident` variant carries no reason. */
export interface ConfidenceResult {
  state: "confident" | "low" | "unsupported";
  reason?: string;
}

/** Inputs to deriveConfidence. `isReaderable` is Readability's cheap
 * isProbablyReaderable() pre-check (a strong negative signal — if even
 * Readability won't attempt it, we refuse). Future calibration may add
 * textToContentRatio / linkDensity here. */
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
 * deriveConfidence — the locked three-state formula. Pure function; no I/O.
 * Call sites: /server/ingest.ts orchestrator (07-05) runs this AFTER extraction
 * + sanitize to decide whether to surface the article (confident/low) or
 * refuse it (unsupported). The client (07-06) maps state+reason to a calm
 * DOC-06 status phrase (D7-04).
 */
export function deriveConfidence(
  article: CanonicalArticle,
  signals: ConfidenceSignals,
): ConfidenceResult {
  // 1. Readability pre-check — the cheapest strong negative signal.
  if (!signals.isReaderable) {
    return { state: "unsupported", reason: "page-not-readerable" };
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
