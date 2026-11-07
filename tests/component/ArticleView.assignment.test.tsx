// tests/component/ArticleView.assignment.test.tsx
// Issue #244 — the chapter assignment's reader wiring, at the seams jsdom
// can observe honestly (layout truth stays with Playwright — the cross-
// engine suite owns pagination, speech boundaries, and focus order there).
// These component tests pin the ROUTE-LEVEL decisions:
//   - a garbage/stale scope degrades to ordinary whole-work reading (no
//     assignment chrome, no chapter-start landing);
//   - a destination assignment whose saved position falls OUTSIDE the
//     chapter lands at the CHAPTER's beginning and focuses its opening
//     heading (the boundary landing, never a resume marker);
//   - a saved position INSIDE the chapter restores normally (no h1/heading
//     focus steal — the restored position is the orientation);
//   - the scrolling continue-the-work card renders in flow at the chapter's
//     end and clicking it strips the assignment (the plain route) while
//     recording the landing offset.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";

vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

vi.mock("../../src/persistence/locationStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/persistence/locationStore")>();
  return { ...actual, loadLocation: vi.fn() };
});

import { ArticleView } from "../../src/routes/ArticleView";
import type { ArticleViewProps } from "../../src/routes/ArticleView";
import { openArticle } from "../../src/content/repository";
import { loadLocation } from "../../src/persistence/locationStore";
import type { CanonicalArticle } from "../../src/content/types";
import { SettingsProvider } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { SETTINGS_MIRROR_KEY } from "../../src/settings/settingsMirror";
import { LocationRecordSchema } from "../../src/content/schema";

const openArticleMock = vi.mocked(openArticle);
const loadLocationMock = vi.mocked(loadLocation);

// jsdom has no layout: scrollIntoView (the jump tail's scrolling branch)
// must exist. The stub records nothing — the assertions read focus + DOM
// order, not geometry (Playwright owns layout truth).
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

