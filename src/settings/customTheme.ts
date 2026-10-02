// src/settings/customTheme.ts
// The custom-theme color domain (issue #86, decision #73; issue #120): TWO
// independently saved custom slots — Custom light and Custom dark — each
// carrying the reader-editable tokens and the DERIVED tokens that are never
// stored unless edited (issue #118 added the four named highlight fills;
// issue #146 added the Wayfinder chrome). All math is pure and deterministic
// — the same token set always resolves to the same palette, in tests and in
// the browser.
//
// Slots (issue #120): each slot's matching PRESET names its disposition —
// Custom light seeds/resets from the light preset, Custom dark from the
// dark preset — so a slot's light/dark coherence holds by construction.
// There is NO automatic system-theme switching: both slots are selected
// manually, exactly like the three presets. The pre-#120 ONE-slot record
// migrates at the settings-entry seams (src/settings/settingsMigration.ts).
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
//   --highlight-yellow/-green/-blue/-pink (issue #118)
//                      FIXED HUES (not the accent's) through the SAME
//                      compliant lightness band, so every named highlight
//                      fill keeps D5-14 by construction in custom themes —
//                      the ink-on-fill AA guarantee extends to the whole
//                      named vocabulary.
//   --destructive      FIXED per the chosen surface's light/dark disposition
//                      (#9b2c2c light / #e07a7a dark — the preset literals).
//
// Issue #146 — the Wayfinder chrome (ADR 0005's enamel vocabulary). Four
// chrome tokens are EDITABLE (stored only once the reader touches them —
// derive-until-edited, so pre-#146 records parse and render with no
// migration); four stay derived-only:
//   --board / --lit    the enamel classification band and the lit
//                      current-location board — the ACCENT's hue at the
//                      register's board lightness (dark enamel on a light
//                      slot; Night's darker wall register on a dark slot —
//                      a dark-disposition slot never reuses the light
//                      register). The band is walked clear of the band text
//                      (≥ 4.5:1) when a register default lands short.
//   --board-text       the signage white — near-white at the board's hue
//                      family; also --lit-text (the presets pair them).
//                      Stored boardText re-pins the whole text side.
//   --brass            the ACCENT-hue metal — accent's hue at the register's
//                      metal lightness, walked to ≥ 3:1 non-text on the
//                      paper. (The presets keep a fixed gold; custom rooms
//                      match the reader's accent per issue #146.)
//   --brass-bright     the lit metal — brass's hue/chroma at the register's
//                      lit lightness, walked to ≥ 3:1 on the band.
//   --board-soft       secondary board labels — the band family, dimmed.
//   --accent-strong    the solid fill — the accent itself when it already
//                      clears 4.5:1 behind the band text (every light-
//                      register preset: accent-strong IS accent); on a dark
//                      slot the accent is pinned to the register's fill
//                      lightness and walked clear of the band text, so the
//                      Night-style fill stays dark enough for its white.
//
// OKLCH stays internal (decision #73: "the reader never sees the term"):
// every resolved value is an sRGB hex string, so the contrast readout, the
// unit tests, and applyTheme's inline writes all speak plain hex.
//
// Security (the applyTheme.ts posture): these functions map validated hex
// tokens through closed math to hex output — no string reaches CSS that did
// not round-trip through the hex grammar.
import type { CustomTheme, CustomThemeSlot, CustomThemeTokens, ReaderSettings } from "../content/schema";

/** The three preset themes a custom theme can be seeded from / reset to. */
export type CustomBaseTheme = CustomTheme["baseTheme"];

/** Issue #120 — the preset each custom slot seeds from / resets to (its
 * MATCHING preset — the slot's name names its disposition). */
export const SLOT_BASE_THEME: Record<CustomThemeSlot, CustomBaseTheme> = {
  "custom-light": "light",
  "custom-dark": "dark",
};

/** Issue #120 — the theme literal of an active custom slot, or undefined
 * for a preset theme (the ONE switch over the two slots; every consumer
 * derives from here). */
