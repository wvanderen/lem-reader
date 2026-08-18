// server/limits.ts
// Plan 07-03 Task 1 — the locked resource-cap constants every Wave-2+ server
// module imports. Values come from 07-RESEARCH.md §Timeout / Size-Cap Exact
// Numbers L612-620 and 07-CONTEXT.md `<decisions>` L43-49 (the human-locked
// resource caps). The PRIVATE_RANGES deny-list is the OWASP SSRF Cheat Sheet
// Case 2 minimum (CITED: 07-RESEARCH.md L401-406); the ip-address library
// checks resolved IPs against these CIDRs.
//
// This module is platform-agnostic /server code (D7-05 adapter boundary) — no
// /functions dependency, portable to any runtime.

/** Fetch timeout (AbortSignal.timeout cap). CONTEXT.md "~30s"; Workers CPU
 * limit is 30s on most plans. Generous enough for slow publishers; tight
 * enough to prevent the fetcher being weaponized as a DoS amplifier. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum response body size. A real article HTML is 100KB–2MB; 5MB caps
 * pathological pages without rejecting legitimate long-form. Checked against
 * the Content-Length header BEFORE res.text() (Measure 7 — no body leak on
 * refusal). */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Redirect cap. OWASP recommends 3–5; 5 covers legitimate redirect chains
 * (e.g. medium.com → cdn) without enabling redirect-loops. Each hop is
 * re-validated through the full safeFetch pipeline (Measure 2). */
export const MAX_REDIRECTS = 5;

/** Content-type allowlist. CONTEXT.md lock. Only (text|application)/(xhtml+)html
 * is accepted; application/pdf, image/*, text/plain etc. are refused at the
 * boundary (Measure 12). */
export const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

/** Private / reserved IP ranges — the OWASP SSRF Cheat Sheet Case 2 deny-list
 * minimum. The ip-address library's Address4/Address6.isInSubnet checks every
 * resolved IP against these CIDRs (Measure 4). Covers:
 *   - 10/8, 172.16/12, 192.168/16 (RFC 1918 private)
 *   - 169.254/16 (link-local + cloud-metadata)
 *   - 127/8 (loopback)
 *   - 0/8 (this-network)
 *   - 100.64/10 (CGNAT — RFC 6598)
 *   - 224/4 (multicast)
 *   - ::1/128, fc00::/7, fe80::/10, ff00::/8 (IPv6 reserved scopes)
 * CITED: 07-RESEARCH.md §SSRF Guard Implementation L401-406. */
export const PRIVATE_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "127.0.0.0/8",
  "0.0.0.0/8",
  "100.64.0.0/10",
  "224.0.0.0/4",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
] as const;

/** Cloud-metadata hostnames — the explicit blocklist (Measure 5). AWS/GCP/Azure
 * metadata endpoints serve credentials to anyone who can reach them; blocking
 * the hostname BEFORE DNS resolution closes the cheapest SSRF exfil path.
 * CITED: 07-RESEARCH.md §SSRF Guard Implementation L407. */
export const METADATA_HOSTNAMES = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.amazonaws.com",
] as const;

// ── Phase 11 — PDF intake resource caps (Plan 11-01 Task 2; T-11-01 DoS) ─────
// Values from 11-PATTERNS.md §server/limits.ts + the planner resolutions of
// 11-RESEARCH Open Question 2 (timeout mirrors REQUEST_TIMEOUT_MS) and the
// ARCHITECTURE.md L781 "16 MB" mislabel correction (State of the Art).

// The decoded-byte cap lives in src/ingestion/types.ts (PDF_MAX_BYTES) because
// the /src→/server import direction is forbidden — the client picker needs the
// same constant. Imported + re-exported here so server modules import every cap
// from ONE module (server/limits.ts), per the Wave-2+ convention above.
import { PDF_MAX_BYTES } from "../src/ingestion/types";
export { PDF_MAX_BYTES };

/** Maximum page count of an admitted PDF (T-11-01 DoS cap). ~500 pages covers
 * book-length documents while bounding extraction work; a document over this
 * refuses with `pdf-too-large` BEFORE parsing begins. */
export const PDF_MAX_PAGES = 500;

