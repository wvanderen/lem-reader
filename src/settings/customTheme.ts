// src/settings/customTheme.ts
// The custom-theme color domain (issue #86, decision #73): one Custom slot,
// 5 reader-editable tokens, and SIX derived tokens that are never stored
// or edited. All math is pure and deterministic — the same token set always
// resolves to the same 11-color palette, in tests and in the browser.
//
// Derivation contract (decision #73, from the #86 build ticket):
//   --ink-soft         from ink — ink's hue/chroma, lightness walked toward
//                      the surface until the pair sits at ~6.5:1 (the preset
//                      ink-softs measure 7.02/7.26/8.06 — POLISH-11's
//                      placeholder pair); ≥ 4.5:1 AA holds by construction
//                      whenever the ink/surface pair itself is compliant.
//   --accent-hover     from accent — accent's hue, lightness moved AWAY from
//                      the surface (the presets darken on light surfaces,
//                      lighten on dark ones), slight chroma lift.
//   --focus-ring       from accent — the accent itself when it already
//                      clears 3:1 non-text contrast on the surface (WCAG
//                      1.4.11), else the accent's hue walked away from the
//                      surface until it clears 3.3:1. Visible focus on EVERY
//                      custom surface, by construction.
//   --highlight        from accent — accent's hue, calm chroma, lightness
//                      banded between the surface and the point where
//                      ink-on-fill drops to AA, so D5-14 (--ink on
//                      --highlight ≥ 4.5:1) holds by construction in custom
//                      themes.
//   --spoken-highlight from accent — the same compliant band, stepped
//                      deeper toward the AA boundary so the spoken marker
//                      stays shade-distinct from the annotation fill
//                      (issue #42) while D5-14 still holds.
//   --destructive      FIXED per the chosen surface's light/dark disposition
//                      (#9b2c2c light / #e07a7a dark — the preset literals).
//
// OKLCH stays internal (decision #73: "the reader never sees the term"):
// every resolved value is an sRGB hex string, so the contrast readout, the
// unit tests, and applyTheme's inline writes all speak plain hex.
//
// Security (the applyTheme.ts posture): these functions map validated hex
// tokens through closed math to hex output — no string reaches CSS that did
// not round-trip through the hex grammar.
import type { CustomTheme, CustomThemeTokens } from "../content/schema";

/** The three preset themes a custom theme can be seeded from / reset to. */
export type CustomBaseTheme = CustomTheme["baseTheme"];

/** The CSS custom properties applyTheme owns when theme === "custom". The
 * inline writes ARE the theme ([data-theme="custom"] overrides no tokens in
 * CSS); the SAME list is removed when leaving custom so the preset
 * [data-theme] blocks own the palette again. */
export const CUSTOM_COLOR_PROPS = [
  "--surface",
  "--surface-raised",
  "--ink",
  "--ink-soft",
  "--accent",
  "--accent-hover",
  "--focus-ring",
  "--destructive",
  "--hairline",
  "--highlight",
  "--spoken-highlight",
] as const;

export type CustomColorProp = (typeof CUSTOM_COLOR_PROPS)[number];

/** The resolved 11-token palette — CSS property name → sRGB hex. */
export type ResolvedCustomTheme = Record<CustomColorProp, string>;

/** The 5-token seeds, byte-matching the [data-theme] blocks in src/app.css.
 * Drift is pinned by tests/unit/settings/customTheme.test.ts (the
 * mirror.test.ts extraction-anchor discipline — a token change that forgets
 * this map fails there). */
export const PRESET_SEEDS: Record<CustomBaseTheme, CustomThemeTokens> = {
  sepia: {
    surface: "#fbf8f3",
    surfaceRaised: "#f2ede3",
    ink: "#1f1b16",
    accent: "#6b4423",
    hairline: "#d9d1c2",
  },
  light: {
    surface: "#fcfcfa",
    surfaceRaised: "#f4f4f0",
    ink: "#1a1a1a",
    accent: "#6b4423",
    hairline: "#ddd9d0",
  },
  dark: {
    surface: "#1b1814",
    surfaceRaised: "#26221c",
    ink: "#ede6d9",
    accent: "#c49a6c",
    hairline: "#3a3328",
  },
};

/** First Custom activation seeds from the then-active preset (decision #73:
 * no names, no library — one slot, re-seeded after a wholesale Reset). */