export function activeSlotOf(theme: ReaderSettings["theme"]): CustomThemeSlot | undefined {
  return theme === "custom-light" ? "custom-light" : theme === "custom-dark" ? "custom-dark" : undefined;
}

/** The slot record currently ACTIVE in `s` (undefined for a preset theme —
 * or for a slot that carries no record, which the schema's superRefine
 * makes unrepresentable while active). */
export function activeSlotTheme(
  s: Pick<ReaderSettings, "theme" | "customLightTheme" | "customDarkTheme">,
): CustomTheme | undefined {
  return s.theme === "custom-light"
    ? s.customLightTheme
    : s.theme === "custom-dark"
      ? s.customDarkTheme
      : undefined;
}

/** The settings patch that stores `record` in `slot` (typed so the
 * computed-key union never widens to string index signatures). */
export function slotThemePatch(
  slot: CustomThemeSlot,
  record: CustomTheme,
): Partial<ReaderSettings> {
  return slot === "custom-light" ? { customLightTheme: record } : { customDarkTheme: record };
}

/** The CSS custom properties applyTheme owns while a custom slot is active
 * (issue #120 — theme "custom-light"/"custom-dark"). The
 * inline writes ARE the theme ([data-theme="custom-*"] overrides no tokens
 * in CSS); the SAME list is removed when leaving custom so the preset
 * [data-theme] blocks own the palette again. Issue #146 appends the
 * Wayfinder chrome (ADR 0005's band / lit board / brass vocabulary) — while
 * a custom slot is active the chrome is resolved + written inline too, never
 * left to fall through to the default theme's literals. */
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
  "--highlight-yellow",
  "--highlight-green",
  "--highlight-blue",
  "--highlight-pink",
  "--spoken-highlight",
  // Issue #146 — the Wayfinder chrome (app.css declaration order).
  "--accent-strong",
  "--board",
  "--board-text",
  "--board-soft",
  "--lit",
  "--lit-text",
  "--brass",
  "--brass-bright",
] as const;

export type CustomColorProp = (typeof CUSTOM_COLOR_PROPS)[number];

/** The resolved 23-token palette — CSS property name → sRGB hex. */
export type ResolvedCustomTheme = Record<CustomColorProp, string>;

/** Issue #146 — the four EDITABLE chrome tokens (the stored-record field
 * names; the other four chrome tokens stay derived-only). */
export type ChromeTokenKey = "board" | "boardText" | "lit" | "brass";

/** The one chrome-key → CSS-property map (the builder rows and the fix
 * pairs both read it — a third encoding would be a drift bug). */
export const CHROME_TOKEN_PROPS: Record<ChromeTokenKey, CustomColorProp> = {
  board: "--board",
  boardText: "--board-text",
  lit: "--lit",
  brass: "--brass",
};

/** The 5-token seeds, byte-matching the [data-theme] blocks in src/app.css.
 * Drift is pinned by tests/unit/settings/customTheme.test.ts (the
 * mirror.test.ts extraction-anchor discipline — a token change that forgets
 * this map fails there). */
export const PRESET_SEEDS: Record<CustomBaseTheme, CustomThemeTokens> = {
  sepia: {
    surface: "#f0e8d5",
    surfaceRaised: "#e5dbc2",
    ink: "#241f16",
    accent: "#1f5c44",
    hairline: "#d3c7ab",
  },
  light: {
    surface: "#f7f7f5",
    surfaceRaised: "#eceded",
    ink: "#1c1f1d",
    accent: "#22604a",
    hairline: "#d5d8d2",
  },
  dark: {
    surface: "#141a17",
    surfaceRaised: "#1d2521",
    ink: "#e6e9e4",
    accent: "#7cc7a1",
    hairline: "#2c3630",
  },
};

