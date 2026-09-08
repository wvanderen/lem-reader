// tests/unit/useScrollSave.test.ts
// 260908-oht — boundary-value unit tests for the atScrollBottom pure helper
// (the scroll-mode completion pin). Scrolling to the very bottom of a
// scrolling-mode article must persist graphemeOffset = total so the article
// reads finished: the top-block START offset computeTopVisibleOffset reports
// at the bottom lands below the 0.98 FINISHED_THRESHOLD whenever the final
// block exceeds 2% of the article. The pin is a pure geometry predicate —
// jsdom-safe; the real scroll listener wiring is proven by the e2e suite.
//
// Boundary table (BOTTOM_EPSILON_PX = 4 default):
//   - exact bottom (scrollY === scrollMax)            → true
//   - within 4px above bottom (>= scrollMax − 4)      → true
//   - 5px above bottom                                → false
//   - top of a scrollable page                        → false
//   - non-scrollable (scrollHeight <= viewportHeight) → false
//   - rubber-band overshoot (scrollY > scrollMax)     → true
import { describe, expect, it } from "vitest";
import { atScrollBottom } from "../../src/reader/useScrollSave";

describe("atScrollBottom — boundary table (viewport 800, scrollHeight 2000 → scrollMax 1200)", () => {
  it("exact bottom (scrollY 1200) → true", () => {
    expect(atScrollBottom(1200, 800, 2000)).toBe(true);
  });

  it("within 4px above bottom (scrollY 1197 = scrollMax − 3) → true", () => {
    expect(atScrollBottom(1197, 800, 2000)).toBe(true);
  });

  it("exactly at the epsilon edge (scrollY 1196 = scrollMax − 4) → true", () => {
    expect(atScrollBottom(1196, 800, 2000)).toBe(true);
  });

  it("5px above bottom (scrollY 1195) → false", () => {
    expect(atScrollBottom(1195, 800, 2000)).toBe(false);
  });

  it("top of a scrollable page (scrollY 0) → false", () => {
    expect(atScrollBottom(0, 800, 2000)).toBe(false);
  });

  it("non-scrollable article (scrollHeight === viewportHeight) → false (never passively finishes)", () => {
    expect(atScrollBottom(0, 800, 800)).toBe(false);
  });

  it("non-scrollable article (scrollHeight < viewportHeight) → false", () => {
    expect(atScrollBottom(0, 800, 700)).toBe(false);
  });

  it("rubber-band overshoot (scrollY > scrollMax) → true", () => {
    expect(atScrollBottom(1210, 800, 2000)).toBe(true);
  });

  it("custom epsilonPx narrows the window (0 → exact bottom only)", () => {
    expect(atScrollBottom(1200, 800, 2000, 0)).toBe(true);
    expect(atScrollBottom(1199, 800, 2000, 0)).toBe(false);
  });
});
