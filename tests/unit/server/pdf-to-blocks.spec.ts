// tests/unit/server/pdf-to-blocks.spec.ts
// Plan 11-02 Task 1 — the pdfToBlocks adapter suite (sibling of
// `markdown-to-blocks.spec.ts`). Task 1 asserts the proxy lifecycle's typed
// refusals, the pdfjs error mapping, the page cap, and the page-weighted
// scanned / multi-column detection over BOTH the committed synthetic fixtures
// (real pdf.js extraction) and hand-built item arrays (detection algebra).
//
// Task 2 (same file) adds the assembly describes: headings (outline-first +
// font-size fallback), hyphenation joins, x-gap space insertion, honest
// unsupported blocks, title sanity, and the five-field adapter contract.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StructuredTextItem } from "unpdf";
import {
  assertPageCap,
  classifyDocument,
  mapPdfjsError,
  PDF_THRESHOLDS,
  pdfToBlocks,
} from "../../../server/pdfToBlocks";
import { IngestionError } from "../../../server/errors";

// ── Synthetic fixture loading (tests/fixtures/pdf — committed corpus) ────────
const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "pdf",
);

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

/** Rejects with an IngestionError carrying exactly `reason`. */
async function refusalOf(name: string): Promise<string> {
  try {
    await pdfToBlocks(fixtureBytes(name));
  } catch (err) {
    expect(err).toBeInstanceOf(IngestionError);
    return (err as IngestionError).reason;
  }
  throw new Error(`expected ${name} to refuse; it resolved instead`);
}

// ── Hand-built item arrays (detection algebra — no I/O) ──────────────────────
/** One positional text item; width approximated at 0.5em per char like 12pt
 * Helvetica body text (fixtures measure ~6pt average glyph advance). */
function titem(str: string, x: number, y: number, fontSize = 12): StructuredTextItem {
  return {
    str,
    x,
    y,
    width: str.length * 6,
    height: fontSize,
    fontSize,
    fontFamily: "sans-serif",
    dir: "ltr",
    hasEOL: true,
  };
}

/** A columnar page: 10 rows × two x-clusters (gutter 60→180 vs 312→432). */
function columnarPage(): StructuredTextItem[] {
  const items: StructuredTextItem[] = [];
  for (let row = 0; row < 10; row++) {
    const y = 740 - row * 16;
    items.push(titem("aaaaaaaaaaaaaaaaaaaa", 60, y));
    items.push(titem("bbbbbbbbbbbbbbbbbbbb", 312, y));
  }
  return items;
}

/** A prose page: 10 full-width single-column lines. */
function prosePage(): StructuredTextItem[] {
  const items: StructuredTextItem[] = [];
  for (let row = 0; row < 10; row++) {
    items.push(titem("c".repeat(60), 60, 740 - row * 16));
  }
  return items;
}

/** A near-empty page: 2 short items (below nearEmptyItemFloor=3). */
function sparsePage(): StructuredTextItem[] {
  return [titem("hi", 60, 740), titem("ok", 60, 720)];
}

// ── Task 1 — typed refusals over the committed fixtures ──────────────────────
describe("pdfToBlocks — typed refusals (synthetic fixtures, real pdf.js)", () => {
  it("synthetic-corrupt.pdf refuses with pdf-unreadable", async () => {
    await expect(refusalOf("synthetic-corrupt.pdf")).resolves.toBe("pdf-unreadable");
  });

  it("synthetic-scanned.pdf refuses with pdf-scanned (zero-text majority)", async () => {
    await expect(refusalOf("synthetic-scanned.pdf")).resolves.toBe("pdf-scanned");
  });

  it("synthetic-two-column.pdf refuses with pdf-multi-column (never silently reordered)", async () => {
    await expect(refusalOf("synthetic-two-column.pdf")).resolves.toBe("pdf-multi-column");
  });

  it("synthetic-single-column.pdf resolves (admitted, not refused)", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    expect(result).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it("synthetic-outline.pdf resolves (admitted, not refused)", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-outline.pdf"));
    expect(result).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
  });
});