/** Issue #120 — a slot's FIRST activation (or post-Reset re-activation)
 * seeds from its MATCHING preset (SLOT_BASE_THEME), and "Reset to base
 * colors" restores the slot's own seeded base. The pre-#120 "seed from the
 * then-active preset" behavior narrowed to this deterministic rule: a slot
 * labeled light/dark must START light/dark for its disposition to mean
 * anything; the reader then edits any of the five tokens freely. */
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
/** Issue #118 — the named fills' chroma: hue-identifiable yet calm (inside
 * the marker-chroma spirit; the lightness band does the AA work). */
const NAMED_MARKER_CHROMA = 0.1;
/** Issue #118 — the four named hues as FIXED OKLCH hue angles (degrees —
 * converted to radians at use). NOT the accent's hue: a named Yellow must
 * stay yellow whatever accent the reader chose. */
const NAMED_HIGHLIGHT_HUES = {
  yellow: 100,
  green: 145,
  blue: 262,
  pink: 350,
} as const;
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
/**
 * Issue #146 — the Wayfinder chrome registers (ADR 0005). Every constant is
 * register-keyed: a slot whose SURFACE is light builds the Daylight register
 * (dark enamel band, quiet deep metal), a dark surface builds Night's
 * (darker band, bright lit metal) — a dark-disposition slot never reuses the
 * light register. The values sit ON the preset chrome (see the OKLCH table in
 * tests/unit/settings/customTheme.test.ts): deriving from a preset's own
 * seeds lands within a whisker of that preset's literal band/lit/brass.
 */
/** Board + lit lightness/chroma — the enamel band and its lit step. */
const BOARD_L = { light: 0.29, dark: 0.19 } as const;
const BOARD_C_CAP = 0.032;
const LIT_L_DELTA = { light: 0.09, dark: 0.13 } as const;
const LIT_C_CAP = 0.05;
/** Signage white (also --lit-text): near-white at the band's hue family. */
const BOARD_TEXT_L = { light: 0.965, dark: 0.954 } as const;
const BOARD_TEXT_C = 0.005;
/** Secondary board labels — the band family, dimmed. */
const BOARD_SOFT_L = { light: 0.82, dark: 0.74 } as const;
const BOARD_SOFT_C = 0.022;
/** The metal: accent-hue brass at the register's quiet/lit lightness. */
const BRASS_L = { light: 0.52, dark: 0.73 } as const;
const BRASS_C_CAP = 0.1;
const BRASS_BRIGHT_L = { light: 0.72, dark: 0.785 } as const;
/** Dark-register solid fill pin (Night's accent-strong register). */
const ACCENT_STRONG_L = 0.36;
const ACCENT_STRONG_C = 0.055;
/** Derivation/fix walk targets: a hair over the audited contract (4.5:1
 * text, 3:1 non-text) so engine rounding cannot re-land a derived pair
 * under it (the FIX_TARGET_RATIO discipline). */
const CHROME_NON_TEXT_TARGET = 3.3;

function clampL(L: number): number {
  return Math.min(1, Math.max(0, L));
}

/**
 * Deterministic monotone bisect over [lo, hi]: `passes(lo)` is false,
 * `passes(hi)` is true, and `passes` flips at most once across the segment
 * (contrast is monotone in lightness at fixed hue/chroma). SEARCH_STEPS
 * halvings later, `lastFailing` is the largest failing x and `firstPassing`
 * the smallest passing x — each call site takes the bound its invariant
 * names (and mirrors the predicate when its segment runs pass→fail).
 */
