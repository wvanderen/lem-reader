// src/measurement/types.ts
// Zod-at-boundary source of truth for the Phase 3 measurement domain
// (mirrors src/content/schema.ts discipline; `import type` is mandatory
// under tsconfig `verbatimModuleSyntax: true`). These schemas flow into the
// engine, the diagnostic bus, and Phase 4's PAGE-09 surfacing UI — so every
// type is a Zod schema and inferred TS types are the single source of truth
// (never hand-write a parallel type for these non-recursive shapes).
//
// Security (V5 Input Validation): DiagnosticEvent is consumed by Phase 4's
// reader-facing UI, so an unvalidated shape is an injection surface. Zod-
// validate at emit AND consume (DiagnosticBus.emit enforces parse). The 6
// kinds are defined now even though Plan 01 only emits the staleness/error
// pair — Phase 4 extends EMISSION, not the SHAPE (D3-05).
import { z } from "zod";

// ── Constraints: a snapshot of what a measurement was computed against ──────
// Reuses the exact closed sets from src/settings/tokens.ts so Constraints
// cannot drift from ReaderSettings. viewportWidthPx + lang come from the
// rendered <article> (its content-box width + its `lang` attribute). These
// are the inputs that, if changed, invalidate every prior measurement.

export const ConstraintsSchema = z.object({
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([
    z.literal(16),
    z.literal(18),
    z.literal(20),
    z.literal(22),
    z.literal(24),
  ]),
  measure: z.union([
    z.literal(52),
    z.literal(58),
    z.literal(64),
    z.literal(72),
  ]),
  spacing: z.enum(["compact", "comfortable", "spacious"]),
  viewportWidthPx: z.number().positive(),
  lang: z.string().min(2),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

// ── Per-block DOM measurement output ────────────────────────────────────────
// heightPx is FRACTIONAL (getBoundingClientRect().height — never integer
// offsetHeight; RESEARCH §State of the Art). lineCount comes from
// Element.getClientRects().length (one DOMRect per CSS line box — MDN).
// kind is a free-form string here (the renderer-emitted element tag mapped
// to the Block kind name); the engine's chooseStrategy switch narrows the
// real strategy.
//
// Plan 04-06: lineBoxes captures every CSS line box of the block's text
// during the measurement DOM walk (single batched pass — Pitfall 2). The
// pagination engine consumes these pre-captured boxes instead of re-reading
// live DOM (PaginatedSurface replaces the full ArticleBody before the engine
// runs — pre-capture is the only source). The LineBoxSchema is the Zod
// source of truth; src/pagination/types.ts re-exports the inferred type.

export const LineBoxSchema = z.object({
  /** UTF-16 code-unit offset into the block's normalized text where this line begins. */
  charOffset: z.number(),
  /** Fractional top (px) of this line box from Range.getClientRects(). */
  topPx: z.number(),
  /** Fractional bottom (px) of this line box from Range.getClientRects(). */
  bottomPx: z.number(),
});
export type LineBox = z.infer<typeof LineBoxSchema>;

export const BlockMeasurementSchema = z.object({
  kind: z.string(),
  heightPx: z.number(),
  lineCount: z.number().int(),
  /**
   * Per-block CSS line boxes captured during the measurement DOM walk
   * (Plan 04-06). One LineBox per wrapped line of the block's text. Empty
   * for blocks with no text (figure/code/footnote). The pagination engine
   * consumes this as the pre-captured line-box source — it no longer re-reads
   * live DOM. Default [] keeps the schema permissive for any block kind that
   * legitimately has no text.
   */
  lineBoxes: z.array(LineBoxSchema).default([]),
});
export type BlockMeasurement = z.infer<typeof BlockMeasurementSchema>;

// ── MeasurementResult: the trusted view payload (PAGE-06) ───────────────────
// schemaVersion: z.literal(2) as of Plan 04-06 (lineBoxes added to
// BlockMeasurementSchema). v3+ forward-rejects (V5 preserved). MeasurementResult
// is an EPHEMERAL trusted view (never persisted to Dexie — STACK.md forbids
// persisting derived data), so the bump is a runtime contract marker only —
// NO Dexie migration. Existing v1 in-memory cached values are re-measured on
// the next read (the hook drops the trusted view on article swap).

export const MeasurementResultSchema = z.object({
  schemaVersion: z.literal(2),
  constraints: ConstraintsSchema,
  blocks: z.array(BlockMeasurementSchema),
  computedAt: z.string().datetime(),
});
export type MeasurementResult = z.infer<typeof MeasurementResultSchema>;

// ── EligibilityState: per-kind Pretext eligibility (Plan 02 seeds it) ───────
// Plan 01 ships DOM-only measurement so both eligible kinds default false;
// Plan 02's calibration fingerprint seeds these flags from the corpus.
// Rich/non-text kinds are DOM-measured by definition (STACK.md scope) and
// are NOT represented here.

export const EligibilityStateSchema = z.object({
  paragraph: z.object({ pretextEligible: z.boolean() }),
  heading: z.object({ pretextEligible: z.boolean() }),
});
export type EligibilityState = z.infer<typeof EligibilityStateSchema>;

// ── DiagnosticEvent: 6-kind discriminated union (D3-05) ─────────────────────
// Defined now in full so Phase 4 PAGE-09 extends emission, not the shape.
// Plan 01 emits only: late-epoch-drop, measurement-error.
// Plan 02 will emit:  drift-exceedance, dom-fallback, calibration-failure,
//                     runtime-guard-downgrade.
// Each variant carries `kind: z.literal(...)` as the discriminant + a
// shared `ts` ISO datetime. The variant-specific fields are required.

const tsField = z.string().datetime();

const DriftExceedanceEvent = z.object({
  kind: z.literal("drift-exceedance"),
  ts: tsField,
});

const DomFallbackEvent = z.object({
  kind: z.literal("dom-fallback"),
  ts: tsField,
});

const LateEpochDropEvent = z.object({
  kind: z.literal("late-epoch-drop"),
  captured: z.number(),
  current: z.number(),
  ts: tsField,
});

const CalibrationFailureEvent = z.object({
  kind: z.literal("calibration-failure"),
  ts: tsField,
});

const RuntimeGuardDowngradeEvent = z.object({
  kind: z.literal("runtime-guard-downgrade"),
  "kind-downgraded": z.string(),
  heightDriftPx: z.number(),
  ts: tsField,
});

const MeasurementErrorEvent = z.object({
  kind: z.literal("measurement-error"),
  message: z.string(),
  ts: tsField,
});

export const DiagnosticEventSchema = z.discriminatedUnion("kind", [
  DriftExceedanceEvent,
  DomFallbackEvent,
  LateEpochDropEvent,
  CalibrationFailureEvent,
  RuntimeGuardDowngradeEvent,
  MeasurementErrorEvent,
]);
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;