export function seedCustomTheme(base: CustomBaseTheme): CustomTheme {
  return { baseTheme: base, tokens: { ...PRESET_SEEDS[base] } };
}

// ── sRGB hex ↔ linear RGB ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  // Normalized [0–1] channels — every conversion below speaks unit space.
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear [0–1] channels → canonical lowercase "#rrggbb" (gamma re-encoded,
 * clamped to gamut — the derived chroma caps keep every value near-gamut). */
function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((c) => Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255)) as [
    number,
    number,
    number,
  ];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ── linear RGB ↔ OKLab (Björn Ottosson's reference matrices) ────────────────

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface OkLab {
  L: number;
  a: number;
  b: number;
}

function linearToOkLab([r, g, b]: [number, number, number]): OkLab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function okLabToLinear({ L, a, b }: OkLab): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

interface OkLch {
  L: number;
  C: number;
  h: number;
}

function hexToOkLch(hex: string): OkLch {
  const linear = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const { L, a, b } = linearToOkLab(linear);
  return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) };
}

function okLchToHex({ L, C, h }: OkLch): string {
  // Simple channel clamp on gamut overflow — the derived chroma caps keep
  // every value near-gamut, and marker fills tolerate clamping.
  return rgbToHex(okLabToLinear({ L, a: C * Math.cos(h), b: C * Math.sin(h) }));
}

// ── WCAG contrast ────────────────────────────────────────────────────────────