function bisectMonotone(
  lo: number,
  hi: number,
  passes: (x: number) => boolean,
): { lastFailing: number; firstPassing: number } {
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (passes(mid)) hi = mid;
    else lo = mid;
  }
  return { lastFailing: lo, firstPassing: hi };
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
    const maxTravel = Math.abs(extreme - token.L);
    const extremeRatio = contrastRatio(candidate(dir, maxTravel), againstHex);
    if (extremeRatio < target) return null; // this direction cannot reach the target
    // Invariant: travel 0 fails (the early return above), maxTravel passes.
    const { firstPassing } = bisectMonotone(
      0,
      maxTravel,
      (travel) => contrastRatio(candidate(dir, travel), againstHex) >= target,
    );
    return {
      hex: candidate(dir, firstPassing),
      travel: firstPassing,
      ratio: contrastRatio(candidate(dir, firstPassing), againstHex),
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
    // Bisect the surface→ink segment for the LAST passing lightness.
    // The mirrored predicate (fails-AA) fits the helper's fail→pass
    // invariant: surfaceL passes AA, inkL fails — so `lastFailing` is
    // the largest still-compliant lightness.
    const { lastFailing } = bisectMonotone(surfaceL, inkL, (L) => ratio(L) < target);
    return {
      highlightL: clampL(surfaceL + (lastFailing - surfaceL) * HIGHLIGHT_FRACTION),
      spokenL: clampL(surfaceL + (lastFailing - surfaceL) * SPOKEN_FRACTION),
    };
  }
  // Degenerate: walk AWAY from the ink side over the FULL remaining range.
  const dir = surfaceL >= inkL ? 1 : -1;
  const extreme = dir > 0 ? 1 : 0;
  // Invariant: surfaceL fails (the branch above ran); the extreme passes
  // whenever ink is not itself at the lightness extreme.
  if (ratio(extreme) < target) {
    // Even the extreme fails (ink sits at the lightness extreme) — both
    // markers take the extreme (best effort, honest; the readout reports).
    return { highlightL: extreme, spokenL: extreme };
  }
  const highlightL = bisectMonotone(surfaceL, extreme, (L) => ratio(L) >= target).firstPassing;
  // Spoken steps 25% of the remaining compliant range deeper (away from
  // ink) — strictly more contrast, never equal to the annotation fill.
  const spokenL =
    dir > 0 ? clampL(highlightL + (1 - highlightL) * 0.25) : clampL(highlightL - highlightL * 0.25);
  return { highlightL, spokenL };
}

// ── Derivation ───────────────────────────────────────────────────────────────

/** The canonical lowercase view of the stored tokens. The schema preserves
 * case on read (hydration never coerces) and the UI commits lowercase —
 * this ONE boundary makes derivation and fixing caseless, so no call site
 * re-lowercases token by token. The issue #146 chrome fields are spread only
 * when PRESENT: an absent field stays absent (the derive-until-edited
 * marker), never an undefined-valued key. */
function canonicalTokens(tokens: CustomThemeTokens): CustomThemeTokens {
  return {
    surface: tokens.surface.toLowerCase(),
    surfaceRaised: tokens.surfaceRaised.toLowerCase(),
    ink: tokens.ink.toLowerCase(),
    accent: tokens.accent.toLowerCase(),
    hairline: tokens.hairline.toLowerCase(),
    ...(tokens.board !== undefined ? { board: tokens.board.toLowerCase() } : {}),
    ...(tokens.boardText !== undefined ? { boardText: tokens.boardText.toLowerCase() } : {}),
    ...(tokens.lit !== undefined ? { lit: tokens.lit.toLowerCase() } : {}),
    ...(tokens.brass !== undefined ? { brass: tokens.brass.toLowerCase() } : {}),
  };
}

/**
 * Resolve the full 23-token palette from the stored tokens (the five seeds,
 * plus any chrome token the reader has edited — issue #146's
 * derive-until-edited). Pure: same input, same output — the unit tests pin
 * the derived-pair guarantees (D5-14, focus visibility, placeholder AA, the
 * #146 chrome pairs) across light, dark, and saturated seeds.
 */
