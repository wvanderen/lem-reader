// tests/unit/library/library-session.test.ts
// Plan 15-03 Task 1 — the librarySession contract (D15-11..14). PURE
// coverage — no React, no Dexie; the module owns only a session-scoped
// snapshot + comparators (the readingState.ts store-seam discipline:
// components own the IO — reads on mount, writes on change/unmount — this
// module owns the algebra).
//
// Contract rows pinned here (15-03-PLAN.md must_haves):
//   - D15-12: session-scoped in-memory ONLY — peek returns null before any
//     capture (cold load); capture OVERWRITES (one snapshot, never a log);
//     peek does not clear (restore is idempotent — StrictMode twin mounts).
//   - D15-13: viewMatches is exact equality — scroll + row focus restore
//     run only when the landing view matches the captured view.
//   - D15-14: clampScroll never restores beyond the list — a saved offset
//     that overshoots the current max clamps to the bottom (the
//     findScrollTarget "corpus changed since save" calm-clamp twin).
//
// ORDERING NOTE: the module holds ONE session singleton. The null-peek
// case is deliberately the FIRST test in this file — it pins the COLD-LOAD
// edge (nothing captured yet in a fresh session). Captures in later tests
// overwrite the singleton, and the round-trip rows below pin that
// overwrite semantics explicitly.
import { describe, expect, it } from "vitest";
import {
  captureLibraryContext,
  clampScroll,
  peekLibraryContext,
  viewMatches,
} from "../../../src/ingestion/library/librarySession";
import type { LibraryContextSnapshot } from "../../../src/ingestion/library/librarySession";

/**
 * A snapshot as plain literals — view name, strings, number, nullable id
 * (the D15-12 shape; no schema-parse builders needed — the snapshot is not
 * a persisted record, so no Zod boundary applies).
 */
function snap(
  overrides: Partial<LibraryContextSnapshot> = {},
): LibraryContextSnapshot {
  return {
    view: "all",
    query: "lantern",
    activeTag: "salt",
    scrollTop: 640,
    lastArticleId: "lr-restore-a06",
    ...overrides,
  };
}

describe("peekLibraryContext — cold load (D15-12: session-scoped, nothing persisted)", () => {
  it("returns null before any capture (fresh session — nothing survives reload)", () => {
    expect(peekLibraryContext()).toBeNull();
  });
});

describe("capture/peek round-trip (D15-12 — ONE session snapshot)", () => {
  it("captureLibraryContext then peekLibraryContext returns the exact snapshot", () => {
    const captured = snap();
    captureLibraryContext(captured);
    expect(peekLibraryContext()).toEqual(captured);
  });

  it("a second capture OVERWRITES the first (one snapshot, never a log)", () => {
    captureLibraryContext(snap({ scrollTop: 100, lastArticleId: "a-first" }));
    const second = snap({
      view: "unread",
      query: "",
      activeTag: null,
      scrollTop: 480,
      lastArticleId: null,
    });
    captureLibraryContext(second);
    expect(peekLibraryContext()).toEqual(second);
  });

  it("peek does not clear — repeated reads are idempotent (StrictMode twin mounts, D15-12)", () => {
    const captured = snap();
    captureLibraryContext(captured);
    expect(peekLibraryContext()).toEqual(captured);
    expect(peekLibraryContext()).toEqual(captured);
  });

  it("round-trips every snapshot field byte-exactly (view, query, tag, scroll, nullable id)", () => {
    const captured = snap({
      view: "finished",
      query: "",
      activeTag: "ember",
      scrollTop: 0,
      lastArticleId: null,
    });
    captureLibraryContext(captured);
    expect(peekLibraryContext()).toEqual({
      view: "finished",
      query: "",
      activeTag: "ember",
      scrollTop: 0,
      lastArticleId: null,
    });
  });
});

describe("viewMatches (D15-13 — scroll/row restore ONLY on exact view match)", () => {
  it("landing === captured → true (every view name)", () => {
    expect(viewMatches("all", "all")).toBe(true);
    expect(viewMatches("unread", "unread")).toBe(true);
    expect(viewMatches("in-progress", "in-progress")).toBe(true);
    expect(viewMatches("finished", "finished")).toBe(true);
  });

  it("any mismatch → false (never restore mismatched scroll — D15-14 honesty)", () => {
    expect(viewMatches("all", "unread")).toBe(false);
    expect(viewMatches("unread", "all")).toBe(false);
    expect(viewMatches("all", "in-progress")).toBe(false);
    expect(viewMatches("in-progress", "finished")).toBe(false);
    expect(viewMatches("finished", "unread")).toBe(false);
  });
});

describe("clampScroll (D15-14 — never restore beyond the list)", () => {
  it("saved < maxScroll passes through unchanged", () => {
    expect(clampScroll(0, 800)).toBe(0);
    expect(clampScroll(400, 800)).toBe(400);
  });

  it("saved exactly at maxScroll (the bottom boundary) passes through", () => {
    expect(clampScroll(800, 800)).toBe(800);
  });

  it("saved > maxScroll clamps to maxScroll (clamp to bottom)", () => {
    expect(clampScroll(1500, 800)).toBe(800);
    expect(clampScroll(801, 800)).toBe(800);
  });

  it("maxScroll 0 (short list) clamps any saved offset to 0", () => {
    expect(clampScroll(700, 0)).toBe(0);
  });
});