// ── Task 1 — pdfjs error mapping (name-string match — Pattern 7) ─────────────
describe("mapPdfjsError — PasswordException / InvalidPDFException name match", () => {
  it("maps a PasswordException-named error to IngestionError pdf-encrypted", () => {
    const err = Object.assign(new Error("No password given"), { name: "PasswordException" });
    const mapped = mapPdfjsError(err);
    expect(mapped).toBeInstanceOf(IngestionError);
    expect((mapped as IngestionError).reason).toBe("pdf-encrypted");
  });

  it("maps an InvalidPDFException-named error to IngestionError pdf-unreadable", () => {
    const err = Object.assign(new Error("Invalid PDF structure."), { name: "InvalidPDFException" });
    const mapped = mapPdfjsError(err);
    expect(mapped).toBeInstanceOf(IngestionError);
    expect((mapped as IngestionError).reason).toBe("pdf-unreadable");
  });

  it("returns null for unknown error names (caller rethrows; orchestrator maps to server-error)", () => {
    expect(mapPdfjsError(new Error("boom"))).toBeNull();
    expect(mapPdfjsError(Object.assign(new Error("x"), { name: "SomethingElseException" }))).toBeNull();
    expect(mapPdfjsError("not an error")).toBeNull();
    expect(mapPdfjsError(null)).toBeNull();
  });
});

// ── Task 1 — page cap (Pitfall 9: checked BEFORE any extract call) ───────────
describe("assertPageCap — pdf-too-large boundary", () => {
  it("throws IngestionError pdf-too-large at 501 pages", () => {
    expect(() => assertPageCap(501)).toThrowError(IngestionError);
    try {
      assertPageCap(501);
    } catch (err) {
      expect((err as IngestionError).reason).toBe("pdf-too-large");
    }
  });

  it("does not throw at exactly 500 pages (PDF_MAX_PAGES)", () => {
    expect(() => assertPageCap(500)).not.toThrow();
  });
});

// ── Task 1 — page-weighted detection algebra (D11-03 majorities) ─────────────
describe("classifyDocument — page-weighted verdicts over hand-built items", () => {
  it("2-of-3 columnar text-bearing pages → multiColumn true", () => {
    const verdict = classifyDocument([columnarPage(), columnarPage(), prosePage()]);
    expect(verdict.textBearingPages).toBe(3);
    expect(verdict.columnarPages).toBe(2);
    expect(verdict.multiColumn).toBe(true);
    expect(verdict.scanned).toBe(false);
  });

  it("1-of-3 columnar text-bearing pages → multiColumn false", () => {
    const verdict = classifyDocument([columnarPage(), prosePage(), prosePage()]);
    expect(verdict.columnarPages).toBe(1);
    expect(verdict.multiColumn).toBe(false);
  });

  it("2-of-3 near-empty pages → scanned true (majority of ALL pages)", () => {
    const verdict = classifyDocument([sparsePage(), sparsePage(), prosePage()]);
    expect(verdict.nearEmptyPages).toBe(2);
    expect(verdict.totalPages).toBe(3);
    expect(verdict.scanned).toBe(true);
    expect(verdict.multiColumn).toBe(false);
  });

  it("1-of-3 near-empty pages → scanned false (a decorative cover admits)", () => {
    const verdict = classifyDocument([sparsePage(), prosePage(), prosePage()]);
    expect(verdict.nearEmptyPages).toBe(1);
    expect(verdict.scanned).toBe(false);
  });

  it("a page with zero text items is not text-bearing and cannot be columnar", () => {
    const verdict = classifyDocument([[]]);
    expect(verdict.totalPages).toBe(1);
    expect(verdict.textBearingPages).toBe(0);
    expect(verdict.columnarPages).toBe(0);
    expect(verdict.multiColumn).toBe(false);
    expect(verdict.scanned).toBe(true); // 1-of-1 near-empty is a scanned majority
  });
});

// ── Task 1 — the exported calibration surface (11-06 harness imports this) ───
describe("PDF_THRESHOLDS — exported calibration surface", () => {
  it("carries the D11-02 starting values the calibration harness records", () => {
    // Detection (Pattern 3/4) — the numbers the 11-06 evidence file snapshots.
    expect(PDF_THRESHOLDS.wideBandRatio).toBe(0.55);
    expect(PDF_THRESHOLDS.gutterVoteRatio).toBe(0.2);
    expect(PDF_THRESHOLDS.minGutterEm).toBe(1);
    expect(PDF_THRESHOLDS.colTextShare).toBe(0.15);
    expect(PDF_THRESHOLDS.columnarMajorityRatio).toBe(0.5);
    expect(PDF_THRESHOLDS.scannedItemFloor).toBe(8);
    expect(PDF_THRESHOLDS.scannedCharFloor).toBe(40);
    expect(PDF_THRESHOLDS.nearEmptyItemFloor).toBe(3);
    expect(PDF_THRESHOLDS.nearEmptyCharFloor).toBe(15);
    expect(PDF_THRESHOLDS.scannedMajorityRatio).toBe(0.5);
  });
});
