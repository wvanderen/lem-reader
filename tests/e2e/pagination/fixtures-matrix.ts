// tests/e2e/pagination/fixtures-matrix.ts
// The corpus × viewport × typography enumeration Plan 04-05 iterates to prove
// PAGE-03 (exactly-once coverage / no overflow / canonical order / no
// duplication), PAGE-04 (termination), and PAGE-09 (fallback banner) across
// real browsers (chromium / firefox / webkit via playwright.config).
//
// Mirrors the typography-variant pattern in tests/e2e/calibration/fixtures-matrix.ts
// (TypographyVariant type + SAMPLED_MATRIX discipline), then adds the two
// pagination-specific axes:
//   - FIXTURES: the 6 canonical corpus articles bundled by src/fixtures/index.ts
//   - VIEWPORTS: 3 responsive cells covering small touch, tablet, and desktop
//
// Per 04-VALIDATION.md §Sampling Rate:
//   - After every plan wave: `npm run test:e2e -- --grep pagination` (3 engines)
//   - Before /gsd-verify-work: full Playwright corpus matrix
//   - Max feedback latency: ~6 minutes (e2e wave)
//
// The SAMPLED_TYPOGRAPHY subset retains the calibration matrix's drift-driver
// coverage (serif default + sans stress per Pitfall 5 + spacious stress per
// Pitfall 6 + a dyslexic compact stress for narrow-measure wrapping). It does
// NOT replace the calibration matrix — calibration runs independently against
// Pretext predictions; this matrix iterates the pagination invariants against
// DOM truth.
//
// FIXTURE IDs verified against src/fixtures/index.ts (Plan 01-03 curated corpus,
// D-01/D-02/D-03). Do NOT guess — confirm against the loader if the corpus
// ever expands.

import type { TypographyVariant } from "../calibration/fixtures-matrix";

/**
 * The 6 canonical corpus fixture IDs (D-01 genre matrix). Verified against
 * src/fixtures/index.ts — these are the slugs that #/article/<id> resolves.
 * Adding a fixture requires updating this array AND the e2e open-every-fixture
 * spec.
 */
export const FIXTURES: readonly string[] = [
  "essay-long-form",
  "figure-heavy",
  "footnote-academic",
  "list-reference",
  "technical-post",
  "unsupported-case",
] as const;

/** A single responsive viewport cell. height pairs with width for setViewportSize. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Three responsive viewport cells covering the supported reader surface:
 *   - small touch (360×640 — narrow phone; tests narrow-measure wrapping)
 *   - tablet      (768×1024 — portrait iPad; tests mid-range reflow)
 *   - desktop     (1024×800 — wide desktop; tests the calm 64ch default)
 */
export const VIEWPORTS: readonly Viewport[] = [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1024, height: 800 },
] as const;

/**
 * Three typography cells balancing coverage and CI runtime. Default is the
 * D-07 baseline; the two stress cells exercise drift drivers and edge cases:
 *   - serif/18/64/comfortable — D-07 default (baseline)
 *   - sans/22/72/spacious     — stress (system-ui Pitfall 5 + wordSpacing
 *                               Pitfall 6 + larger measure pushes wrap math)
 *   - dyslexic/16/52/compact  — stress (smallest size + narrowest measure +
 *                               tightest line-height; hardest wrapping case)
 *
 * Reuses TypographyVariant from tests/e2e/calibration/fixtures-matrix.ts so
 * the type contract is shared across the two harnesses.
 */
export const SAMPLED_TYPOGRAPHY: readonly TypographyVariant[] = [
  { font: "serif", size: 18, measure: 64, spacing: "comfortable" },
  { font: "sans", size: 22, measure: 72, spacing: "spacious" },
  { font: "dyslexic", size: 16, measure: 52, spacing: "compact" },
] as const;

/** A single corpus matrix cell: fixture × viewport × typography. */
export interface CorpusCell {
  fixture: string;
  viewport: Viewport;
  typography: TypographyVariant;
}

/**
 * The full corpus matrix enumeration: 6 fixtures × 3 viewports × 3 typography
 * cells = 54 cells. Each cell is one Playwright test execution across all 3
 * engines (chromium + firefox + webkit) — 162 engine-cell runs per invariant
 * spec. This is the PAGE-03 contract surface.
 *
 * Plan 04-05 iterates CORPUS_MATRIX inside the e2e scaffolds created by this
 * plan (coverage-invariant, no-overflow-invariant, termination, etc.). The
 * scaffolds ship with a sentinel assertion; Plan 04-05 fills the real
 * invariant assertions against CORPUS_MATRIX.forEach.
 */
export const CORPUS_MATRIX: readonly CorpusCell[] = (() => {
  const out: CorpusCell[] = [];
  for (const fixture of FIXTURES) {
    for (const viewport of VIEWPORTS) {
      for (const typography of SAMPLED_TYPOGRAPHY) {
        out.push({ fixture, viewport, typography });
      }
    }
  }
  return out;
})();

/** Stable cell label for test titles / Playwright trace filenames. */
export function corpusCellKey(cell: CorpusCell): string {
  const t = cell.typography;
  return `${cell.fixture}@${cell.viewport.width}x${cell.viewport.height}-${t.font}-${t.size}-${t.spacing}-${t.measure}`;
}