export function resolveCustomTheme(rawTokens: CustomThemeTokens): ResolvedCustomTheme {
  const tokens = canonicalTokens(rawTokens);

  const surfaceLch = hexToOkLch(tokens.surface);
  const inkLch = hexToOkLch(tokens.ink);
  const accentLch = hexToOkLch(tokens.accent);

  // --ink-soft: ink's hue/chroma at max-travel lightness, then walked away
  // from the surface to the INK_SOFT_TARGET band when that overshoots
  // (walkAwayFrom returns the candidate unchanged when it already passes).
  const inkSoftStart = clampL(surfaceLch.L + (inkLch.L - surfaceLch.L) * INK_SOFT_MAX_TRAVEL);
  const inkSoft = walkAwayFrom(
    okLchToHex({ ...inkLch, L: inkSoftStart }),
    tokens.surface,
    INK_SOFT_TARGET,
  );

  // --accent-hover: accent pushed AWAY from the surface (the presets darken
  // on light surfaces, lighten on dark ones), slight chroma lift.
  const hoverDir = accentLch.L >= surfaceLch.L ? 1 : -1;
  const accentHover = okLchToHex({
    ...accentLch,
    L: clampL(accentLch.L + hoverDir * HOVER_L_DELTA),
    C: Math.min(accentLch.C * HOVER_CHROMA_LIFT, MAX_CHROMA),
  });

  // --focus-ring: the accent when 3:1 non-text already holds; else the
  // accent's hue walked away from the surface until it clears the target.
  const focusRing = walkAwayFrom(tokens.accent, tokens.surface, FOCUS_TARGET_RATIO);

  // --highlight / --spoken-highlight: accent's hue, calm chroma, lightness
  // banded by the surface→AA-boundary search (D5-14 by construction; the
  // AA*1.02 margin keeps the boundary strictly compliant).
  const band = { ...accentLch, C: Math.min(accentLch.C, MARKER_CHROMA_CAP) };
  const { highlightL, spokenL } = markerLightnessPair(
    surfaceLch.L,
    tokens.ink,
    band,
    AA_TEXT_RATIO * 1.02,
  );
  const highlight = okLchToHex({ ...band, L: highlightL });
  const spokenHighlight = okLchToHex({ ...band, L: spokenL });

  // Issue #118 — the named fills: each FIXED hue through the SAME compliant
  // lightness band (the AA*1.02 target), so every named marker keeps D5-14
  // by construction (pinned by highlight-color-contrast.test.ts). The fills
  // share the Default fill's lightness, so they stay calm and shade-equal —
  // distinguished by hue exactly as in the preset themes.
  const namedFills = {} as Record<keyof typeof NAMED_HIGHLIGHT_HUES, string>;
  for (const [name, hueDeg] of Object.entries(NAMED_HIGHLIGHT_HUES)) {
    const namedBand: OkLch = {
      L: surfaceLch.L,
      C: NAMED_MARKER_CHROMA,
      h: (hueDeg * Math.PI) / 180,
    };
    namedFills[name as keyof typeof NAMED_HIGHLIGHT_HUES] = okLchToHex({
      ...namedBand,
      L: markerLightnessPair(
        surfaceLch.L,
        tokens.ink,
        namedBand,
        AA_TEXT_RATIO * 1.02,
      ).highlightL,
    });
  }

  const destructive =
    surfaceDisposition(tokens.surface) === "light" ? DESTRUCTIVE_LIGHT : DESTRUCTIVE_DARK;

  // ── Issue #146 — the Wayfinder chrome (derive-until-edited) ──────────────
  // The register follows the SURFACE's disposition, so a reader who walks a
  // slot's surface across the light/dark line gets the other register's
  // chrome on the very next resolve (never Daylight's enamel on Night walls).
  // Each stored chrome token IS the resolved value; only absent ones derive.
  const register = surfaceDisposition(tokens.surface);

  // --board-text: the signage white (also --lit-text — the presets pair
  // them); near-white at the accent's hue family so the board text belongs
  // to the room's palette.
  const boardText = tokens.boardText ?? okLchToHex({
    L: BOARD_TEXT_L[register],
    C: BOARD_TEXT_C,
    h: accentLch.h,
  });

  // --board: the enamel band — the accent's hue at the register's board
  // lightness, walked clear of the band text when the register default
  // lands short of AA (pinned constants keep every preset-seed band
  // compliant, so the walk is a no-op there).
  const board = tokens.board ?? walkAwayFrom(
    okLchToHex({
      L: BOARD_L[register],
      C: Math.min(accentLch.C, BOARD_C_CAP),
      h: accentLch.h,
    }),
    boardText,
    FIX_TARGET_RATIO,
  );
  const boardLch = hexToOkLch(board);

  // --lit: the lit current-location board — the band one step lighter, same
  // material, walked clear of the band text the same way. --lit-text is the
  // band text (byte-for-byte, as in every preset).
  const lit = tokens.lit ?? walkAwayFrom(
    okLchToHex({
      L: clampL(boardLch.L + LIT_L_DELTA[register]),
      C: Math.min(boardLch.C, LIT_C_CAP),
      h: boardLch.h,
    }),
    boardText,
    FIX_TARGET_RATIO,
  );

  // --board-soft: secondary board labels — the band family, dimmed.
  const boardSoft = okLchToHex({
    L: BOARD_SOFT_L[register],
    C: Math.min(boardLch.C, BOARD_SOFT_C),
    h: boardLch.h,
  });

  // --brass: the accent-hue metal at the register's quiet lightness, walked
  // to ≥ 3:1 non-text on the paper (the rules/edges contract).
  const brass = tokens.brass ?? walkAwayFrom(
    okLchToHex({
      L: BRASS_L[register],
      C: Math.min(accentLch.C, BRASS_C_CAP),
      h: accentLch.h,
    }),
    tokens.surface,
    CHROME_NON_TEXT_TARGET,
  );
  const brassLch = hexToOkLch(brass);

  // --brass-bright: the lit metal — brass's own material at the register's
  // lit lightness, walked to ≥ 3:1 on the band (the band rule / current
  // mark grounds).
  const brassBright = walkAwayFrom(
    okLchToHex({ L: BRASS_BRIGHT_L[register], C: brassLch.C, h: brassLch.h }),
    board,
    CHROME_NON_TEXT_TARGET,
  );

  // --accent-strong: the solid fill behind board-text. A light-register
  // accent is usually already dark enough (the presets: accent-strong IS
  // accent, byte-for-byte); a dark-register accent is pinned to the fill
  // register first (Night's dark-fill discipline), then either way walked
  // clear of the board text.
  const accentStrong = walkAwayFrom(
    register === "light"
      ? tokens.accent
      : okLchToHex({
          L: Math.min(accentLch.L, ACCENT_STRONG_L),
          C: Math.min(accentLch.C, ACCENT_STRONG_C),
          h: accentLch.h,
        }),
    boardText,
    FIX_TARGET_RATIO,
  );

  return {
    "--surface": tokens.surface,
    "--surface-raised": tokens.surfaceRaised,
    "--ink": tokens.ink,
    "--ink-soft": inkSoft,
    "--accent": tokens.accent,
    "--accent-hover": accentHover,
    "--focus-ring": focusRing,
    "--destructive": destructive,
    "--hairline": tokens.hairline,
    "--highlight": highlight,
    "--highlight-yellow": namedFills.yellow,
    "--highlight-green": namedFills.green,
    "--highlight-blue": namedFills.blue,
    "--highlight-pink": namedFills.pink,
    "--spoken-highlight": spokenHighlight,
    "--accent-strong": accentStrong,
    "--board": board,
    "--board-text": boardText,
    "--board-soft": boardSoft,
    "--lit": lit,
    "--lit-text": boardText,
    "--brass": brass,
    "--brass-bright": brassBright,
  };
}

