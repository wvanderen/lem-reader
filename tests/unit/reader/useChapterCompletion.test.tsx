import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleSchema, CompletionRecordSchema } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { useChapterCompletion } from "../../../src/reader/useChapterCompletion";
import { loadAllCompletions, recordCompletion } from "../../../src/persistence/completionsStore";

vi.mock("../../../src/persistence/completionsStore", () => ({
  loadAllCompletions: vi.fn(),
  recordCompletion: vi.fn(),
}));

function work(id: string) {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/work",
      title: id,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: "sha256:test",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "One" }] },
      { kind: "paragraph", content: [{ text: "First chapter." }] },
      { kind: "heading", level: 2, content: [{ text: "Two" }] },
      { kind: "paragraph", content: [{ text: "Second chapter." }] },
    ],
    footnotes: [],
  });
}

const a = work("work-a");
const b = work("work-b");
const structureA = deriveWorkStructure(a)!;
const structureB = deriveWorkStructure(b)!;
const chapter = structureA.destinations.find((d) => d.kind === "chapter")!;

describe("useChapterCompletion callback ownership and failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadAllCompletions).mockResolvedValue([]);
    vi.mocked(recordCompletion).mockImplementation(async (target, finished, source) =>
      CompletionRecordSchema.parse({
        schemaVersion: 1,
        targetKey: `work-chapter:work-b/${chapter.id}`,
        target,
        finished,
        source,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  });

  it("a departed work's callback cannot write onto the new work with matching destination ids", async () => {
    expect(structureB.destinations.some((d) => d.id === chapter.id)).toBe(true);
    const { result, rerender } = renderHook(
      ({ article, structure }) => useChapterCompletion(article, structure),
      { initialProps: { article: a, structure: structureA } },
    );
    await waitFor(() => expect(loadAllCompletions).toHaveBeenCalledTimes(1));
    const stale = result.current;
    rerender({ article: b, structure: structureB });
    await act(async () => {
      await stale.setChapterFinished(chapter.id, true);
      await stale.completeChapter(chapter.id);
    });
    expect(recordCompletion).not.toHaveBeenCalled();
  });

  it("callbacks stay retired after returning to the original work or unmounting", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ article, structure }) => useChapterCompletion(article, structure),
      { initialProps: { article: a, structure: structureA } },
    );
    const stale = result.current;
    rerender({ article: b, structure: structureB });
    rerender({ article: a, structure: structureA });
    await act(async () => {
      await stale.setChapterFinished(chapter.id, true);
    });
    const departed = result.current;
    unmount();
    await departed.setChapterFinished(chapter.id, true);
    expect(recordCompletion).not.toHaveBeenCalled();
  });

  it("automatic writes consume failures, disclose them, and remain retryable", async () => {
    vi.mocked(recordCompletion).mockRejectedValue(new Error("Storage unavailable"));
    const { result } = renderHook(() => useChapterCompletion(a, structureA));
    await waitFor(() => expect(loadAllCompletions).toHaveBeenCalledTimes(1));
    let outcome: unknown;
    await act(async () => {
      outcome = result.current.completeChapter(chapter.id);
      // Drain the old rejecting implementation without leaking a test rejection.
      await Promise.resolve(outcome).catch(() => {});
    });
    expect(outcome).toBeUndefined();
    expect(result.current.saveFailed).toBe(true);
    expect(result.current.marksByBlockIndex.get(chapter.startBlock)).toBe(false);
    await act(async () => {
      await Promise.resolve(result.current.completeChapter(chapter.id)).catch(() => {});
    });
    expect(recordCompletion).toHaveBeenCalledTimes(2);
  });

  it("explicit corrections still reject for their control to handle", async () => {
    vi.mocked(recordCompletion).mockRejectedValue(new Error("Storage unavailable"));
    const { result } = renderHook(() => useChapterCompletion(a, structureA));
    await waitFor(() => expect(loadAllCompletions).toHaveBeenCalledTimes(1));
    await act(async () => {
      await expect(result.current.setChapterFinished(chapter.id, true)).rejects.toThrow(
        "Storage unavailable",
      );
    });
    expect(result.current.saveFailed).toBe(true);
  });
});
