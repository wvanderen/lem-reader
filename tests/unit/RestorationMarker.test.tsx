// tests/unit/RestorationMarker.test.tsx
// Phase 18 Plan 18-03 Task 2 — RTL component suite for the passive
// transient restoration marker (ORNT-06, D18-05/06/07/08).
//
// Semantic component glue ONLY (React Testing Library, jsdom — layout truth
// stays in Playwright: scrolling cells in restoration-cue.spec.ts, the
// paginated + 3-engine matrix in Plan 18-04). Proves the four behavior
// bullets from the plan:
//   1. On mount the component renders the visually-hidden role=status
//      region containing exactly the announce copy
//      "Returned to where you left off." (D18-05 — carried forward verbatim
//      from the retiring ResumeBanner's announce discipline).
//   2. The marker bar element is present with pointer-events none and NO
//      interactive descendants (no button, no a, no role=button anywhere
//      inside — the cue IS the location; no dismissal exists, D18-06/07).
//   3. With fake timers, the bar gains the fading class at 3400ms and the
//      component is unmounted by 4000ms (D18-07: 4000ms total — fade class
//      at 3400ms + a 600ms CSS opacity transition).
//   4. The lifecycle uses CSS transition classes ONLY — no
//      requestAnimationFrame-driven style writes anywhere in the component
//      lifecycle (Pitfall 8 — a JS-computed fade would bypass the global
//      prefers-reduced-motion gate that kills CSS transitions).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import { RestorationMarker } from "../../src/reader/RestorationMarker";

// ── Fixture helpers (TocPanel.test.tsx shape: Zod-at-the-boundary) ──────────

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const article = parseArticle({
  id: "restoration-marker-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/marker",
    title: "Restoration Marker Test",
    retrievedAt: "2026-08-30T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "Opening paragraph of the article." }] },
    { kind: "paragraph", content: [{ text: "Second paragraph sits further down." }] },
    { kind: "paragraph", content: [{ text: "Third paragraph at the restore spot." }] },
  ],
  footnotes: [],
});

/** Build the rendered <article> stand-in jsdom-side: block elements carry
 *  [data-block-index] (the BlockRenderer contract findScrollTarget's
 *  callers rely on). getBoundingClientRect is zero-valued in jsdom — the
 *  bar's GEOMETRY is Playwright truth; presence/structure is asserted here. */
function buildArticleEl(): HTMLElement {
  const el = document.createElement("article");
  article.blocks.forEach((block, i) => {
    const p = document.createElement("p");
    p.setAttribute("data-block-index", String(i));
    p.textContent =
      block.kind === "paragraph"
        ? block.content.map((r) => r.text).join("")
        : "";
    el.appendChild(p);
  });
  return el;
}

function mountMarker(
  overrides: Partial<Parameters<typeof RestorationMarker>[0]> = {},
) {
  const articleEl = overrides.articleEl ?? buildArticleEl();
  return {
    articleEl,
    ...render(
      <RestorationMarker
        article={article}
        articleEl={articleEl}
        offset={0}
        mode="scrolling"
        {...overrides}
      />,
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── 1: the polite announce (D18-05 — verbatim carry-forward) ────────────────

describe("RestorationMarker: announce discipline (D18-05)", () => {
  it("renders a visually-hidden role=status polite region containing exactly 'Returned to where you left off.'", () => {
    mountMarker();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveClass("visually-hidden");
    expect(region.textContent).toBe("Returned to where you left off.");
  });
});

// ── 2: passivity (ORNT-06 — the cue never interferes) ───────────────────────

describe("RestorationMarker: passivity (ORNT-06)", () => {
  it("renders the marker bar with pointer-events none and no interactive descendants", () => {
    const { container } = mountMarker();
    const bar = container.querySelector(".restoration-marker");
    expect(bar, "expected the marker bar element to be present").not.toBeNull();
    // Pointer events must be disabled — the bar can never intercept a page
    // turn, a link activation, or any reader pointer traffic.
    expect((bar as HTMLElement).style.pointerEvents).toBe("none");
    // No interactive descendants: no button, no anchor, no role=button
    // anywhere inside the marker (no dismissal interaction exists — D18-07).
    const interactive = bar!.querySelectorAll(
      "button, a, [role='button'], [role='link'], input, select, textarea",
    );
    expect(interactive.length).toBe(0);
  });
});

// ── 3: transient lifecycle to the millisecond (D18-07) ─────────────────────

describe("RestorationMarker: transient lifecycle (D18-07)", () => {
  it("gains .is-fading at 3400ms and is unmounted by 4000ms", () => {
    vi.useFakeTimers();
    const { container } = mountMarker();
    const barAtStart = container.querySelector(".restoration-marker");
    expect(barAtStart).not.toBeNull();
    expect(barAtStart!.classList.contains("is-fading")).toBe(false);

    // 3400ms — the fade window opens (a 600ms CSS opacity transition).
    act(() => {
      vi.advanceTimersByTime(3400);
    });
    const barFading = container.querySelector(".restoration-marker");
    expect(barFading).not.toBeNull();
    expect(barFading!.classList.contains("is-fading")).toBe(true);

    // 4000ms — the component is gone entirely (bar AND announce region).
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelector(".restoration-marker")).toBeNull();
    expect(screen.queryByText("Returned to where you left off.")).toBeNull();
  });

  it("cleans up its timers on unmount (no fires-after-unmount)", () => {
    vi.useFakeTimers();
    const { unmount, container } = mountMarker();
    unmount();
    // Advancing past BOTH lifecycle deadlines after unmount must not throw
    // (no setState-after-unount from a leaked timer).
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(container.querySelector(".restoration-marker")).toBeNull();
  });
});

// ── 4: CSS-transition-only lifecycle (Pitfall 8 — no rAF style writes) ─────

describe("RestorationMarker: reduced-motion discipline (Pitfall 8)", () => {
  it("never calls requestAnimationFrame — the fade is a CSS transition the global gate kills", () => {
    vi.useFakeTimers();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    mountMarker();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(
      rafSpy.mock.calls.length,
      "the marker lifecycle must contain ZERO rAF-driven style writes (Pitfall 8)",
    ).toBe(0);
  });
});
