// src/measurement/textMeasurer.ts
// TextMeasurer adapter — the SOLE import site of `@chenglou/pretext` in the
// codebase (RESEARCH §Recommended Project Structure L219–220; STACK.md
// "pin exact + wrap behind an adapter"). Mirrors the typed-seam discipline
// of `src/settings/applyTheme.ts` (single-purpose, Zod-validated input,
// header documenting the boundary).
//
// WHY AN ADAPTER:
//   - Pretext is pre-1.0 (pin exact 0.0.8); the adapter is the swap surface
//     if a future version changes the API. Every other module imports from
//     here, never from `@chenglou/pretext` directly.
//   - Pretext is canvas-measured text geometry; it has no DOM/Reflow cost.
//     `prepare()` does the canvas measurement once for a (text, font) pair
//     and caches the segment widths; `layout()` is PURE ARITHMETIC over the
//     cached widths — re-call `layout()` on every width change, do NOT
//     re-prepare for the same text+font (RESEARCH §Code Examples L466–469).
//
// SECURITY (V12 — RESEARCH §Security Domain):
//   - `@chenglou/pretext` is the only new dependency this phase adds. Pin is
//     EXACT (no caret/tilde) at 0.0.8 per STACK.md mandate.
//   - Verified via `npm view @chenglou/pretext scripts.postinstall` → empty
//     (no postinstall script; no network/filesystem side-effects at install).
//   - The CI fingerprint (Plan 02 Task 2, D3-10) detects behavioral drift
//     even if the published package is later mutated.
//
// PITFALL DEFENSES (encoded as comments at the relevant call sites):
//   - Pitfall 5 (RESEARCH §Common Pitfalls 5): Pretext README warns that
//     `system-ui` is unsafe for `layout()` accuracy on macOS. The `sans`
//     FONT_STACK (src/settings/tokens.ts) starts with `system-ui`. The
//     calibration harness (Plan 02 Task 2) MUST measure `sans` and may
//     legitimately mark sans ineligible per kind — this is the per-kind
//     gate's D3-01 purpose, not a workaround.
//   - Pitfall 6: Pretext `prepare()` accepts ONLY `letterSpacing` (px), NOT
//     `wordSpacing`. The `spacious` preset (tokens.ts) writes
//     `wordSpacing: "0.05em"` — this is unmodeled here. The calibration
//     matrix MUST include the spacious preset; if it drifts outside
//     tolerance the per-kind gate marks the kind ineligible under spacious.
//   - Pitfall 7: Headings have HARDCODED geometry independent of the
//     `--font-size` / `--line-height` custom properties (src/app.css L142–
//     153). The adapter derives `font` + `lineHeight` PER KIND via
//     `fontStringFor()` — body geometry for paragraphs, hardcoded heading
//     geometry for headings. See HEADING_GEOMETRY below.
import {
  layout,
  layoutWithLines,
  prepare,
  prepareWithSegments,
} from "@chenglou/pretext";
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "../settings/tokens";

// ── Heading geometry (Pitfall 7 — src/app.css L142–153) ─────────────────────
// Hardcoded literal geometry; the body rule (L135–141) consumes
// --font-size/--line-height but headings do NOT — they have their own
// font-size/line-height/font-weight. h1 = 32px/1.2/600; h2–h4 = 22px/1.3/600.
// app.css does not declare h5/h6 explicitly — they fall back to the browser
// default (which is roughly the h4 size); we treat them as the h2–h4 band
// for measurement (the corpus only emits h1..h4 — D-04 fixtures).
//
// The literals "32px", "1.2", "22px", "1.3", "600" appear here verbatim so
// the Pitfall 7 acceptance grep finds them in the adapter that owns them.
export const HEADING_GEOMETRY = {
  1: { sizePx: 32, lineHeight: 1.2, weight: 600 },
  2: { sizePx: 22, lineHeight: 1.3, weight: 600 },
  3: { sizePx: 22, lineHeight: 1.3, weight: 600 },
  4: { sizePx: 22, lineHeight: 1.3, weight: 600 },
  5: { sizePx: 22, lineHeight: 1.3, weight: 600 },
  6: { sizePx: 22, lineHeight: 1.3, weight: 600 },
} as const;

