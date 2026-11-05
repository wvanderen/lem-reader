// tests/component/useBookHandoff.test.tsx
// Issue #238 — the book-handoff state machine's component seam.
//
// The hook owns the cancellation-safe lifecycle of a whole-book chapter
// crossing (issue #238): the departing flush happens synchronously, the
// canonical route assignment is deferred one frame so a superseding reader
// event in the same window cancels it, the arrival intent is consumed
// exactly once per handoff generation, and a navigation to a different
// article supersedes a stale intent. Browser hashchange timing, focus, and
// the real pagination handoff are e2e truth (book-crossing.spec.ts); this
// suite pins the lifecycle contract that those e2e cases cannot observe
// deterministically.
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBookHandoff } from "../../src/reader/useBookHandoff";
import type { BookHandoff } from "../../src/reader/useBookHandoff";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";

/** Mount the hook and hand the stable API object to the test. */
function mountHook(): { handoff: BookHandoff; unmount: () => void } {
  let handoff!: BookHandoff;
  function Harness() {
    handoff = useBookHandoff();
    return null;
  }
  const { unmount } = render(<Harness />);
  return { handoff, unmount };
}

/** Let the polyfilled rAF (a 16ms setTimeout in tests/setup.ts) fire. */
const settleFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

/** A schema-valid chapter article whose OBJECT identity the stand-down
 * contract keys on (the hook never reads beyond `.id`). */
