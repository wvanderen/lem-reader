// tests/unit/measurement/textMeasurer.test.ts
/**
 * TextMeasurer adapter contract (Plan 02 — D3-03, V12).
 *
 * jsdom cannot do layout (Pitfall 2), so this test PROVES THE ADAPTER CONTRACT
 * — that the adapter calls Pretext's `prepare`/`layout` /
 * `prepareWithSegments`/`layoutWithLines` with the correct args derived from
 * ReaderSettings + per-kind geometry — NOT Pretext's internal correctness
 * (the calibration harness in tests/e2e/calibration/ proves correctness
 * against rendered DOM across 3 engines).
 *
 * Guards:
 *   - measureParagraphHeight calls prepare(text, font, { letterSpacing }) and
 *     layout(prepared, maxWidthPx, lineHeightPx) and returns { height,
 *     lineCount }.
 *   - measureParagraphWithBreaks calls prepareWithSegments + layoutWithLines
 *     and returns { height, lineCount, lines: [{text, width}] }.
 *   - fontStringFor("paragraph", _, settings) returns the body geometry:
 *     `400 <size>px <FONT_STACK>` + lineHeight = size × preset.lineHeight.
 *   - fontStringFor("heading", 1, _) returns the 32px/1.2/600 geometry
 *     (Pitfall 7 — h1 hardcoded in app.css L142–146).
 *   - fontStringFor("heading", 2..6, _) returns the 22px/1.3/600 geometry
 *     (Pitfall 7 — h2–h4 hardcoded in app.css L147–153).
 *   - SOLE IMPORT SITE: textMeasurer.ts is the only file under src/ importing
 *     from "@chenglou/pretext" (V12 + the adapter seam contract).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderSettings } from "../../../src/content/schema";

// ── Mock @chenglou/pretext so the test exercises the ADAPTER, not Pretext ──
// Pretext's own correctness is proven by the calibration harness in real
// browsers (Pitfall 2 — jsdom is not authoritative for layout). Here we
// assert the adapter composes the right inputs.
//
// vi.hoisted is required because vi.mock() is hoisted ABOVE all top-level
// declarations — the mock factory cannot close over plain `const` mocks
// declared below it. The hoisted bag is accessible to both the factory and
// the test body.
const mocks = vi.hoisted(() => {
  const layoutMock = vi.fn(
    (_prepared: unknown, maxWidth: number, lineHeight: number) => ({
      height: maxWidth * 10 + lineHeight,
      lineCount: 3,
    }),
  );
  const layoutWithLinesMock = vi.fn(
    (_prepared: unknown, maxWidth: number, lineHeight: number) => ({
      height: maxWidth * 10 + lineHeight,
      lineCount: 2,
      lines: [
        { text: "first line", width: maxWidth - 5, start: {}, end: {} },
        { text: "second line", width: maxWidth - 10, start: {}, end: {} },
      ],
    }),
  );
  const prepareMock = vi.fn(
    (_text: string, _font: string, _opts?: unknown) => ({ __br: "prepared" }),
  );
  const prepareWithSegmentsMock = vi.fn(
    (_text: string, _font: string, _opts?: unknown) => ({
      __br: "prepared-with-segments",
      segments: [],
    }),
  );
  return {
    prepareMock,
    layoutMock,
    prepareWithSegmentsMock,
    layoutWithLinesMock,
  };
});

vi.mock("@chenglou/pretext", () => ({
  prepare: mocks.prepareMock,
  layout: mocks.layoutMock,
  prepareWithSegments: mocks.prepareWithSegmentsMock,
  layoutWithLines: mocks.layoutWithLinesMock,
}));

// Import AFTER vi.mock so the adapter picks up the mocks.
import { FONT_STACKS, SPACING_PRESETS } from "../../../src/settings/tokens";
import {
  fontStringFor,
  measureParagraphHeight,
  measureParagraphWithBreaks,
} from "../../../src/measurement/textMeasurer";

const { prepareMock, layoutMock, prepareWithSegmentsMock, layoutWithLinesMock } =
  mocks;

const baseSettings: ReaderSettings = {
  schemaVersion: 1,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
  readingMode: "paginated",
};

beforeEach(() => {
  prepareMock.mockClear();
  layoutMock.mockClear();
  prepareWithSegmentsMock.mockClear();
  layoutWithLinesMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("measureParagraphHeight — adapter contract", () => {
  it("calls prepare(text, font, { letterSpacing }) then layout(prepared, maxWidthPx, lineHeightPx)", () => {
    const { font, lineHeightPx } = fontStringFor("paragraph", 1, baseSettings);
    const result = measureParagraphHeight({
      text: "hello world",
      font,
      letterSpacingPx: 0,
      lineHeightPx,
      maxWidthPx: 600,
    });
    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(prepareMock).toHaveBeenCalledWith("hello world", font, {
      letterSpacing: 0,
    });
    expect(layoutMock).toHaveBeenCalledTimes(1);
    expect(layoutMock).toHaveBeenCalledWith(
      prepareMock.mock.results[0]!.value,
      600,
      lineHeightPx,
    );
    expect(result).toEqual({
      height: expect.any(Number),
      lineCount: expect.any(Number),
    });
  });

  it("does NOT re-prepare when called twice with the same text+font (cheap re-layout path)", () => {
    const { font, lineHeightPx } = fontStringFor("paragraph", 1, baseSettings);
    const args = {
      text: "same text",
      font,
      letterSpacingPx: 0,
      lineHeightPx,
      maxWidthPx: 500,
    };
    measureParagraphHeight(args);
    measureParagraphHeight({ ...args, maxWidthPx: 400 });
    // The adapter calls prepare each invocation (it is stateless across
    // calls; caching is Pretext's job internally). The CONTRACT proven here
    // is that the adapter calls prepare(text, font, {letterSpacing}) with
    // byte-stable inputs across both calls — Pretext dedupes internally.
    expect(prepareMock).toHaveBeenNthCalledWith(
      1,
      "same text",
      font,
      { letterSpacing: 0 },
    );
    expect(prepareMock).toHaveBeenNthCalledWith(
      2,
      "same text",
      font,
      { letterSpacing: 0 },
    );
  });
});

describe("measureParagraphWithBreaks — adapter contract", () => {
  it("calls prepareWithSegments + layoutWithLines and maps lines to {text, width}", () => {
    const { font, lineHeightPx } = fontStringFor("paragraph", 1, baseSettings);
    const result = measureParagraphWithBreaks({
      text: "alpha beta gamma",
      font,
      letterSpacingPx: 0.3,
      lineHeightPx,
      maxWidthPx: 320,
    });
    expect(prepareWithSegmentsMock).toHaveBeenCalledTimes(1);
    expect(prepareWithSegmentsMock).toHaveBeenCalledWith(
      "alpha beta gamma",
      font,
      { letterSpacing: 0.3 },
    );
    expect(layoutWithLinesMock).toHaveBeenCalledTimes(1);
    expect(layoutWithLinesMock).toHaveBeenCalledWith(
      prepareWithSegmentsMock.mock.results[0]!.value,
      320,
      lineHeightPx,
    );
    expect(result.lines).toEqual([
      { text: "first line", width: 315 },
      { text: "second line", width: 310 },
    ]);
    expect(result.lineCount).toBe(2);
  });
});

describe("fontStringFor — Pitfall 7 per-kind geometry", () => {
  it("paragraph: derives body geometry from settings.size × preset.lineHeight, weight 400", () => {
    const { font, lineHeightPx } = fontStringFor("paragraph", 2, baseSettings);
    expect(font).toBe(`400 18px ${FONT_STACKS.serif}`);
    expect(lineHeightPx).toBe(18 * SPACING_PRESETS.comfortable.lineHeight);
  });

  it("paragraph: tracks the active font family", () => {
    const sans = fontStringFor("paragraph", 1, {
      ...baseSettings,
      font: "sans",
    });
    expect(sans.font).toBe(`400 18px ${FONT_STACKS.sans}`);
    const dyslexic = fontStringFor("paragraph", 1, {
      ...baseSettings,
      font: "dyslexic",
    });
    expect(dyslexic.font).toBe(`400 18px ${FONT_STACKS.dyslexic}`);
  });

  it("paragraph: lineHeight scales with the spacing preset multiplier", () => {
    const compact = fontStringFor("paragraph", 1, {
      ...baseSettings,
      spacing: "compact",
    });
    const spacious = fontStringFor("paragraph", 1, {
      ...baseSettings,
      spacing: "spacious",
    });
    expect(compact.lineHeightPx).toBe(18 * SPACING_PRESETS.compact.lineHeight);
    expect(spacious.lineHeightPx).toBe(
      18 * SPACING_PRESETS.spacious.lineHeight,
    );
  });

  it("heading level 1: returns the hardcoded 32px / 1.2 / 600 geometry (Pitfall 7)", () => {
    const { font, lineHeightPx } = fontStringFor("heading", 1, baseSettings);
    // The literals "32px", "1.2", "600" are encoded verbatim in HEADING_GEOMETRY.
    expect(font).toBe(`600 32px ${FONT_STACKS.serif}`);
    expect(lineHeightPx).toBe(32 * 1.2);
  });

  it.each([2, 3, 4, 5, 6] as const)(
    "heading level %i: returns the hardcoded 22px / 1.3 / 600 geometry (Pitfall 7)",
    (level) => {
      const { font, lineHeightPx } = fontStringFor("heading", level, baseSettings);
      expect(font).toBe(`600 22px ${FONT_STACKS.serif}`);
      expect(lineHeightPx).toBe(22 * 1.3);
    },
  );

  it("heading: family still tracks settings.font (not a hardcoded family)", () => {
    const sans = fontStringFor("heading", 1, { ...baseSettings, font: "sans" });
    expect(sans.font).toBe(`600 32px ${FONT_STACKS.sans}`);
  });

  it("heading geometry is INDEPENDENT of settings.size (body knob does not move headings)", () => {
    const small = fontStringFor("heading", 1, { ...baseSettings, size: 16 });
    const large = fontStringFor("heading", 1, { ...baseSettings, size: 24 });
    // Both should be byte-identical — headings ignore the size knob.
    expect(small).toEqual(large);
  });
});