/** WCAG 2.x relative luminance of an sRGB hex color. */
export function relativeLuminance(hex: string): number {
  const linear = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG 2.x contrast ratio between two sRGB hex colors (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The light/dark disposition of a surface: which fixed destructive red
 * (and which "away from surface" direction) the derivations use. */
export function surfaceDisposition(surfaceHex: string): "light" | "dark" {
  return relativeLuminance(surfaceHex) > 0.5 ? "light" : "dark";
}

// ── Constants (each cited at its use site) ───────────────────────────────────

/** WCAG AA text minimum — the policed-pair threshold (decision #73). */
export const AA_TEXT_RATIO = 4.5;
/** WCAG 1.4.11 non-text minimum — the focus-ring guarantee. */
export const AA_NON_TEXT_RATIO = 3;
/** The margin "Fix contrast" targets: a hair over AA so engine rounding on
 * computed colors cannot re-land the pair under it. */
const FIX_TARGET_RATIO = 4.8;
const FOCUS_TARGET_RATIO = 3.3;
/** Ink-soft target: the preset ink-soft band (7.02/7.26/8.06:1 — POLISH-11's
 * placeholder pair); the walk stops before AA can be undercut. */
const INK_SOFT_TARGET = 6.5;
/** Max lightness travel for ink-soft (fraction of the ink→surface segment). */
const INK_SOFT_MAX_TRAVEL = 0.65;
/** Marker fills keep a calm chroma regardless of accent saturation (D5-14's
 * calm warm-marker spirit; the preset fills sit at ≤ ~0.09 chroma). */
const MARKER_CHROMA_CAP = 0.12;
/** Annotation/spoken fills: fractions of the surface→AA-boundary segment. */
const HIGHLIGHT_FRACTION = 0.35;
const SPOKEN_FRACTION = 0.6;
/** Accent-hover: lightness delta away from the surface + chroma lift. */
const HOVER_L_DELTA = 0.06;
const HOVER_CHROMA_LIFT = 1.05;
const MAX_CHROMA = 0.37;
/** Search resolution for the monotone lightness walks (deterministic). */
const SEARCH_STEPS = 40;
/** The fixed destructive reds (the preset literals, decision #73). */
const DESTRUCTIVE_LIGHT = "#9b2c2c";
const DESTRUCTIVE_DARK = "#e07a7a";

function clampL(L: number): number {
  return Math.min(1, Math.max(0, L));
}

/**
 * Re-lightness `hex` along its own hue/chroma, AWAY from `againstHex`'s
 * lightness, until `target` contrast is met. Contrast is monotone in
 * lightness at fixed hue/chroma, so BOTH directions are searched with a
 * deterministic bisect and the smallest passing travel wins (at equal
 * lightness — or on the wrong side of a mid surface — only one direction
 * can reach the target; when neither can, the higher-contrast extreme
 * returns: best effort, honest — the readout keeps reporting the live
 * ratio). Returns the original hex when it already passes — the reader may
 * keep a failing pair; fixes are always explicit.
 */
function walkAwayFrom(hex: string, againstHex: string, target: number): string {
  if (contrastRatio(hex, againstHex) >= target) return hex;
  const token = hexToOkLch(hex);
  const candidate = (dir: number, travel: number) =>
    okLchToHex({ ...token, L: clampL(token.L + dir * travel) });
  const walk = (dir: number): { hex: string; travel: number; ratio: number } | null => {
    const extreme = clampL(token.L + dir);
    const extremeRatio = contrastRatio(candidate(dir, Math.abs(extreme - token.L)), againstHex);
    if (extremeRatio < target) return null; // this direction cannot reach the target
    let lo = 0; // fails
    let hi = Math.abs(extreme - token.L); // passes
    for (let i = 0; i < SEARCH_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(candidate(dir, mid), againstHex) >= target) hi = mid;
      else lo = mid;
    }
    return {
      hex: candidate(dir, hi),
      travel: hi,
      ratio: contrastRatio(candidate(dir, hi), againstHex),
    };
  };
  const lighter = walk(1);
  const darker = walk(-1);
  if (lighter && darker) {
    return lighter.travel <= darker.travel ? lighter.hex : darker.hex;
  }
  if (lighter) return lighter.hex;
  if (darker) return darker.hex;
  // Neither direction reaches the target — the better extreme (honest).
  const lighterExtreme = candidate(1, Math.abs(clampL(token.L + 1) - token.L));
  const darkerExtreme = candidate(-1, Math.abs(token.L - clampL(token.L - 1)));
  return contrastRatio(lighterExtreme, againstHex) >= contrastRatio(darkerExtreme, againstHex)
    ? lighterExtreme
    : darkerExtreme;
}

/**
 * The two marker lightnesses, banded so ink-on-fill clears `target`
 * (D5-14 by construction). Compliant case: the fill band runs from the
 * surface TOWARD the ink side (contrast against ink falls monotonically as
 * the fill approaches ink's lightness); the bisect finds the AA boundary
 * and the annotation/spoken fills interpolate INSIDE the compliant segment.
 * Degenerate case: the surface ITSELF fails the target (a broken ink/
 * surface pair — the readout warns and the reader may keep it), so the
 * bisect walks AWAY from the ink side instead; the annotation fill takes
 * the closest compliant lightness and the spoken marker steps deeper into
 * the compliant region (contrast only grows — still compliant; and shade-
 * distinct from the annotation fill either way).
 */
function markerLightnessPair(
  surfaceL: number,
  inkHex: string,
  band: OkLch,
  target: number,
): { highlightL: number; spokenL: number } {
  const inkL = hexToOkLch(inkHex).L;
  const ratio = (L: number) => contrastRatio(inkHex, okLchToHex({ ...band, L }));
  if (ratio(surfaceL) >= target) {
    // Bisect the surface→ink segment for the LAST passing lightness
    // (invariant: lo passes, hi fails).
    let lo = surfaceL;
    let hi = inkL;
    for (let i = 0; i < SEARCH_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      if (ratio(mid) >= target) lo = mid;
      else hi = mid;
    }
    return {
      highlightL: clampL(surfaceL + (lo - surfaceL) * HIGHLIGHT_FRACTION),
      spokenL: clampL(surfaceL + (lo - surfaceL) * SPOKEN_FRACTION),
    };
  }
  // Degenerate: walk AWAY from the ink side over the FULL remaining range.
  const dir = surfaceL >= inkL ? 1 : -1;
  const extreme = dir > 0 ? 1 : 0;
  // Invariant: surfaceL fails (the branch above ran); the extreme passes
  // whenever ink is not itself at the lightness extreme.
  let lo = surfaceL; // fails
  let hi = extreme;
  if (ratio(hi) < target) {
    // Even the extreme fails (ink sits at the lightness extreme) — both
    // markers take the extreme (best effort, honest; the readout reports).
    return { highlightL: hi, spokenL: hi };
  }
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (ratio(mid) >= target) hi = mid;
    else lo = mid;
  }
  const highlightL = hi;
  // Spoken steps 25% of the remaining compliant range deeper (away from
  // ink) — strictly more contrast, never equal to the annotation fill.
  const spokenL =
    dir > 0 ? clampL(highlightL + (1 - highlightL) * 0.25) : clampL(highlightL - highlightL * 0.25);
  return { highlightL, spokenL };
}

