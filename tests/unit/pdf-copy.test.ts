// tests/unit/pdf-copy.test.ts
// Phase 11 Plan 04 Task 2 — exact-string calm-copy assertions for the five
// PDF refusal reasons (11-RESEARCH.md §Pattern 7) + the T-11-04 no-jargon
// guard (extends the T-7-26 "does NOT leak internal jargon" pattern).
//
// The copy strings are LOAD-BEARING product surface (DOC-06 calm voice in
// the `.status` live region — D7-04): every character is asserted exactly,
// including the em dashes (U+2014) in pdf-unreadable + pdf-multi-column.
// A "close enough" match would let a refactor silently drift the reader-
// facing voice, so the test pins the Pattern-7 table byte-for-byte.
import { describe, expect, it } from "vitest";
import { mapReasonToCopy } from "../../src/ingestion/IngestControl";
import {
  IngestionFailureReasonEnum,
  type IngestionFailureReason,
} from "../../src/ingestion/types";

// The five Phase 11 PDF entries — EXACT strings from 11-RESEARCH.md
// §Pattern 7 (researcher-discretion recommendation, locked by this plan).
const EXPECTED_PDF_COPY: Record<string, string> = {
  "pdf-unreadable":
    "This PDF couldn't be opened — it may be corrupt or not a PDF.",
  "pdf-encrypted":
    "This PDF is password-protected, so its text can't be read.",
  "pdf-scanned":
    "This PDF looks like scanned images rather than text. An OCR tool could convert it first.",
  "pdf-multi-column":
    "This PDF has multiple text columns, and its reading order can't be reconstructed reliably yet.",
  "pdf-too-large": "This PDF is too long or too large to read here.",
};

describe("mapReasonToCopy PDF entries (11-04 Task 2)", () => {
  it("maps each of the five PDF reasons to its EXACT Pattern-7 string", () => {
    for (const [reason, expected] of Object.entries(EXPECTED_PDF_COPY)) {
      expect(mapReasonToCopy(reason as IngestionFailureReason)).toBe(expected);
    }
  });

  it("returns a non-empty calm phrase for EVERY cataloged reason (exhaustive)", () => {
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.endsWith(".")).toBe(true);
    }
  });

  it("does NOT leak internal jargon into any reader-facing refusal copy (T-11-04/T-7-26)", () => {
    const jargonMarkers = [
      "Exception", // pdfjs class names (InvalidPDFException, PasswordException)
      "Error:", // stack-trace prefixes
      "Zod",
      "schema",
      "pdf-", // enum hyphenation (pdf-unreadable etc.) must not surface
      "ssrf-",
      "extraction-",
      "response-too-",
      "round-trip-",
      "undefined",
      "[object",
    ];
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason);
      for (const marker of jargonMarkers) {
        expect(copy).not.toContain(marker);
      }
    }
  });
});