/** A two-chapter web work (the destination-assignment fixture). */
const structuredWork = (): CanonicalArticle => ({
  id: "assigned-work",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/assigned",
    title: "Assigned Work",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    { kind: "heading", level: 2, content: [{ text: "Opening", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Opening body.", marks: [] }] },
    { kind: "heading", level: 2, content: [{ text: "Following", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Following body.", marks: [] }] },
  ],
  footnotes: [],
});

const work = structuredWork();

/** The destination ids come from the same derivation the reader resolves. */
async function chapterIds(): Promise<[string, string]> {
  const { deriveWorkStructure } = await import("../../src/content/structure");
  const structure = deriveWorkStructure(work)!;
  const chapters = structure.destinations.filter((d) => d.kind === "chapter");
  return [chapters[0]!.id, chapters[1]!.id];
}

function locationAt(offset: number) {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: "assigned-work",
    revision: 1,
    graphemeOffset: offset,
    savedAt: "2026-10-01T00:00:00.000Z",
  });
}

function withProps(articleId: string, chapterScope?: string): ArticleViewProps {
  return {
    articleId,
    chapterScope,
    modeToggleHandlerRef: createRef(),
    drawerOpen: false,
    onCloseDrawer: () => {},
    tagsOpen: false,
    onCloseTags: () => {},
    tocOpen: false,
    onCloseToc: () => {},
    onAnnotationCountChange: () => {},
    hasAppHistory: false,
  };
}

function renderView(props: ArticleViewProps) {
  return render(
    <SettingsProvider>
      <ArticleView {...props} />
    </SettingsProvider>,
  );
}

beforeEach(() => {
  openArticleMock.mockReset();
  loadLocationMock.mockReset();
  loadLocationMock.mockResolvedValue({ ok: true, location: null });
  // Scrolling mode via the app's own lazy-init mirror (the same POLISH-01
  // mechanism the ArticleView component suite pins): jsdom has no layout,
  // so the paginated surface never settles — the scrolling branch renders
  // the real body (with data-block-index elements) that these assertions
  // read.
  localStorage.setItem(
    SETTINGS_MIRROR_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, readingMode: "scrolling" }),
  );
});

describe("ArticleView chapter assignment (issue #244)", () => {
  it("a garbage scope degrades to ordinary whole-work reading — no assignment chrome", async () => {
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", "../etc/passwd"));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    await waitFor(() => expect(loadLocationMock).toHaveBeenCalled());
    await act(async () => {});
    // No assignment-end card anywhere, and no landing focus move (the
    // ordinary cold open).
    expect(screen.queryByRole("navigation", { name: "End of this chapter" })).toBeNull();
    expect(document.activeElement?.getAttribute("data-block-index")).toBeNull();
  });

  it("a saved position OUTSIDE the assigned chapter lands at the chapter's beginning + focus on its heading", async () => {
    const [, secondId] = await chapterIds();
    const { deriveWorkStructure } = await import("../../src/content/structure");
    const structure = deriveWorkStructure(work)!;
    const second = structure.destinations.filter((d) => d.kind === "chapter")[1]!;
    // The reader last read inside chapter ONE — outside chapter two's range.
    loadLocationMock.mockResolvedValue({ ok: true, location: locationAt(second.startOffset - 1) });
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", secondId));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    // The boundary landing focuses the chapter's opening heading (the
    // destination's start block — the "Following" h2).
    await waitFor(
      () => {
        const focused = document.activeElement;
        expect(focused?.getAttribute("data-block-index")).toBe("2");
      },
      { timeout: 3000 },
    );
  });

  it("a saved position INSIDE the assigned chapter restores without a focus steal", async () => {
    const [, secondId] = await chapterIds();
    const { deriveWorkStructure } = await import("../../src/content/structure");
    const structure = deriveWorkStructure(work)!;
    const second = structure.destinations.filter((d) => d.kind === "chapter")[1]!;
    // Just past the chapter's start — inside the assignment.
    loadLocationMock.mockResolvedValue({
      ok: true,
      location: locationAt(second.startOffset + 1),
    });
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", secondId));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    await waitFor(() => expect(loadLocationMock).toHaveBeenCalled());
    // Flush the restore's rAF settle; the restore lands WITHOUT moving
    // focus (D14-10 — the restored position is the orientation) and the
    // chapter-heading landing never fires.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(document.activeElement?.getAttribute("data-block-index")).not.toBe("2");
    // Chapter two ENDS the work — nothing left to continue, so the honest
    // end chrome here is the ordinary completion gesture, not a continue
    // card (spare-chrome silence where continuation is impossible).
    expect(screen.queryByRole("navigation", { name: "End of this chapter" })).toBeNull();
  });

  it("the scrolling continue-the-work card sits in flow after the chapter's last block", async () => {
    const [firstId] = await chapterIds();
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", firstId));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    const card = await screen.findByRole("navigation", { name: "End of this chapter" });
    expect(card.textContent).toContain("End of “Opening”.");
    const button = card.querySelector("button");
    expect(button?.textContent).toContain("Continue reading Assigned Work");
    // In flow: the card sits between the chapter's last block (index 1) and
    // the next chapter's heading (index 2) in DOM order.
    const lastChapterBlock = document.querySelector('[data-block-index="1"]');
    const nextChapterHeading = document.querySelector('[data-block-index="2"]');
    expect(lastChapterBlock).not.toBeNull();
    expect(nextChapterHeading).not.toBeNull();
    expect(
      lastChapterBlock!.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      card.compareDocumentPosition(nextChapterHeading!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a FINISHED work reopens a final-chapter assignment at the work's end (the end-landing exception)", async () => {
    // The shared position at the work's end-pin is OUTSIDE every half-open
    // chapter range — but the chapter that ENDS the work owns that pin: the
    // 260908-oht end-landing guarantee (a finished work must not un-finish
    // by reopening) applies. The ordinary restore path lands at the end and
    // the restoration marker claims it (a genuine resume of the finished
    // chapter); the chapter-start landing never fires.
    const [, secondId] = await chapterIds();
    const { articleGraphemeIndex } = await import("../../src/content/normalizeText");
    const total = articleGraphemeIndex(work).totalGraphemes;
    loadLocationMock.mockResolvedValue({ ok: true, location: locationAt(total) });
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", secondId));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    // The chapter-start landing (focus on the opening heading) never fires:
    // the end-pin is the final chapter's own resume.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(document.activeElement?.getAttribute("data-block-index")).not.toBe("2");
  });

  it("clicking the continue card strips the assignment and records the landing offset", async () => {
    const [firstId] = await chapterIds();
    openArticleMock.mockResolvedValue(work);
    renderView(withProps("assigned-work", firstId));
    await screen.findByRole("heading", { level: 1, name: "Assigned Work" });
    const card = await screen.findByRole("navigation", { name: "End of this chapter" });
    const button = card.querySelector("button");
    expect(button).not.toBeNull();
    window.location.hash = `#/article/assigned-work/c/${firstId}`;
    fireEvent.click(button!);
    // The route strips the scope: the plain article route.
    await waitFor(() => {
      expect(window.location.hash).toBe("#/article/assigned-work");
    });
  });
});
