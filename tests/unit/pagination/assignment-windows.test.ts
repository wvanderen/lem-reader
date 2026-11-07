// Issue #244 — the chapter assignment's source windows
// (src/pagination/assignmentWindows.ts).
//
// The windowed pagination adapter reads a BOUNDED work under a chapter
// assignment: blockWindows filtered + clamped to the chapter's canonical
// offset range. These tests pin the honesty guarantees the AC names:
//   - the assignment's windows tile EXACTLY its range (no page, window, or
//     grapheme outside [startOffset, endOffset) — no accidental
//     continuation into the neighboring chapter);
//   - internal layout windows are preserved INSIDE the assignment (a
//     multi-window chapter keeps its internal turn structure — a local
//     window boundary is never misread as the assignment's end);
//   - one-page (single-window) assigned chapters collapse to one window;
//   - the last chapter (covering the footnotes region) keeps the footnote
//     windows — reading the assignment reaches the work's true end;
//   - clamped bounds stay valid BlockWindows (the homogeneous-boundary
//     rule) and canonical coordinates never shift.

import { describe, expect, it } from "vitest";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import { deriveWorkStructure } from "../../../src/content/structure";
import type { StructureDestination } from "../../../src/content/schema";
import {
  blockWindows,
  windowGlobalEnd,
  windowGlobalStart,
} from "../../../src/pagination/blockWindow";
import { assignmentWindows } from "../../../src/pagination/assignmentWindows";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const heading = (level: 2 | 3, text: string): Block => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

const footnoteDef = (id: string, text: string) => ({ id, content: [{ text, marks: [] }] });

function makeArticle(
  blocks: Block[],
  footnotes: ReturnType<typeof footnoteDef>[] = [],
): CanonicalArticle {
  return {
    id: "assigned-work",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/assigned",
      title: "Assigned Work",
      retrievedAt: "2026-08-07T00:00:00Z",
      originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    blocks,
    footnotes,
  } as CanonicalArticle;
}

/** A many-window work: three h2 chapters, each spanning several layout
 * windows (40 paragraphs of ~300 graphemes ≈ 12k graphemes per chapter —
 * past the 8k window capacity). */
const threeChapterWork = (): CanonicalArticle => {
  const filler =
    "Calm steady prose sentence with a stable source position for the paginator to measure. ".repeat(
      4,
    );
  const blocks: Block[] = [heading(2, "One")];
  for (let i = 0; i < 40; i++) blocks.push(paragraph(`${filler} (${i})`));
  blocks.push(heading(2, "Two"));
  for (let i = 0; i < 40; i++) blocks.push(paragraph(`${filler} (${i})`));
  blocks.push(heading(2, "Three"));
  for (let i = 0; i < 40; i++) blocks.push(paragraph(`${filler} (${i})`));
  return makeArticle(blocks);
};

function chapterDestination(article: CanonicalArticle, title: string): StructureDestination {
  const structure = deriveWorkStructure(article)!;
  const destination = structure.destinations.find((d) => d.kind === "chapter" && d.title === title);
  expect(destination).toBeDefined();
  return destination!;
}

describe("assignmentWindows — the assignment's bounded source windows", () => {
  it("tile EXACTLY the assignment range — nothing outside survives", () => {
    const article = threeChapterWork();
    const chapter = chapterDestination(article, "Two");
    const windows = assignmentWindows(article, chapter.startOffset, chapter.endOffset);
    expect(windows.length).toBeGreaterThan(0);
    expect(windowGlobalStart(article, windows[0]!)).toBe(chapter.startOffset);
    expect(windowGlobalEnd(article, windows.at(-1)!)).toBe(chapter.endOffset);
    // Contiguous, in order, inside the range.
    let cursor = chapter.startOffset;
    for (const window of windows) {
      expect(windowGlobalStart(article, window)).toBe(cursor);
      expect(windowGlobalStart(article, window)).toBeGreaterThanOrEqual(chapter.startOffset);
      expect(windowGlobalEnd(article, window)).toBeLessThanOrEqual(chapter.endOffset);
      cursor = windowGlobalEnd(article, window);
    }
    expect(cursor).toBe(chapter.endOffset);
  });

  it("keep the INTERNAL window structure — a mid-chapter turn stays mid-chapter", () => {
    const article = threeChapterWork();
    const chapter = chapterDestination(article, "Two");
    const windows = assignmentWindows(article, chapter.startOffset, chapter.endOffset);
    const whole = blockWindows(article);
    // The assignment has more than one internal layout window (its source
    // spans several whole-article windows) — each one survives, clamped.
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.length).toBeLessThan(whole.length);
  });

  it("collapse a one-page assigned chapter to a single window", () => {
    const article = makeArticle([
      heading(2, "Only"),
      paragraph("A short chapter."),
      heading(2, "Next"),
      paragraph("Another short chapter."),
    ]);
    const only = chapterDestination(article, "Only");
    const windows = assignmentWindows(article, only.startOffset, only.endOffset);
    expect(windows).toHaveLength(1);
    expect(windowGlobalStart(article, windows[0]!)).toBe(0); // leading text: chapter one starts at 0
    expect(windowGlobalEnd(article, windows[0]!)).toBe(only.endOffset);
  });

  it("keep the footnote windows for the LAST chapter (the work's true end)", () => {
    const article = makeArticle(
      [
        heading(2, "One"),
        (() => {
          // A footnote reference needs the fn-<n> id shape.
          return {
            kind: "paragraph",
            content: [{ text: "Prose with a note.", marks: [] }],
            fnRefs: [],
          } as unknown as Block;
        })(),
        heading(2, "Two"),
        paragraph("Final chapter prose."),
      ],
      [footnoteDef("fn-1", "The note body text.")],
    );
    const last = chapterDestination(article, "Two");
    const total = articleGraphemeIndex(article).totalGraphemes;
    expect(last.endOffset).toBe(total); // the last destination covers the footnotes region
    const windows = assignmentWindows(article, last.startOffset, last.endOffset);
    expect(windowGlobalEnd(article, windows.at(-1)!)).toBe(total);
    // The footnote window survives unclamped (the assignment covers it).
    const lastWindow = windows.at(-1)!;
    expect(
      lastWindow.startFootnote !== undefined || lastWindow.endBlock === article.blocks.length,
    ).toBe(true);
  });

  it("leave the whole-article windows untouched (clamping never renumbers coordinates)", () => {
    const article = threeChapterWork();
    const chapter = chapterDestination(article, "Three");
    const before = blockWindows(article).map((w) => [
      windowGlobalStart(article, w),
      windowGlobalEnd(article, w),
    ]);
    assignmentWindows(article, chapter.startOffset, chapter.endOffset);
    const after = blockWindows(article).map((w) => [
      windowGlobalStart(article, w),
      windowGlobalEnd(article, w),
    ]);
    expect(after).toEqual(before);
  });

  it("an empty range derives no windows (honest absence)", () => {
    const article = threeChapterWork();
    expect(assignmentWindows(article, 5, 5)).toEqual([]);
    expect(assignmentWindows(article, 10, 4)).toEqual([]);
  });

  it("derive identically across calls (deterministic, cached)", () => {
    const article = threeChapterWork();
    const chapter = chapterDestination(article, "One");
    const first = assignmentWindows(article, chapter.startOffset, chapter.endOffset);
    const second = assignmentWindows(article, chapter.startOffset, chapter.endOffset);
    expect(second).toBe(first); // same reference — the (article, range) cache
  });
});
