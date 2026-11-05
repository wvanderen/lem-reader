// Issue #235 — the post-render overflow guard must repair footnote pages
// exactly as it repairs body pages: a footnote entry whose rendered <li>
// overflows re-splits at a widow-legal line boundary of the row's CONTENT
// wrapper (the back-link chrome stays outside the measured text), and the
// corrected entries carry footnoteIndex — coverage of the row stays exactly
// once.
//
// jsdom is NOT authoritative for layout (Pitfall 2): the same stubbing
// discipline as overflowGuard.test.ts — stubbed rects, mocked
// readLineBoxes; the real cross-engine proof is the pagination e2e spec.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import type { LineBox } from "../../../src/measurement/types";
import type { DiagnosticEvent } from "../../../src/measurement/types";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { PageFragment } from "../../../src/pagination/types";

const readLineBoxesMock =
  vi.fn<(el: HTMLElement, fullText: string, signal: AbortSignal) => LineBox[]>();
vi.mock("../../../src/pagination/lineBoxes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/pagination/lineBoxes")>();
  return {
    ...actual,
    readLineBoxes: (...args: Parameters<typeof actual.readLineBoxes>) => readLineBoxesMock(...args),
  };
});

import { refragmentOverflowingPage } from "../../../src/pagination/overflowGuard";
import {
  articleGraphemeIndex,
  footnoteRows,
} from "../../../src/content/normalizeText";

const footnotedArticle = ArticleSchema.parse({
  id: "footnote-guard",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Footnote guard",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "footnote-guard-v1",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "A cited claim.[1]", marks: [] }] }],
  footnotes: [
    {
      id: "fn-1",
      content: [
        { text: "The ledger is archived in the north wing, and this body is deliberately long enough to need a widow-legal repair across two pages.", marks: [] },
      ],
    },
  ],
});

function stubRect(r: { top: number; bottom: number; height: number }): DOMRect {
  return {
    top: r.top,
    bottom: r.bottom,
    left: 0,
    right: 0,
    width: 0,
    height: r.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/** A footnote-only page fragment whose DOM mirrors PageFragmentView's anatomy. */
function makeFootnoteFragmentEl(article: CanonicalArticle, bottom: number): HTMLElement {
  const fragment = document.createElement("section");
  fragment.className = "page-fragment";
  fragment.getBoundingClientRect = () => stubRect({ top: 0, bottom: 0, height: 0 });
  const section = document.createElement("section");
  section.setAttribute("aria-label", "Footnotes");
  const ol = document.createElement("ol");
  const row = footnoteRows(article)[0]!;
  const li = document.createElement("li");
  li.id = article.footnotes[0]!.id;
  li.setAttribute("data-footnote-index", "0");
  const content = document.createElement("span");
  content.setAttribute("data-footnote-content", "");
  content.textContent = articleGraphemeSlice(article, row.start, row.start + row.length);
  li.appendChild(content);
  const back = document.createElement("a");
  back.href = "#fn-ref-1";
  back.textContent = "\u21A9 chrome";
  li.appendChild(back);
  li.getBoundingClientRect = () => stubRect({ top: 0, bottom, height: bottom });
  ol.appendChild(li);
  section.appendChild(ol);
  fragment.appendChild(section);
  return fragment as unknown as HTMLElement;
}

function articleGraphemeSlice(article: CanonicalArticle, start: number, end: number): string {
  // The DOM textContent the guard reads is the RAW run concatenation; for
  // this single-run fixture it equals the normalized slice.
  return articleGraphemeIndex(article).clusters.slice(start, end).join("");
}

function uniformLineBoxes(textLength: number, charsPerLine: number, lineHeight = 20): LineBox[] {
  const count = Math.max(1, Math.ceil(textLength / charsPerLine));
  return Array.from({ length: count }, (_, i) => ({
    charOffset: i * charsPerLine,
    topPx: i * lineHeight,
    bottomPx: i * lineHeight + lineHeight - 2,
  }));
}

function footnotePage(pageIndex: number, start: number, end: number): PageFragment {
  return {
    schemaVersion: 1,
    pageIndex,
    blocks: [
      { blockIndex: footnotedArticle.blocks.length, footnoteIndex: 0, startGrapheme: start, endGrapheme: end },
    ],
  };
}

beforeEach(() => {
  readLineBoxesMock.mockReset();
});

describe("overflow guard — footnote pages (issue #235)", () => {
  it("re-splits an overflowing footnote row at a widow-legal line, covering the row exactly once", () => {
    const article = footnotedArticle as CanonicalArticle;
    const row = footnoteRows(article)[0]!;
    const pages = [footnotePage(0, 0, row.length)];
    const fragmentEl = makeFootnoteFragmentEl(article, 500);
    const { bus, events } = { bus: new DiagnosticBus(), events: [] as DiagnosticEvent[] };
    bus.subscribe((e) => events.push(e));
    // Line boxes over the CONTENT WRAPPER's text; the guard must read the
    // wrapper (chrome-free), not the li (whose textContent includes the
    // back-link). 8 lines à 20px — a 300px page box splits mid-row.
    const wrapperText = articleGraphemeSlice(article, row.start, row.start + row.length);
    readLineBoxesMock.mockImplementation((el, _fullText) => {
      expect(el.hasAttribute("data-footnote-content")).toBe(true);
      return uniformLineBoxes(wrapperText.length, Math.ceil(wrapperText.length / 8));
    });
    const corrected = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    expect(events).toEqual([]);
    expect(corrected).not.toBeNull();
    expect(corrected!.length).toBe(2);
    const entries = corrected!.flatMap((page) => page.blocks);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.footnoteIndex).toBe(0);
      expect(entry.blockIndex).toBe(article.blocks.length);
    }
    expect(entries[0]!.startGrapheme).toBe(0);
    expect(entries[1]!.endGrapheme).toBe(row.length);
    expect(entries[1]!.startGrapheme).toBe(entries[0]!.endGrapheme);
    expect(entries[0]!.endGrapheme).toBeGreaterThan(0);
    expect(entries[0]!.endGrapheme).toBeLessThan(row.length);
  });

  it("keeps the honest typed fallback when a footnote row cannot re-split", () => {
    const article = footnotedArticle as CanonicalArticle;
    const row = footnoteRows(article)[0]!;
    const pages = [footnotePage(0, 0, row.length)];
    const fragmentEl = makeFootnoteFragmentEl(article, 900);
    const { bus, events } = { bus: new DiagnosticBus(), events: [] as DiagnosticEvent[] };
    bus.subscribe((e) => events.push(e));
    readLineBoxesMock.mockReturnValue([]); // no line boxes → no widow-legal split
    const corrected = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    expect(corrected).toEqual([]);
    expect(events.some((e) => e.kind === "dom-fallback")).toBe(true);
  });
});
