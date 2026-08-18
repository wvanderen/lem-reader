// tests/unit/epub-copy.test.ts
// Phase 12 Plan 03 Task 2 — exact-string calm-copy assertions for the four
// EPUB refusal reasons + the no-jargon guard extended to the 20-reason
// catalog. Mirrors tests/unit/pdf-copy.test.ts (the 11-04 byte-for-byte
// copy-pinning precedent).
//
// The copy strings are LOAD-BEARING product surface (DOC-06 calm voice in
// the `.status` live region — D7-04): every character is asserted exactly.
// A "close enough" match would let a refactor silently drift the reader-
// facing voice, so the test pins the plan's four strings byte-for-byte
// against the LIVE exported mapReasonToCopy surface (imported from
// IngestControl, not a fixture copy).
import { describe, expect, it } from "vitest";
import { mapReasonToCopy } from "../../src/ingestion/IngestControl";
import {
  IngestionFailureReasonEnum,
  type IngestionFailureReason,
} from "../../src/ingestion/types";

// The four Phase 12 EPUB entries — EXACT strings from 12-03-PLAN.md Task 2
// action 2c (locked by this plan; calm DOC-06 voice, no internal jargon).
const EXPECTED_EPUB_COPY: Record<string, string> = {
  "epub-protected": "This book is protected by DRM and cannot be added.",
  "epub-unreadable": "This file could not be read as an EPUB book.",
  "epub-empty": "No readable chapters were found in this book.",
  "epub-too-large": "This book is too large to add.",
};

describe("mapReasonToCopy EPUB entries (12-03 Task 2)", () => {
  it("maps each of the four EPUB reasons to its EXACT plan string, byte-for-byte", () => {
    for (const [reason, expected] of Object.entries(EXPECTED_EPUB_COPY)) {
      expect(mapReasonToCopy(reason as IngestionFailureReason)).toBe(expected);
    }
  });

  it("returns a non-empty calm phrase ending in a period for EVERY cataloged reason (exhaustive, 20)", () => {
    expect(IngestionFailureReasonEnum.options.length).toBe(20);
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.endsWith(".")).toBe(true);
    }
  });

  it("does NOT leak internal jargon into any reader-facing refusal copy (T-7-26/T-11-04/T-12-10)", () => {
    // The EPUB-format internal tokens (checked case-insensitively — the
    // copy strings legitimately say "EPUB book", which is reader-facing
    // format vocabulary like "PDF", NOT the raw enum ids). "epub-chapter"
    // as a raw id (the ArticleSource member) must never surface.
    const jargonMarkers = [
      "zod",
      "schema",
      "base64",
      "spine",
      "opf",
      "ncx",
      "manifest",
      "anchor",
      "epub-chapter",
      "exception",
      "error:",
      "undefined",
      "[object",
    ];
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason).toLowerCase();
      for (const marker of jargonMarkers) {
        expect(copy).not.toContain(marker);
      }
    }
  });
});
