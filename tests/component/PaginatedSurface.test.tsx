// tests/component/PaginatedSurface.test.tsx
// Component tests for the paginated-mode surface (Pattern 5 single content
// tree + PAGE-02 pointer turn + D4-08 disabled-state). The pagination engine
// (paginateDocument) is mocked so the test asserts COMPONENT behavior in
// isolation — real PAGE-03 exactly-once/no-clipping proofs run in Plan 04-05's
// Playwright corpus matrix (jsdom is not authoritative for layout).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the engine module, then drive it via the mock.
vi.mock("../../src/pagination/fragment", () => ({
  paginateDocument: vi.fn(),
}));

import { PaginatedSurface } from "../../src/reader/PaginatedSurface";
import { paginateDocument } from "../../src/pagination/fragment";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import type { CanonicalArticle } from "../../src/content/types";
import type { MeasurementResult } from "../../src/measurement/types";
import type { PageFragment } from "../../src/pagination/types";

const paginateMock = vi.mocked(paginateDocument);

const article: CanonicalArticle = {
  id: "stub-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/posts/stub",
    title: "Stub Article",
    retrievedAt: "2026-08-06T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "First page content.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Second page content.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Third page content.", marks: [] }] },
  ],
  footnotes: [],
};

const trustedView: MeasurementResult = {
  schemaVersion: 1,
  constraints: {
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    viewportWidthPx: 1024,
    lang: "en",
  },
  blocks: [
    { kind: "paragraph", heightPx: 600, lineCount: 10 },
    { kind: "paragraph", heightPx: 600, lineCount: 10 },
    { kind: "paragraph", heightPx: 600, lineCount: 10 },
  ],
  computedAt: "2026-08-06T00:00:00.000Z",
};

/** Build N synthetic page fragments each referencing a distinct blockIndex. */
function makePages(n: number): PageFragment[] {
  return Array.from({ length: n }, (_, i) => ({
    schemaVersion: 1 as const,
    pageIndex: i,
    blocks: [{ blockIndex: i, startGrapheme: 0, endGrapheme: 10 }],
  }));
}

beforeEach(() => {
  paginateMock.mockReset();
});

function renderSurface() {
  const articleEl = document.createElement("article");
  const diagnostics = new DiagnosticBus();
  return render(
    <PaginatedSurface
      article={article}
      trustedView={trustedView}
      articleEl={articleEl}
      diagnostics={diagnostics}
      pageContentBoxHeightPx={600}
    />,
  );
}

describe("PaginatedSurface — single content tree + pointer turn", () => {
  it("renders exactly one .page-fragment section (A11Y-03 single content tree)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const { container } = renderSurface();
    const sections = container.querySelectorAll(".page-fragment");
    expect(sections.length).toBe(1);
    expect(sections[0]?.getAttribute("aria-label")).toBe("Page 1");
  });

  it("clicking Next advances the aria-label from 'Page 1' to 'Page 2'", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    expect(screen.getByRole("region", { name: "Page 1" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("region", { name: "Page 2" })).not.toBeNull();
  });

  it("clicking Previous retreats from page 2 back to page 1", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByRole("region", { name: "Page 1" })).not.toBeNull();
  });

  it("Previous has aria-disabled='true' on page 1 (D4-08 first-page boundary)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
  });

  it("Next has aria-disabled='true' on the last page (D4-08 last-page boundary)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const next = screen.getByRole("button", { name: "Next page" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
  });

  it("Previous has aria-disabled='false' on page 2 (D4-08 mid-boundary enabled state)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev.getAttribute("aria-disabled")).toBe("false");
  });

  it("renders the page-indicator span with '1 of 3' on the first page (D4-08)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    const indicator = document.querySelector(".page-indicator");
    expect(indicator?.textContent).toBe("1 of 3");
    // aria-hidden — decorative; AT progress comes from SectionAnnouncer.
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing when the engine returns status 'fallback' (PAGE-04 deferred to Plan 04-05)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "fallback",
      pages: [],
      reason: "oversized-block",
    });
    const { container } = renderSurface();
    expect(container.querySelectorAll(".page-fragment").length).toBe(0);
    expect(container.querySelector(".page-indicator")).toBeNull();
  });

  it("renders nothing while pageContentBoxHeightPx is 0 (waits for geometry)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const articleEl = document.createElement("article");
    const diagnostics = new DiagnosticBus();
    const { container } = render(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={articleEl}
        diagnostics={diagnostics}
        pageContentBoxHeightPx={0}
      />,
    );
    expect(container.querySelectorAll(".page-fragment").length).toBe(0);
    // paginateDocument is NOT called until geometry is non-zero.
    expect(paginateMock).not.toHaveBeenCalled();
  });
});
