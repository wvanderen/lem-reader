// Issue #235 — footnote measurement rows: the windowed measurement projection
// renders the scope's footnote rows as id-less <li data-footnote-index>
// elements, and measureAllBlocks must return them AFTER the body rows in
// document order — the SAME single read-phase pass, with the footnote kind
// kept out of the Pretext dispatch. Legacy callers (no footnote rows in the
// DOM) are byte-unchanged.
//
// jsdom is NOT authoritative for layout (Pitfall 2): geometry values come
// from the SAME DOM reads the implementation performs; what these tests pin
// is row ORDER, completeness, and kind routing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { measureAllBlocks } from "../../../src/measurement/domMeasurer";
import { MeasurementEngine } from "../../../src/measurement/engine";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";
import { ArticleSchema } from "../../../src/content/schema";

// The font gate blocks on document.fonts.ready — unavailable in jsdom. The
// engine.test.ts precedent: mock it to resolve immediately.
vi.mock("../../../src/measurement/fontGate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/measurement/fontGate")>();
  return { ...actual, awaitFontsReady: vi.fn().mockResolvedValue(undefined) };
});

function installEmptyRectRangeStub(): () => void {
  const realCreateRange = document.createRange.bind(document);
  const stub: Range = {
    setStart: () => {},
    setEnd: () => {},
    getClientRects: (() => []) as unknown as Range["getClientRects"],
  } as unknown as Range;
  document.createRange = () => stub;
  return () => {
    document.createRange = realCreateRange;
  };
}

let restoreRange: (() => void) | null = null;
afterEach(() => {
  restoreRange?.();
  restoreRange = null;
});

/** A stub measurement body: body blocks then an id-less footnotes list. */
function makeMeasurementBody(blockTexts: string[], fnTexts: string[]): HTMLElement {
  const article = document.createElement("article");
  blockTexts.forEach((text, i) => {
    const p = document.createElement("p");
    p.dataset.blockIndex = String(i);
    p.textContent = text;
    article.appendChild(p);
  });
  if (fnTexts.length > 0) {
    const section = document.createElement("section");
    section.setAttribute("aria-label", "Footnotes");
    const ol = document.createElement("ol");
    fnTexts.forEach((text, i) => {
      const li = document.createElement("li");
      li.dataset.footnoteIndex = String(i);
      li.textContent = text;
      ol.appendChild(li);
    });
    section.appendChild(ol);
    article.appendChild(section);
  }
  return article;
}

const article = ArticleSchema.parse({
  id: "measure-footnotes",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Measured footnotes",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "measure-footnotes-v1",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "A cited claim.[1] And another.[2]", marks: [] }] },
    { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
  ],
  footnotes: [
    { id: "fn-1", content: [{ text: "The first footnote body.", marks: [] }] },
    { id: "fn-2", content: [{ text: "The second footnote body.", marks: [] }] },
  ],
});

describe("footnote measurement rows (issue #235)", () => {
  it("returns footnote rows after body rows in one document-order pass", async () => {
    restoreRange = installEmptyRectRangeStub();
    const el = makeMeasurementBody(["A cited claim."], ["First body.", "Second body."]);
    const rows = await measureAllBlocks(el, new AbortController().signal);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "paragraph" });
    expect(rows[1]).toMatchObject({ kind: "footnote-body" });
    expect(rows[2]).toMatchObject({ kind: "footnote-body" });
  });

  it("keeps legacy callers byte-identical when no footnote rows exist", async () => {
    restoreRange = installEmptyRectRangeStub();
    const el = makeMeasurementBody(["One.", "Two."], []);
    const rows = await measureAllBlocks(el, new AbortController().signal);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === "paragraph")).toBe(true);
  });

  it("commits a footnote-scoped result whose rows align with the scope", async () => {
    restoreRange = installEmptyRectRangeStub();
    const el = makeMeasurementBody([], ["First body.", "Second body."]);
    const engine = new MeasurementEngine({
      article,
      blockWindow: {
        startBlock: article.blocks.length,
        endBlock: article.blocks.length,
        startFootnote: 0,
        endFootnote: 2,
      },
      articleEl: el,
      diagnostics: new DiagnosticBus(),
    });
    const result = await new Promise<MeasurementResult | null>((resolve) => {
      engine.onTrusted(resolve);
      void engine.run({
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        viewportWidthPx: 800,
        lang: "en",
      });
    });
    expect(result).not.toBeNull();
    expect(result!.scope).toMatchObject({
      articleId: article.id,
      startBlock: article.blocks.length,
      endBlock: article.blocks.length,
      startFootnote: 0,
      endFootnote: 2,
    });
    expect(result!.blocks).toHaveLength(2);
    expect(result!.blocks[0]!.kind).toBe("footnote-body");
  });

  it("rejects a footnote scope whose measurement rows do not align", async () => {
    restoreRange = installEmptyRectRangeStub();
    const el = makeMeasurementBody([], ["Only one body."]);
    const events: unknown[] = [];
    const diagnostics = new DiagnosticBus();
    diagnostics.subscribe((e) => events.push(e));
    const engine = new MeasurementEngine({
      article,
      blockWindow: {
        startBlock: article.blocks.length,
        endBlock: article.blocks.length,
        startFootnote: 0,
        endFootnote: 2,
      },
      articleEl: el,
      diagnostics,
    });
    const result = await new Promise<MeasurementResult | null>((resolve) => {
      engine.onTrusted(resolve);
      void engine.run({
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        viewportWidthPx: 800,
        lang: "en",
      });
      // The mismatched pass must NEVER commit: the race resolves null when
      // no trusted result arrives (PAGE-06 last-valid-view discipline).
      setTimeout(() => resolve(null), 250);
    });
    // The mismatched pass silently skips its commit (PAGE-06 last-valid-view
    // discipline — the previous trusted view stays; no reader-facing error).
    expect(result).toBeNull();
  });
});
