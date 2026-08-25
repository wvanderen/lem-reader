// tests/unit/library/page-meta.test.ts
// Plan 14-01 Task 2 — unit coverage for pageMeta.ts (the D14-02
// foundation). Pins the 14-UI-SPEC §Copywriting Contract exactly: the
// "Lem Reader" suffix, the em-dash separator with one space each side,
// and the 64-char content cap + ellipsis before the suffix. jsdom owns
// document.title here; no layout is asserted (that is Playwright's job).
import { describe, expect, it } from "vitest";
import {
  TITLE_SUFFIX,
  setDocumentTitle,
} from "../../../src/ingestion/library/pageMeta";

describe("TITLE_SUFFIX", () => {
  it('is exported as "Lem Reader"', () => {
    expect(TITLE_SUFFIX).toBe("Lem Reader");
  });
});

describe("setDocumentTitle (D14-02 — '<content> — Lem Reader')", () => {
  it("sets the library title with the em-dash separator and suffix", () => {
    setDocumentTitle("Saved articles");
    expect(document.title).toBe("Saved articles — Lem Reader");
  });

  it("sets the error-state title verbatim (the D14-06 form)", () => {
    setDocumentTitle("Couldn't open this article");
    expect(document.title).toBe("Couldn't open this article — Lem Reader");
  });

  it("content of exactly 64 characters passes through untruncated", () => {
    const content64 = "a".repeat(64);
    setDocumentTitle(content64);
    expect(document.title).toBe(`${content64} — Lem Reader`);
  });

  it("content of 65 characters truncates to the first 64 plus an ellipsis before the suffix", () => {
    const content65 = "b".repeat(65);
    setDocumentTitle(content65);
    expect(document.title).toBe(`${"b".repeat(64)}… — Lem Reader`);
  });
});