// ── Derivation ───────────────────────────────────────────────────────────────

/**
 * Resolve the full 11-token palette from the 5 stored tokens. Pure: same
 * input, same output — the unit tests pin the derived-pair guarantees
 * (D5-14, focus visibility, placeholder AA) across light, dark, and
 * saturated seeds.
 */
export function resolveCustomTheme(tokens: CustomThemeTokens): ResolvedCustomTheme {
  const surface = tokens.surface.toLowerCase();
  const surfaceRaised = tokens.surfaceRaised.toLowerCase();
  const ink = tokens.ink.toLowerCase();
  const accent = tokens.accent.toLowerCase();
  const hairline = tokens.hairline.toLowerCase();

  const surfaceO = hexToOkLch(surface);
  const inkO = hexToOkLch(ink);
  const accentO = hexToOkLch(accent);

  // --ink-soft: ink's hue/chroma at max-travel lightness, then walked away
  // from the surface to the INK_SOFT_TARGET band when that overshoots
  // (walkAwayFrom returns the candidate unchanged when it already passes).
  const inkSoftStart = clampL(surfaceO.L + (inkO.L - surfaceO.L) * INK_SOFT_MAX_TRAVEL);
  const inkSoft = walkAwayFrom(okLchToHex({ ...inkO, L: inkSoftStart }), surface, INK_SOFT_TARGET);

  // --accent-hover: accent pushed AWAY from the surface (the presets darken
  // on light surfaces, lighten on dark ones), slight chroma lift.
  const hoverDir = accentO.L >= surfaceO.L ? 1 : -1;
  const accentHover = okLchToHex({
    ...accentO,
    L: clampL(accentO.L + hoverDir * HOVER_L_DELTA),
    C: Math.min(accentO.C * HOVER_CHROMA_LIFT, MAX_CHROMA),
  });

  // --focus-ring: the accent when 3:1 non-text already holds; else the
  // accent's hue walked away from the surface until it clears the target.
  const focusRing = walkAwayFrom(accent, surface, FOCUS_TARGET_RATIO);

  // --highlight / --spoken-highlight: accent's hue, calm chroma, lightness
  // banded by the surface→AA-boundary search (D5-14 by construction; the
  // AA*1.02 margin keeps the boundary strictly compliant).
  const band = { ...accentO, C: Math.min(accentO.C, MARKER_CHROMA_CAP) };
  const { highlightL, spokenL } = markerLightnessPair(surfaceO.L, ink, band, AA_TEXT_RATIO * 1.02);
  const highlight = okLchToHex({ ...band, L: highlightL });
  const spokenHighlight = okLchToHex({ ...band, L: spokenL });

  const destructive =
    surfaceDisposition(surface) === "light" ? DESTRUCTIVE_LIGHT : DESTRUCTIVE_DARK;

  return {
    "--surface": surface,
    "--surface-raised": surfaceRaised,
    "--ink": ink,
    "--ink-soft": inkSoft,
    "--accent": accent,
    "--accent-hover": accentHover,
    "--focus-ring": focusRing,
    "--destructive": destructive,
    "--hairline": hairline,
    "--highlight": highlight,
    "--spoken-highlight": spokenHighlight,
  };
}

/**
 * "Fix contrast": nudge ONE token so ONE policed pair clears AA — the ink
 * pair fixes via ink, the accent pair via accent; every other token rides
 * unchanged. Returns an equal-values copy when nothing fails.
 */
export function fixContrastPairs(tokens: CustomThemeTokens): CustomThemeTokens {
  const surface = tokens.surface.toLowerCase();
  const next: CustomThemeTokens = { ...tokens };
  if (contrastRatio(tokens.ink.toLowerCase(), surface) < AA_TEXT_RATIO) {
    next.ink = walkAwayFrom(tokens.ink.toLowerCase(), surface, FIX_TARGET_RATIO);
  }
  if (contrastRatio(tokens.accent.toLowerCase(), surface) < AA_TEXT_RATIO) {
    next.accent = walkAwayFrom(tokens.accent.toLowerCase(), surface, FIX_TARGET_RATIO);
  }
  return next;
}