/**
 * "Fix contrast": nudge the policed pairs back over their thresholds, each
 * failing pair via its OWN token — every non-offending token rides
 * unchanged. Returns an equal-values copy when nothing fails. The result is
 * canonical lowercase throughout (the same contract as resolveCustomTheme).
 *
 * Issue #146 — the policed set extends to the Wayfinder chrome pairs (the
 * extended ADR 0005 palette audit). Each fixable pair moves the pair's
 * STORED side (the text token wins ties); a pair whose both sides are
 * derived passes by construction, so the fix only ever moves a token the
 * reader (or an earlier fix in this same pass) owns:
 *   band pair (board-text/board ≥ 4.5)
 *        → boardText when stored, else board
 *   lit pair (band-text/lit ≥ 4.5)
 *        → lit (its text side IS the band text, designated above)
 *   brass pair (brass/surface ≥ 3 non-text)
 *        → brass
 *   lit-brass pair (brass-bright/board ≥ 3 non-text)
 *        → board (the metal derives from brass, designated above)
 * The solid-fill pair (band-text/accent-strong ≥ 4.5) is deliberately NOT
 * here: BOTH its tokens are either derived or shared with the band pair, so
 * a fix would tug-of-war another policed pair — and the derivation
 * guarantees the pair anyway (accent-strong is walked clear of the band
 * text on every resolve, and a walk direction is always reachable against
 * a text color). It stays audited (the unit palette audit) and readout-
 * reported; same for the lit-brass walk inside the derivation itself.
 * A fix may therefore PROMOTE a derived token into the record (an explicit
 * fix is an edit); absent fields are never invented when nothing fails.
 */
