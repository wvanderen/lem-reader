// tests/unit/collections/parse-collection-context.test.ts
// Issue #247 — the /col/<collectionId>/<entryId> route-grammar cases for
// parseHash (src/App.tsx). These live in the UNIT project (their own jsdom
// window + worker), deliberately NOT beside the App component tests: every
// `window.location.hash` assignment queues an async hashchange, and the
// component suite's App-render tests sit close to React's nested-update
// limit when many queued events drain inside one flush — the grammar cases
// don't render React at all, so they isolate cleanly here.
//
// The suffix is navigation context only (ADR 0011 — never a second saved
// position): the reader's open carries WHICH collection entry it serves,
// anchored on the STABLE entry id. Ids match the validated-record charset
// [a-z0-9-]+; anything else misses the grammar and falls through to the
// list fallback (the T-10-02a discipline — lookup keys only, never markup,
// never dynamic property access).
import { describe, expect, it } from "vitest";
import { parseHash } from "../../../src/App";

describe("parseHash — the /col/ collection-context suffix (issue #247)", () => {
  it("maps '#/article/<id>/col/<collectionId>/<entryId>' to the article view with collection context", () => {
    window.location.hash = "#/article/a-one/col/col-7/entry-3";
    expect(parseHash()).toEqual({
      name: "article",
      id: "a-one",
      collectionId: "col-7",
      entryId: "entry-3",
    });
  });

  it("maps '#/article/<id>/c/<scope>/col/<collectionId>/<entryId>' with BOTH the assignment scope and the collection context", () => {
    window.location.hash = "#/article/a-one/c/chapter/col/col-7/entry-3";
    expect(parseHash()).toEqual({
      name: "article",
      id: "a-one",
      chapterScope: "chapter",
      collectionId: "col-7",
      entryId: "entry-3",
    });
  });

  it("maps '#/article/<id>/col/<collectionId>' (missing entryId) to the list view", () => {
    // The optional /col/ group requires BOTH ids — an empty capture fails
    // the group AND the $ anchor, so the regex misses and the parser falls
    // through to the list fallback (the /h/ trailing-slash precedent).
    window.location.hash = "#/article/a-one/col/col-7";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  it("rejects an out-of-charset collection id (uppercase) — list fallback", () => {
    window.location.hash = "#/article/a-one/col/Col-7/entry-3";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  it("does not capture a /col/ suffix after an /h/ deep-link (the two suffixes never combine)", () => {
    window.location.hash = "#/article/a-one/h/hl-123";
    expect(parseHash()).toEqual({ name: "article", id: "a-one", jumpHighlightId: "hl-123" });
  });
});
