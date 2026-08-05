// tests/e2e/calibration/fixtures-matrix.ts
// The typography matrix the calibration harness iterates. PAGE-08 evidence
// must cover the drift drivers (RESEARCH §Common Pitfalls 5 + 6):
//   - Pitfall 5: Pretext README warns `system-ui` (the head of our `sans`
//     FONT_STACK) is unsafe for layout() on macOS. Sans MUST be measured.
//   - Pitfall 6: Pretext `prepare()` accepts letterSpacing (px) but NOT
//     wordSpacing; the spacious preset writes wordSpacing 0.05em.
//     Spacious MUST be measured.
//
// Coverage mandate: EVERY font × spacing cell (3 fonts × 3 spacings = 9
// baseline cells) is represented. The full matrix (3 × 5 × 3 × 4 = 180
// variants) is available as TYPOGRAPHY_MATRIX; the CI-friendly SAMPLED_MATRIX
// retains full font × spacing coverage but samples size × measure for speed
// (RESEARCH §Calibration Matrix L591 — "planner MAY sample a representative
// subset if too slow for CI, but MUST cover every font × spacing combination").
//
// Each variant is a valid ReaderSettings-shaped patch (closed sets from
// src/settings/tokens.ts). The harness merges these with a default settings
// object before applying them to a fixture.

import type { ReaderSettings } from "../../../src/content/schema";

type FontKey = ReaderSettings["font"];
type SizeStep = ReaderSettings["size"];
type MeasureStep = ReaderSettings["measure"];
type SpacingKey = ReaderSettings["spacing"];

export interface TypographyVariant {
  font: FontKey;
  size: SizeStep;
  measure: MeasureStep;
  spacing: SpacingKey;
}

const FONTS: readonly FontKey[] = ["serif", "sans", "dyslexic"];
const SIZES_FULL: readonly SizeStep[] = [16, 18, 20, 22, 24];
const MEASURES_FULL: readonly MeasureStep[] = [52, 58, 64, 72];
const SPACINGS: readonly SpacingKey[] = ["compact", "comfortable", "spacious"];

// CI-friendly sampled steps (RESEARCH Open Question A2 — full matrix may be
// too slow for CI; sampled steps retain representativeness).
const SIZES_SAMPLED: readonly SizeStep[] = [18, 22];
const MEASURES_SAMPLED: readonly MeasureStep[] = [58, 72];

/** Cartesian product helper. */
function cartesian<F, S, T, U>(
  fs: readonly F[],
  ss: readonly S[],
  ts: readonly T[],
  us: readonly U[],
): Array<[F, S, T, U]> {
  const out: Array<[F, S, T, U]> = [];
  for (const f of fs) for (const s of ss) for (const t of ts) for (const u of us) out.push([f, s, t, u]);
  return out;
}

/**
 * The full typography matrix: 3 fonts × 5 sizes × 3 spacings × 4 measures
 * = 180 variants. Used for the comprehensive (slow) calibration run.
 */
export const TYPOGRAPHY_MATRIX: readonly TypographyVariant[] = cartesian(
  FONTS,
  SIZES_FULL,
  SPACINGS,
  MEASURES_FULL,
).map(([font, size, spacing, measure]) => ({
  font,
  size,
  spacing,
  measure,
}));

/**
 * CI-friendly sampled matrix: 3 fonts × 2 sizes × 3 spacings × 2 measures
 * = 36 variants. Retains full font × spacing coverage (Pitfalls 5 + 6
 * mandate). The harness defaults to this; set LEM_FULL_CALIBRATION=1 in
 * the env to use TYPOGRAPHY_MATRIX instead.
 */
export const SAMPLED_MATRIX: readonly TypographyVariant[] = cartesian(
  FONTS,
  SIZES_SAMPLED,
  SPACINGS,
  MEASURES_SAMPLED,
).map(([font, size, spacing, measure]) => ({
  font,
  size,
  spacing,
  measure,
}));

/**
 * The active matrix for the harness run. Override via LEM_FULL_CALIBRATION=1
 * to use the full 180-variant matrix.
 */
export const ACTIVE_MATRIX: readonly TypographyVariant[] = process.env
  .LEM_FULL_CALIBRATION
  ? TYPOGRAPHY_MATRIX
  : SAMPLED_MATRIX;

/**
 * Default ReaderSettings the harness merges each variant into (theme is
 * orthogonal to measurement — calibration does not vary it).
 */
export const DEFAULT_CALIBRATION_SETTINGS: ReaderSettings = {
  schemaVersion: 1,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
};

/** Merge a variant patch into the default settings. */
export function settingsForVariant(
  v: TypographyVariant,
): ReaderSettings {
  return { ...DEFAULT_CALIBRATION_SETTINGS, ...v };
}

/** A stable variant key for fingerprint row labeling (e.g. "serif-18-comfortable-58"). */
export function variantKey(v: TypographyVariant): string {
  return `${v.font}-${v.size}-${v.spacing}-${v.measure}`;
}
