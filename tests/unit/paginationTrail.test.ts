// tests/unit/paginationTrail.test.ts
// Issue #255 — the opt-in pagination event trail's own contract: bounded
// retention, initialization semantics, capture across publication changes,
// and the "an empty trail is not evidence" exposure rule. Trail events carry
// identity and ordering only — never article text or user notes — and the
// not-recording snapshot must SAY it was never instrumented.
import { afterEach, describe, expect, it } from "vitest";
import {
  paginationTrailEnabled,
  readPaginationTrail,
  recordTrailEvent,
  resetPaginationTrailForTests,
  startPaginationTrail,
} from "../../src/reader/paginationTrail";

function reset() {
  window.localStorage.clear();
  resetPaginationTrailForTests();
}

afterEach(reset);

describe("pagination event trail (issue #255)", () => {
  it("is disabled by default and says so instead of implying no events happened", () => {
    const snapshot = readPaginationTrail();
    expect(snapshot.recording).toBe(false);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.note).toMatch(/not enabled/i);
    // The exposure rule: an empty trail must never read as "the event did
    // not happen" — the snapshot names how to turn recording on.
    expect(snapshot.note).toMatch(/lemPaginationTrail/);
  });

  it("starts recording when the opt-in flag is set, with an observable trail-start event", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    expect(paginationTrailEnabled()).toBe(true);
    expect(startPaginationTrail()).toBe(true);
    const snapshot = readPaginationTrail();
    expect(snapshot.recording).toBe(true);
    expect(snapshot.initializedAt).toBeGreaterThan(0);
    expect(snapshot.events[0]?.kind).toBe("trail-start");
    expect(snapshot.events[0]?.seq).toBe(1);
  });

  it("starting is idempotent — one trail-start, no duplicate initialization", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    startPaginationTrail();
    const starts = readPaginationTrail().events.filter((e) => e.kind === "trail-start");
    expect(starts).toHaveLength(1);
  });

  it("does not record when never started", () => {
    recordTrailEvent({ kind: "publication", articleId: "a1", cause: "initial" });
    expect(readPaginationTrail().events).toEqual([]);
  });

  it("keeps identity + ordering across publication changes and thread the anchor delta", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      cause: "initial",
      status: "ok",
      publicationSeq: 1,
      pagesLength: 3,
      pageIndex: 0,
      anchorOffset: 100,
      scopeStartBlock: 0,
      scopeEndBlock: 40,
    });
    recordTrailEvent({ kind: "turn-receipt", articleId: "a1", turnSeq: 1, turnDirection: "next" });
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      cause: "turn",
      status: "ok",
      publicationSeq: 2,
      turnSeq: 1,
      turnDirection: "next",
      pagesLength: 3,
      pageIndex: 1,
      anchorOffset: 900,
      scopeStartBlock: 0,
      scopeEndBlock: 40,
    });
    const events = readPaginationTrail().events;
    expect(events.map((e) => e.kind)).toEqual([
      "trail-start",
      "publication",
      "turn-receipt",
      "publication",
    ]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    const first = events[1]!;
    const second = events[3]!;
    expect(first.prevAnchorOffset).toBeNull(); // no prior publication for this article
    expect(second.prevAnchorOffset).toBe(100);
    expect(second.anchorMoved).toBe(true);
    expect(second.scopeChanged).toBe(false); // same scope across the turn
  });

  it("flags scope changes between consecutive publications of one article", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      scopeStartBlock: 0,
      scopeEndBlock: 40,
      anchorOffset: 10,
    });
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      scopeStartBlock: 40,
      scopeEndBlock: 80,
      anchorOffset: 5000,
    });
    const events = readPaginationTrail().events;
    expect(events[2]?.scopeChanged).toBe(true);
  });

  it("does not label a fallback publication (null anchor) as an anchor move", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    recordTrailEvent({ kind: "publication", articleId: "a1", cause: "initial", anchorOffset: 100 });
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      cause: "fallback",
      anchorOffset: null,
    });
    const events = readPaginationTrail().events;
    expect(events[2]?.anchorMoved).toBe(false); // null anchor is not a "move"
    expect(events[2]?.prevAnchorOffset).toBe(100); // …but the prior passage stays visible
    // A later paginated publication still compares against the real anchor.
    recordTrailEvent({
      kind: "publication",
      articleId: "a1",
      cause: "repagination",
      anchorOffset: 100,
    });
    expect(readPaginationTrail().events[3]?.anchorMoved).toBe(false);
  });

  it("does not carry the previous article's anchor into a new article", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    recordTrailEvent({ kind: "publication", articleId: "a1", anchorOffset: 100 });
    recordTrailEvent({ kind: "publication", articleId: "a2", anchorOffset: 50 });
    const events = readPaginationTrail().events;
    expect(events[2]?.prevAnchorOffset).toBeNull();
    expect(events[2]?.anchorMoved).toBe(false); // different article: no comparable prior
  });

  it("bounds retention and counts what the ring evicted", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    for (let i = 0; i < 300; i++) {
      recordTrailEvent({ kind: "overflow-check", articleId: "a1", publicationSeq: i });
    }
    const snapshot = readPaginationTrail();
    expect(snapshot.capacity).toBeGreaterThan(0);
    expect(snapshot.events.length).toBe(snapshot.capacity);
    expect(snapshot.droppedFromHead).toBe(301 - snapshot.capacity); // trail-start included
    // Ordering survives eviction: seqs stay monotonic and the head shows the drop.
    const seqs = snapshot.events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(snapshot.firstEventSeq).toBe(302 - snapshot.capacity);
  });

  it("exposes the trail getter on window once started", () => {
    window.localStorage.setItem("lem.paginationTrail", "1");
    startPaginationTrail();
    const getter = (window as unknown as Record<string, unknown>).__lemPaginationTrail as
      (() => unknown) | undefined;
    expect(typeof getter).toBe("function");
    expect((getter!() as { recording: boolean }).recording).toBe(true);
  });
});