/** PDF extraction timeout (AbortSignal cap) — mirrors REQUEST_TIMEOUT_MS above
 * (planner resolution of 11-RESEARCH Open Question 2): Workers CPU limit is
 * 30s on most plans and text extraction is CPU-bound, so the same wall-clock
 * generosity/tightness tradeoff applies. */
export const PDF_EXTRACTION_TIMEOUT_MS = 30_000;

/** MAX_IMAGE_PIXELS — the pdf.js image-decompression bomb cap. PROVENANCE
 * CORRECTION: this is TOTAL PIXELS (width×height ≈ 16 megapixels), NOT bytes —
 * correcting the ARCHITECTURE.md L781 "16 MB" label per 11-RESEARCH.md §State
 * of the Art. A modest pixel count decompresses to enormous byte counts (the
 * classic zip-bomb analog: a tiny PNG declaring a 65,000×65,000 canvas); the
 * pdf.js `EvaluatorOptions.maxImagePixels` option counts PIXELS, and 16,777,216
 * (4096×4096) is its default ceiling — re-stated here explicitly so the cap is
 * auditable alongside every other server limit. */
export const MAX_IMAGE_PIXELS = 16_777_216;

// ── Phase 12 — EPUB intake resource caps (Plan 12-01 Task 2; T-12-01 DoS) ─────
// Values from 12-PATTERNS.md §dev-server/ingest-middleware.ts + server/limits.ts
// and the planner resolutions of 12-RESEARCH assumption A2 (caps mirror the
// PDF precedent) + Pitfall 2 (transport cap derives from the max of both).

// The EPUB decoded-byte cap lives in src/ingestion/types.ts (EPUB_MAX_BYTES)
// for the same /src→/server import-direction reason as PDF_MAX_BYTES above —
// the client picker needs the same constant. Imported + re-exported here so
// server modules keep importing every cap from ONE module.
import { EPUB_MAX_BYTES } from "../src/ingestion/types";
export { EPUB_MAX_BYTES };

/** Maximum chapter (article) count of an admitted EPUB (assumption A2 sanity
 * ceiling; T-12-01 DoS cap). A real book never approaches 1000 chapters; an
 * EPUB whose TOC/spine derives more refuses with `epub-too-large` before
 * per-chapter work begins. */
export const EPUB_MAX_CHAPTERS = 1000;

/** EPUB extraction timeout (AbortSignal cap) — mirrors REQUEST_TIMEOUT_MS and
 * PDF_EXTRACTION_TIMEOUT_MS above: the EPUB unzip + XML parse + per-chapter
 * sanitize/walk is CPU-bound, so the same wall-clock generosity/tightness
 * tradeoff applies (12-RESEARCH Open Question 2's PDF resolution, EPUB
 * edition). */
export const EPUB_EXTRACTION_TIMEOUT_MS = 30_000;

/** Per-entry decompressed bomb cap for EPUB archive entries (T-12-01). A
 * single XHTML document over 64MB inside a ≤10MB zip is pathological; this
 * is the Phase 9 MAX_ENTRY_ORIGINAL_SIZE discipline (fflate filter skips
 * over-cap entries BEFORE inflation — over-cap entries are never inflated)
 * at an EPUB-appropriate constant. Enforced in 12-02's epubToBooks. */
export const EPUB_MAX_ENTRY_BYTES = 64 * 1024 * 1024;

/** Maximum raw JSON body size accepted by the ingest middleware for the
 * binary upload paths. The request carries base64-in-JSON (~33% inflation
 * over the decoded cap) plus JSON envelope overhead (keys, filename, quotes)
 * — Pitfall 7 of 11-RESEARCH.md + Pitfall 2 of 12-RESEARCH.md: the
 * middleware must refuse on `content-length` BEFORE readBody accumulates,
 * and this is the number it checks against. Derived from the LARGER of the
 * two decoded caps so whichever format diverges upward stays admissible —
 * numerically identical today (equal 10MB caps) but structurally correct
 * for future divergence. The +2048 slack absorbs the envelope; the
 * Math.ceil rounds the 4/3 base64 ratio up so a maximum-size valid upload
 * is never refused by the transport guard. */
export const MAX_INGEST_BODY_BYTES =
  Math.ceil((Math.max(PDF_MAX_BYTES, EPUB_MAX_BYTES) * 4) / 3) + 2048;