/** Canvas font shorthand inputs needed for measurement. */
export interface FontGeometry {
  /** Canvas font shorthand string, e.g. "400 18px Georgia, serif". */
  font: string;
  /** Resolved line-height in pixels (size × lineHeight-multiplier). */
  lineHeightPx: number;
}

/**
 * Derive the canvas `font` shorthand + lineHeight PER KIND. Paragraphs use
 * body geometry derived from `settings.size` + the active spacing preset's
 * lineHeight multiplier; headings use the HARDCODED HEADING_GEOMETRY
 * (Pitfall 7). The font family still tracks `settings.font` so the reader's
 * chosen family is measured.
 *
 * @param kind "paragraph" or "heading"
 * @param level heading level 1–6 (ignored for paragraphs)
 * @param settings the active ReaderSettings (font family + body size + spacing)
 */
export function fontStringFor(
  kind: "paragraph" | "heading",
  level: 1 | 2 | 3 | 4 | 5 | 6,
  settings: ReaderSettings,
): FontGeometry {
  const family = FONT_STACKS[settings.font];
  if (kind === "heading") {
    const g = HEADING_GEOMETRY[level];
    // Canvas font shorthand: "<weight> <size px> <family stack>".
    // The hardcoded "32px"/"22px" sizes + "1.2"/"1.3" line-heights + "600"
    // weight come from app.css L142–153 (Pitfall 7).
    return {
      font: `${g.weight} ${g.sizePx}px ${family}`,
      lineHeightPx: g.sizePx * g.lineHeight,
    };
  }
  // Paragraph: body geometry from the size knob + the spacing preset's
  // lineHeight multiplier (compact 1.4 / comfortable 1.6 / spacious 1.8).
  const lineHeightMultiplier = SPACING_PRESETS[settings.spacing].lineHeight;
  return {
    font: `400 ${settings.size}px ${family}`,
    lineHeightPx: settings.size * lineHeightMultiplier,
  };
}

/** Args shared by both measurement functions. */
export interface MeasureArgs {
  text: string;
  /** Canvas font shorthand (from `fontStringFor`). */
  font: string;
  /** Letter spacing in pixels (from the spacing preset's letterSpacing CSS). */
  letterSpacingPx: number;
  /** Line height in pixels (from `fontStringFor`). */
  lineHeightPx: number;
  /** Content-box max width in pixels (the rendered block's inline-size). */
  maxWidthPx: number;
}

/**
 * Measure a paragraph-like block: predicted height + line count.
 *
 * Calls `prepare(text, font, { letterSpacing })` once (canvas measurement +
 * segment-width cache), then `layout(prepared, maxWidthPx, lineHeightPx)`.
 * `layout` is PURE ARITHMETIC over cached widths — no reflow — so re-layout
 * at a new width is cheap. Do NOT re-prepare for the same text+font pair
 * (RESEARCH §Code Examples L466–469).
 */
export function measureParagraphHeight(args: MeasureArgs): {
  height: number;
  lineCount: number;
} {
  const prepared = prepare(args.text, args.font, {
    letterSpacing: args.letterSpacingPx,
  });
  const result = layout(prepared, args.maxWidthPx, args.lineHeightPx);
  return { height: result.height, lineCount: result.lineCount };
}

/**
 * Measure a paragraph-like block WITH predicted line-break positions.
 *
 * Uses `prepareWithSegments` (segments retained) + `layoutWithLines` so each
 * returned line carries its text + width. Calibration needs this for the
 * D3-02 break-position fidelity metric; Phase 4 pagination will need it for
 * page-boundary decisions.
 *
 * NOTE: Pretext's `LayoutCursor` is `{ segmentIndex, graphemeIndex }`, NOT a
 * raw string offset. Phase 4 maps these back to the D-05 grapheme substrate
 * (src/content/normalizeText.ts). Phase 3 only needs height + break
 * COUNT/POSITION for calibration (RESEARCH §Code Examples L485–488).
 */
export function measureParagraphWithBreaks(args: MeasureArgs): {
  height: number;
  lineCount: number;
  lines: { text: string; width: number }[];
} {
  const prepared = prepareWithSegments(args.text, args.font, {
    letterSpacing: args.letterSpacingPx,
  });
  const result = layoutWithLines(prepared, args.maxWidthPx, args.lineHeightPx);
  return {
    height: result.height,
    lineCount: result.lineCount,
    lines: result.lines.map((l) => ({ text: l.text, width: l.width })),
  };
}
