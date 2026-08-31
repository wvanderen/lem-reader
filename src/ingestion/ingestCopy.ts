// src/ingestion/ingestCopy.ts
// Plan 16-02 Task 1 — the single home of the ingest refusal-copy map and
// the chunked base64 helper, extracted BYTE-IDENTICALLY from the original
// three-form ingest control (their home since Plan 07-06): same
// signatures, same doc comments, same string table. The 20-reason calm
// DOC-06 catalog is load-bearing product surface pinned byte-for-byte by
// tests/unit/pdf-copy.test.ts + tests/unit/epub-copy.test.ts — those tests
// changed ONLY their import path (T-16-03); the EXPECTED_* tables stayed
// untouched, so the extraction is provably behavior-neutral.
//
// Plan 16-03 deleted the original three-form control along with its
// LibraryView mount; AddDialog (Plan 16-02 Task 2) is the sole consumer
// of this pair — no fork.
import type { IngestionFailureReason } from "./types";

/**
 * mapReasonToCopy — D7-04 honest-failure copy mapping. Every
 * IngestionFailureReason from the 20-reason catalog (07-02 + Phase 11
 * Pattern 7 + Phase 12) is mapped to a calm DOC-06 phrase. NEVER surfaces
 * internal jargon (fixture/Zod/schema/revision/enum hyphenation) — the
 * T-7-26 + T-11-04 mitigation. The phrases mirror the existing FixtureList +
 * ArticleView status-region vocabulary so the control feels native to the
 * rest of the reader.
 *
 * Exported (Phase 11 Plan 04) so tests/unit/pdf-copy.test.ts asserts the
 * five PDF entries against the EXACT 11-RESEARCH.md §Pattern 7 strings;
 * tests/unit/epub-copy.test.ts (Phase 12 Plan 03) pins the four EPUB
 * entries byte-for-byte at this same live exported surface.
 */
export function mapReasonToCopy(reason: IngestionFailureReason): string {
  switch (reason) {
    case "ssrf-blocked-scheme":
    case "ssrf-blocked-private-ip":
    case "ssrf-blocked-metadata":
      return "This address points somewhere the reader can't reach.";
    case "fetch-failed":
      return "Couldn't reach this page.";
    case "response-too-large":
      return "This page is too large.";
    case "unsupported-content-type":
      return "This page isn't an article.";
    case "extraction-unsupported":
    case "extraction-too-low-confidence":
    case "round-trip-anchor-failed":
      return "Couldn't reliably read this page.";
    case "pdf-unreadable":
      return "This PDF couldn't be opened — it may be corrupt or not a PDF.";
    case "pdf-encrypted":
      return "This PDF is password-protected, so its text can't be read.";
    case "pdf-scanned":
      return "This PDF looks like scanned images rather than text. An OCR tool could convert it first.";
    case "pdf-multi-column":
      return "This PDF has multiple text columns, and its reading order can't be reconstructed reliably yet.";
    case "pdf-too-large":
      return "This PDF is too long or too large to read here.";
    // Phase 12 (ING-05) — the four EPUB refusal reasons. Calm DOC-06
    // strings; pinned byte-for-byte by tests/unit/epub-copy.test.ts.
    case "epub-protected":
      return "This book is protected by DRM and cannot be added.";
    case "epub-unreadable":
      return "This file could not be read as an EPUB book.";
    case "epub-empty":
      return "No readable chapters were found in this book.";
    case "epub-too-large":
      return "This book is too large to add.";
    case "already-in-library":
      return "Already in your library.";
    case "server-error":
    default:
      return "Something went wrong. Try again.";
  }
}

/**
 * bytesToBase64 — binary→base64 for the PDF upload arm (ING-04). Converts
 * in 0x8000-element chunks (String.fromCharCode spread + btoa) so a
 * multi-MB PDF never hits the Function.prototype.apply / spread
 * call-stack limit — a one-shot String.fromCharCode(...bytes) on a 10MB
 * file throws RangeError. The server decodes the base64 back to bytes and
 * runs pdfToBlocks (server-only; unpdf never crosses into this bundle —
 * Pitfall 12).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * base64ToBytes — the decode sibling of bytesToBase64, for the Phase 20
 * asset response envelope (20-02 Task 3). atob returns the full binary
 * string C++-side (no spread, no apply — the encode-side stack limit does
 * not apply), and the fill loop walks 0x8000-char chunks mirroring the
 * encoder's shape so the pair reads as one discipline. The result is
 * ArrayBuffer-backed (sha256Hex's Uint8Array<ArrayBuffer> contract).
 */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  const CHUNK_SIZE = 0x8000;
  for (let start = 0; start < binary.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, binary.length);
    for (let i = start; i < end; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
  }
  return bytes;
}