function chapterOf(id: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Chapter ${id}`,
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Passage.", marks: [] }] }],
  });
}

beforeEach(() => {
  // jsdom keeps location across tests in one file — the handoff's route
  // assignment must never leak between cases.
  window.location.hash = "";
});

describe("useBookHandoff — the chapter-crossing lifecycle", () => {
  it("flushes the departing position immediately and navigates on the next frame", async () => {
    const { handoff } = mountHook();
    const flushDeparting = vi.fn();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting,
      });
    });
    // The flush is synchronous — the departing chapter's real position is
    // persisted BEFORE any route change (acceptance: flush before handoff).
    expect(flushDeparting).toHaveBeenCalledTimes(1);
    // The route assignment waits one frame (the supersession window).
    expect(window.location.hash).not.toBe("#/article/bc-c1");
    await act(settleFrame);
    expect(window.location.hash).toBe("#/article/bc-c1");
  });

  it("cancelPending() inside the deferral window stops the crossing entirely", async () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    // The reader's next real action in the same window (a manual turn back,
    // a mode change) cancels — the flush already happened, but the reader
    // stays in the departing chapter.
    act(() => {
      handoff.cancelPending();
    });
    await act(settleFrame);
    expect(window.location.hash).toBe("");
  });

  it("a newer boundary turn replaces an older pending one (only the newest navigates)", async () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c3",
        direction: "previous",
        flushDeparting: () => {},
      });
    });
    await act(settleFrame);
    expect(window.location.hash).toBe("#/article/bc-c3");
  });

  it("consumeArrival claims the intent exactly once per handoff generation", () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "previous",
        flushDeparting: () => {},
      });
    });
    // The first consumption (the arrival effect) gets the intent's reader-
    // visible fields (generation is machine identity, not part of the shape
    // the arrival effect branches on)…
    const first = handoff.consumeArrival(chapterOf("bc-c1"));
    expect(first?.targetId).toBe("bc-c1");
    expect(first?.direction).toBe("previous");
    // …the StrictMode twin run (and any re-entry) gets nothing.
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).toBeNull();
  });

  it("consumeArrival ignores an article that does not match the intent's target", () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    expect(handoff.consumeArrival(chapterOf("bc-other"))).toBeNull();
    // The mismatched read does NOT consume the intent — the real arrival
    // still claims it.
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).not.toBeNull();
  });

  it("supersede clears a stale intent when the view navigated elsewhere", () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    // A different article arrived (deep link, TOC jump, library row).
    act(() => {
      handoff.supersede("bc-elsewhere");
    });
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).toBeNull();
  });

  it("supersede keeps an intent whose target IS the arriving article", async () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    // The handoff's own navigation landed (the frame fired — hash assigned),
    // THEN the load effect supersedes with the incoming article id: the
    // intent must survive for consumption. (While the frame is still pending
    // there IS no arriving article — supersede can only cancel then.)
    await act(settleFrame);
    act(() => {
      handoff.supersede("bc-c1");
    });
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).not.toBeNull();
  });

  it("standDownRestoreFor holds for the arrival ARTICLE OBJECT only (restore never fights the handoff landing)", () => {
    const { handoff } = mountHook();
    const arrival = chapterOf("bc-c1");
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "previous",
        flushDeparting: () => {},
      });
    });
    // Before consumption the restore must NOT stand down (an ordinary
    // arrival at the same id keeps its resume behavior).
    expect(handoff.standDownRestoreFor(arrival)).toBe(false);
    act(() => {
      handoff.consumeArrival(arrival);
    });
    // The claimed arrival's OWN object is suppressed (StrictMode twin runs
    // of the restore effect share this identity)…
    expect(handoff.standDownRestoreFor(arrival)).toBe(true);
    // …any other article never is.
    expect(handoff.standDownRestoreFor(chapterOf("bc-other"))).toBe(false);
  });

  it("a LATER arrival at the same chapter id is a fresh object — its resume behavior is intact (issue #238 review)", () => {
    const { handoff } = mountHook();
    const firstArrival = chapterOf("bc-c1");
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    act(() => {
      handoff.consumeArrival(firstArrival);
    });
    expect(handoff.standDownRestoreFor(firstArrival)).toBe(true);
    // The reader crossed away and later returned to bc-c1 through a chapter
    // link (no handoff intent): the load effect produces a NEW article
    // object for the SAME id. The old stand-down must not suppress that
    // arrival's saved-location restore.
    const laterArrival = chapterOf("bc-c1");
    expect(laterArrival).not.toBe(firstArrival);
    expect(handoff.standDownRestoreFor(laterArrival)).toBe(false);
  });

  it("unmount cancels a pending navigation (leaving the book aborts the handoff)", async () => {
    const { handoff, unmount } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    unmount();
    await act(settleFrame);
    expect(window.location.hash).toBe("");
  });

  it("returns ONE stable API object across re-renders (effects may depend on it)", () => {
    let first!: BookHandoff;
    let second!: BookHandoff;
    function Harness({ tick }: { tick: number }) {
      const current = useBookHandoff();
      if (tick === 0) first = current;
      else second = current;
      return null;
    }
    const view = render(<Harness tick={0} />);
    view.rerender(<Harness tick={1} />);
    view.rerender(<Harness tick={2} />);
    // The load/arrival effects in ArticleView list `handoff` in their deps —
    // a fresh object literal per render would re-run them in a setState loop
    // (the maximum-update-depth regression this pin guards).
    expect(second).toBe(first);
  });

  it("beginBoundaryTurn without a pending turn does not disturb a later handoff (ref-stable across article swaps)", async () => {
    // The hook must survive ArticleView staying MOUNTED across the chapter
    // swap (articleId prop change): a second handoff later in the same
    // mount navigates just like the first.
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    await act(settleFrame);
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c0",
        direction: "previous",
        flushDeparting: () => {},
      });
    });
    await act(settleFrame);
    expect(window.location.hash).toBe("#/article/bc-c0");
  });

  it("the arriving generation is consumed even when the same target id had an earlier handoff (generation, not id, keys the claim)", () => {
    const { handoff } = mountHook();
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).not.toBeNull();
    // The reader crossed back and crosses forward again — the NEW handoff
    // must be consumable despite the same target id.
    act(() => {
      handoff.beginBoundaryTurn({
        targetId: "bc-c1",
        direction: "next",
        flushDeparting: () => {},
      });
    });
    expect(handoff.consumeArrival(chapterOf("bc-c1"))).not.toBeNull();
  });
});