export function fixContrastPairs(rawTokens: CustomThemeTokens): CustomThemeTokens {
  const tokens = canonicalTokens(rawTokens);
  const next: CustomThemeTokens = { ...tokens };
  if (contrastRatio(tokens.ink, tokens.surface) < AA_TEXT_RATIO) {
    next.ink = walkAwayFrom(tokens.ink, tokens.surface, FIX_TARGET_RATIO);
  }
  if (contrastRatio(tokens.accent, tokens.surface) < AA_TEXT_RATIO) {
    next.accent = walkAwayFrom(tokens.accent, tokens.surface, FIX_TARGET_RATIO);
  }

  // Issue #146 — the fixable chrome pairs. `effective` reads each EDITABLE
  // chrome value the way resolveCustomTheme resolves it (stored ?? derived),
  // AFTER any earlier fix in this pass — so stored-side fixes compose. (A
  // token that stayed UNSTORED keeps its pre-pass derived value here; the
  // derivation's own contrast walks re-guarantee every audited pair on the
  // next resolve, so the residual gap — if any — is degenerate-only.)
  const resolved = resolveCustomTheme(tokens);
  const effective = (key: ChromeTokenKey): string => next[key] ?? resolved[CHROME_TOKEN_PROPS[key]];

  // Band text on band — the stored side moves (text wins ties).
  if (contrastRatio(effective("boardText"), effective("board")) < AA_TEXT_RATIO) {
    if (next.boardText !== undefined) {
      next.boardText = walkAwayFrom(effective("boardText"), effective("board"), FIX_TARGET_RATIO);
    } else {
      next.board = walkAwayFrom(effective("board"), effective("boardText"), FIX_TARGET_RATIO);
    }
  }
  // Band text on the lit board — the lit ground moves.
  if (contrastRatio(effective("boardText"), effective("lit")) < AA_TEXT_RATIO) {
    next.lit = walkAwayFrom(effective("lit"), effective("boardText"), FIX_TARGET_RATIO);
  }
  // Brass on the paper — non-text 3:1.
  if (contrastRatio(effective("brass"), tokens.surface) < AA_NON_TEXT_RATIO) {
    next.brass = walkAwayFrom(effective("brass"), tokens.surface, CHROME_NON_TEXT_TARGET);
  }
  // Lit brass on the band — the band ground moves (the metal itself derives
  // from brass and re-walks on the next resolve).
  const brassBright = resolved["--brass-bright"];
  if (contrastRatio(brassBright, effective("board")) < AA_NON_TEXT_RATIO) {
    next.board = walkAwayFrom(effective("board"), brassBright, CHROME_NON_TEXT_TARGET);
  }
  return next;
}
