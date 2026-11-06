// src/reader/paginationFailure.ts
// Issue #240 — the ONE validated classifier from pagination diagnostics to
// reader-facing failure explanations. The engine (fragment.ts), the
// post-render overflow guard (overflowGuard.ts), the windowed adapter
// (WindowedPaginatedSurface.tsx), and the measurement layer (engine.ts)
// each emit typed diagnostic events; ArticleView's banner subscription is
// the only consumer, and this module is the only place an event becomes
// reader copy — a generic banner can never infer a cause again
// (long-work plan §5: "Replace the generic pagination banner's inference
// with typed reasons").
//
// The TWO reader-facing classes (issue #240 — never conflated):
//   unpageable-content — a genuine content limit: an element too large for
//     one page, an element that cannot be divided at a legal boundary, or a
//     one-pass length limit. The calm way forward is the disclosed,
//     reversible session flip to scrolling at the same passage
//     (flipsToScrolling: true — the flip is DISCLOSED by the banner copy and
//     reversed by the reader's Switch-to-pages action; the persisted
//     preference is never written, T-04-15).
//   processing-error — the reader's own pipeline failed (zero-progress
//     stall, capacity continuation the adapter cannot refine, a measurement
//     scope mismatch, an unexpected exception). Modes are NOT flipped: the
//     selected mode is never silently abandoned for a failure that retry may
//     resolve; the banner offers retry + explicit scrolling escape routes.
//
// Honesty rules enforced here (GLOSSARY + UI-SPEC):
//   - Diagnostic fields are NEVER rendered raw (T-04-14): the measurement
//     error message and unknown reason strings never reach reader copy.
//     An unknown/absent reason classifies as a processing error — the one
//     honest answer when the cause is not validated, never an inferred
//     content limit.
//   - Copy is static per reason family (the map below); the echoed `reason`
//     is always the validated vocabulary, for diagnostics only.
//   - Length/capacity continuation is NOT a failure: the engine returns it
//     as status "ok" + continuation and this module is never consulted
//     (asserted in the e2e capacity-continuation coverage).
//
// V5 (Input Validation): the output is a Zod schema (PaginationFailureSchema)
// and the input is re-validated by the DiagnosticBus contract — consumers
// treat the returned failure as trusted static copy.
import { z } from "zod";
import type { DiagnosticEvent } from "../measurement/types";

/** The validated vocabulary of pagination failure reasons (issue #240). */
export const PAGINATION_FAILURE_REASONS = [
  // Engine guards (fragment.ts PAGE-04).
  "oversized-block",
  "page-ceiling",
  "zero-progress",
  "unsplittable-block-overflow",
  "measurement-scope-mismatch",
  // Post-render overflow guard (overflowGuard.ts).
  "overflow-page-ceiling",
  "overflow-atomic-too-tall",
  "overflow-no-progress",
  "overflow-no-legal-split",
  // Windowed adapter (WindowedPaginatedSurface.tsx).
  "unsupported-capacity-continuation",
  // PaginatedSurface's unexpected-exception catch (issue #240 — no silent
  // garbage: an unexpected crash emits a diagnostic instead of a blank page).
  "unexpected-pagination-error",
] as const;
export type PaginationFailureReason = (typeof PAGINATION_FAILURE_REASONS)[number];

export const PaginationFailureClassSchema = z.enum(["unpageable-content", "processing-error"]);
export type PaginationFailureClass = z.infer<typeof PaginationFailureClassSchema>;

export const PaginationFailureSchema = z.object({
  /** The two reader-facing failure classes — never conflated (issue #240). */
  failureClass: PaginationFailureClassSchema,
  /** The validated reason behind the classification (diagnostics only — never rendered raw). */
  reason: z.string(),
  /** Static calm heading naming the specific limit or failure. */
  heading: z.string(),
  /** Static body copy with the honest state and the way forward. */
  body: z.string(),
  /** Static sentence the one polite status region announces on appearance. */
  announce: z.string(),
  /**
   * True when the calm way forward includes the disclosed, reversible
   * session flip to scrolling (unpageable content). Processing errors keep
   * the reader in their selected mode — retry may resolve them.
   */
  flipsToScrolling: z.boolean(),
});
export type PaginationFailure = z.infer<typeof PaginationFailureSchema>;

/** Unpageable-content families: the heading names the SPECIFIC content limit. */
const UNPAGEABLE_COPY: Record<string, string> = {
  "oversized-block": "An element in this article is too large to fit on one page.",
  "overflow-atomic-too-tall": "An element in this article is too large to fit on one page.",
  "unsplittable-block-overflow": "An element in this article can't be divided across pages.",
  "overflow-no-legal-split": "An element in this article can't be divided across pages.",
  "page-ceiling": "This article is too long to prepare as pages in one pass.",
  "overflow-page-ceiling": "This article is too long to prepare as pages in one pass.",
};

const UNPAGEABLE_BODY =
  "Switched to scrolling so you can keep reading. You can switch back to pages anytime.";
const UNPAGEABLE_ANNOUNCE = "Switched to scrolling reading.";

const PROCESSING_HEADING = "Preparing this article as pages didn't finish.";
const PROCESSING_BODY =
  "Something went wrong while preparing pages. Your reading position is safe.";
const PROCESSING_ANNOUNCE = "Preparing pages failed. You can try again or read in scrolling.";

const unpageable = (reason: PaginationFailureReason): PaginationFailure => ({
  failureClass: "unpageable-content",
  reason,
  heading: UNPAGEABLE_COPY[reason]!,
  body: UNPAGEABLE_BODY,
  announce: UNPAGEABLE_ANNOUNCE,
  flipsToScrolling: true,
});

const processing = (reason: string): PaginationFailure => ({
  failureClass: "processing-error",
  reason,
  heading: PROCESSING_HEADING,
  body: PROCESSING_BODY,
  announce: PROCESSING_ANNOUNCE,
  flipsToScrolling: false,
});

const PROCESSING_REASONS: ReadonlySet<string> = new Set([
  "zero-progress",
  "overflow-no-progress",
  "unsupported-capacity-continuation",
  "measurement-scope-mismatch",
  "unexpected-pagination-error",
]);

/**
 * Classify one diagnostic event into the reader-facing failure explanation.
 *
 * Returns null for events that are not reader-visible pagination failures
 * (measurement chatter stays invisible — D3-04). Known unpageable-content
 * reasons get their specific heading; everything else — a processing
 * reason, a future unknown guard, an absent reason — classifies honestly as
 * a processing error. Never throws on unknown input: an unrecognized event
 * kind yields null (the bus already validated the shape).
 */
export function classifyPaginationFailure(event: DiagnosticEvent): PaginationFailure | null {
  if (event.kind === "measurement-error") {
    // The message is diagnostic-only (never rendered — T-04-14); the class
    // copy is static.
    return processing("measurement-error");
  }
  if (event.kind !== "dom-fallback") return null;
  const reason = event.reason ?? "";
  if (reason in UNPAGEABLE_COPY) {
    return unpageable(reason as PaginationFailureReason);
  }
  // Known processing reasons AND unknown/absent ones — the honest class when
  // the cause is not validated (no inferred content limit). The echoed
  // reason never carries raw input: the diagnostic trail already holds the
  // original event, and this object must stay safe to inspect.
  return processing(PROCESSING_REASONS.has(reason) ? reason : "unrecognized");
}
