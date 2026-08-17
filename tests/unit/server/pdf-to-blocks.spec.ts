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
  isSanePdfTitle,
  mapPdfjsError,
  outlineHeadingTargets,
  PDF_THRESHOLDS,
  pdfToBlocks,
  saneInfoTitle,
} from "../../../server/pdfToBlocks";
import { IngestionError } from "../../../server/errors";
import { BlockSchema, type Block } from "../../../src/content/schema";
import {
  buildContentStream,
  serializePdf,
  type TextLine,
} from "../../fixtures/pdf/generate-synthetic-pdfs";

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
    // 11-07 gap closure — the adapter-level ADMISSION assertion the coverage
    // gap never proved: the orchestrator's !isReaderable gate
    // (server/ingest.ts L329) reads exactly this field, and the fixture's
    // sparse pages (6/4 real items, both under scannedItemFloor) carry ZERO
    // text-bearing pages while NO page is near-empty — legitimately sparse
    // structured documents (outline/title-page shapes) must admit.
    expect(result.isReaderable).toBe(true);
    expect(result.blocks.length).toBeGreaterThanOrEqual(3);
    // The outline-coerced section headings are present as level-2 blocks
    // (heading coercion itself is pinned in the outline-destinations
    // describe below; re-observed here so admission + structure assert
    // together — the UAT Test 2 expectation at adapter level).
    const headings = result.blocks
      .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
      .map((b) => ({ text: textOf(b), level: b.level }));
    expect(headings).toContainEqual({ text: "Outlined Document", level: 2 });
    expect(headings).toContainEqual({ text: "Second Section", level: 2 });
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

// ── Task 2 helpers ────────────────────────────────────────────────────────────
/** Concatenated inline-run text of a heading/paragraph block (""). */
function textOf(block: Block): string {
  if (block.kind === "heading" || block.kind === "paragraph") {
    return block.content.map((run) => run.text).join("");
  }
  return "";
}

/** A tiny one-page probe PDF from the SAME serializer that built the
 * committed corpus (no forked PDF writer). */
function tinyPdf(lines: TextLine[]): Uint8Array {
  return new Uint8Array(serializePdf({ pages: [buildContentStream(lines)] }));
}

// ── Task 2 — adapter contract (five-field result, locked invariant) ──────────
describe("pdfToBlocks — five-field adapter contract (single-column fixture)", () => {
  it("resolves with exactly the MarkdownToBlocksResult-shaped five fields", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    expect(Object.keys(result).sort()).toEqual([
      "blocks",
      "footnotes",
      "isReaderable",
      "lang",
      "provenancePartial",
    ]);
  });

  it("footnotes is empty, lang is 'en', isReaderable is true, blocks ≥ 3", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    expect(result.footnotes).toEqual([]);
    expect(result.lang).toBe("en");
    expect(result.isReaderable).toBe(true);
    expect(result.blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("every block parses against the Block schema (ArticleSchema's own union)", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    for (const block of blocks) {
      expect(() => BlockSchema.parse(block)).not.toThrow();
    }
  });

  it("provenancePartial.title is undefined (fixtures carry no Info titles)", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    expect(result.provenancePartial.title).toBeUndefined();
  });
});

// ── Task 2 — headings via font-size fallback (D11-08) ─────────────────────────
describe("pdfToBlocks — font-size heading fallback", () => {
  it("18pt short groups become heading blocks; 12pt groups stay paragraphs", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    const headingTexts = blocks
      .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
      .map((b) => textOf(b));
    expect(headingTexts).toContain("A Study of Calm Reading");
    expect(headingTexts).toContain("Method");

    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const p of paragraphs) {
      if (p.kind === "paragraph") {
        // body text is 12pt — never a heading under the 1.15 ratio
        expect(p.content.map((r) => r.text).join("")).not.toBe("A Study of Calm Reading");
      }
    }
  });

  it("fallback headings are level 2 (bodies start at h2 — one-h1 rule)", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    const headings = blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading");
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(h.level).toBeGreaterThanOrEqual(2);
      expect(h.level).toBeLessThanOrEqual(6);
    }
  });
});

// ── Task 2 — paragraph assembly + hyphenation joins (Pattern 6) ───────────────
describe("pdfToBlocks — paragraph assembly and hyphenation", () => {
  it("lines of one paragraph join with a space", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    const texts = blocks.map(textOf).join("\n");
    // "…keeps its / measure, and its…" spans a wrapped line break.
    expect(texts).toContain("its measure,");
  });

  it("a line ending in a hyphen before a lowercase line dehyphenates (no hyphen, no space)", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    const texts = blocks.map(textOf).join("\n");
    expect(texts).toContain("conclusion rather than interruption.");
    expect(texts).not.toContain("conclu-");
  });

  it("the page-3 large vertical gap yields one unsupported block mentioning no extractable text", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-single-column.pdf"));
    const gaps = blocks.filter(
      (b): b is Extract<Block, { kind: "unsupported" }> => b.kind === "unsupported",
    );
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.plainDescription).toMatch(/no extractable text/i);
    expect(gaps[0]?.originalKind).toBe("non-text-region");
    // the gap block sits BETWEEN the two paragraph groups of page 3
    const idx = blocks.findIndex((b) => b.kind === "unsupported");
    const before = blocks.slice(0, idx).map(textOf).join(" ");
    const after = blocks.slice(idx + 1).map(textOf).join(" ");
    expect(before).toContain("figure stand-in");
    expect(after).toContain("resumes below the figure stand-in");
  });
});

// ── Task 2 — x-gap space insertion (tiny probe PDFs, real pdf.js widths) ──────
describe("pdfToBlocks — intra-line x-gap space rule (itemGapRatio × fontSize)", () => {
  it("a wide x-gap inserts a space; a tight x-gap does not", async () => {
    // Real pdf.js metrics (measured): 12pt "Hello" is 27.336pt wide, ending
    // at x≈87.34. pdfjs pre-joins close runs into single items (its own
    // space synthesis — RESEARCH A4) and emits separate items plus a
    // whitespace-only synthetic for wide gaps (filtered by the adapter; the
    // x-gap rule owns that join):
    // y=700 pair: "wonderful" at x=100 → 3 items, gap 12.66 > 0.2×12 ⇒ the
    //             adapter's x-gap rule inserts the space.
    // y=650 pair: "world" at x=88 → pdfjs merges gap-free ⇒ "Helloworld".
    const bytes = tinyPdf([
      { x: 60, y: 700, font: "F1", size: 12, text: "Hello" },
      { x: 100, y: 700, font: "F1", size: 12, text: "wonderful" },
      { x: 60, y: 650, font: "F1", size: 12, text: "Hello" },
      { x: 88, y: 650, font: "F1", size: 12, text: "world" },
    ]);
    const result = await pdfToBlocks(bytes);
    const texts = result.blocks.map(textOf);
    const joined = texts.join("\n");
    expect(joined).toContain("Hello wonderful");
    expect(joined).toContain("Helloworld");
  });

  it("isReaderable is false when fewer than 3 blocks (single-paragraph probe)", async () => {
    const bytes = tinyPdf([
      { x: 60, y: 700, font: "F1", size: 12, text: "Hello" },
      { x: 100, y: 700, font: "F1", size: 12, text: "wonderful" },
      { x: 60, y: 650, font: "F1", size: 12, text: "Hello" },
      { x: 88, y: 650, font: "F1", size: 12, text: "world" },
    ]);
    const result = await pdfToBlocks(bytes);
    expect(result.blocks.length).toBeLessThan(3);
    expect(result.isReaderable).toBe(false);
  });

  it("middle band refuses: ≥3 blocks, zero text-bearing pages, a near-empty page ⇒ isReaderable false (11-07 admission guard)", async () => {
    // The boundary test for the isReaderable relaxation: a MULTI-page probe
    // (tinyPdf builds single-page only — call serializePdf directly with an
    // array of buildContentStream pages; do not fork the serializer). Two
    // pages carry 4 widely-spaced short real-text lines each — above the
    // near-empty floors (≥3 items, ≥15 non-ws chars per page) but below
    // scannedItemFloor=8 (4 items), so they are NEITHER near-empty NOR
    // text-bearing. A third page carries a single 1-2 word line (1 real
    // item < nearEmptyItemFloor=3 ⇒ near-empty; 1-of-3 near-empty is NOT a
    // scanned majority, so the adapter RESOLVES rather than throwing
    // pdf-scanned). Blocks comfortably assemble, yet admission must refuse:
    // nearEmptyPages ≥ 1 AND textBearingPages = 0. Proves the relaxed
    // conjunct can never collapse into a blocks-count-only check.
    const sparseLinesPage = (label: string): string =>
      buildContentStream([
        { x: 60, y: 740, font: "F1", size: 12, text: `${label} opening line of text` },
        { x: 60, y: 724, font: "F1", size: 12, text: `${label} second line of text` },
        { x: 60, y: 708, font: "F1", size: 12, text: `${label} third line of text` },
        // 64pt drop over the 16pt modal line delta → beyond paragraph
        // spacing (1.35×16) so this short line is its own block; still far
        // under the 5×lineDelta figure-gap window, and full-width x=60 lines
        // keep the page non-columnar (moot for the verdict — pageIsColumnar
        // only runs on text-bearing pages — but honest to the shape).
        { x: 60, y: 644, font: "F1", size: 12, text: `${label} fourth line of text` },
      ]);
    const bytes = new Uint8Array(
      serializePdf({
        pages: [
          sparseLinesPage("Alpha page"),
          sparseLinesPage("Beta page"),
          buildContentStream([
            { x: 60, y: 740, font: "F1", size: 12, text: "Closing note" },
          ]),
        ],
      }),
    );
    const result = await pdfToBlocks(bytes);
    // Assembles ≥3 blocks: two paragraph blocks per sparse page (the 3-line
    // group + the gap-separated line) plus the near-empty page's ONE
    // unsupported disclosure block.
    expect(result.blocks.length).toBeGreaterThanOrEqual(3);
    // …but the middle band keeps refusing admission.
    expect(result.isReaderable).toBe(false);
  });
});

// ── Task 2 — outline-first heading coercion (D11-08, Pitfall 10) ──────────────
describe("pdfToBlocks — outline destinations coerce target blocks (outline fixture)", () => {
  it("top-level bookmarks coerce their page-top targets to heading level 2", async () => {
    const { blocks } = await pdfToBlocks(fixtureBytes("synthetic-outline.pdf"));
    const headings = blocks
      .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
      .map((b) => ({ text: textOf(b), level: b.level }));
    const opening = headings.find((h) => h.text === "Outlined Document");
    const second = headings.find((h) => h.text === "Second Section");
    // clamp(depth + 2, 2, 6) with depth 0 → level 2 (bodies start at h2).
    expect(opening?.level).toBe(2);
    expect(second?.level).toBe(2);
  });

  it("the outline fixture stays a multi-block readable document", async () => {
    const result = await pdfToBlocks(fixtureBytes("synthetic-outline.pdf"));
    expect(result.blocks.length).toBeGreaterThanOrEqual(3);
    expect(() => BlockSchema.parse(result.blocks[0])).not.toThrow();
  });
});

describe("outlineHeadingTargets — two-shaped dest resolution (stub pdf)", () => {
  it("resolves string-named AND explicit-array dests; skips url-bearing and null dests; nests clamp depth", async () => {
    const stubPdf = {
      getOutline: async () => [
        { title: "Named Dest", dest: "dest-a", url: null, items: [] },
        {
          title: "Array Dest",
          dest: [{ num: 9, gen: 0 }, { name: "XYZ" }, 0, 500, 0],
          url: null,
          items: [],
        },
        { title: "Null Dest", dest: null, url: null, items: [] },
        { title: "Url Entry", dest: "dest-b", url: "https://example.com", items: [] },
        {
          title: "Parent",
          dest: [{ num: 11, gen: 0 }, { name: "XYZ" }, 0, 400, 0],
          url: null,
          items: [
            {
              title: "Nested Child",
              dest: [{ num: 11, gen: 0 }, { name: "XYZ" }, 0, 380, 0],
              url: null,
              items: [],
            },
          ],
        },
      ],
      getDestination: async (id: string) =>
        id === "dest-a" ? [{ num: 3, gen: 0 }, { name: "XYZ" }, 0, 700, 0] : null,
      getPageIndex: async (ref: unknown) =>
        (ref as { num: number }).num === 3 ? 0 : 1,
    };
    const targets = await outlineHeadingTargets(stubPdf);
    // Null-dest and url-bearing entries are skipped; a parent with a valid
    // dest IS a target itself (sections nest — parent + child both coerce).
    expect(targets).toHaveLength(4);
    const named = targets.find((t) => t.title === "Named Dest");
    expect(named?.pageIndex).toBe(0);
    expect(named?.destY).toBe(700);
    expect(named?.level).toBe(2);
    const array = targets.find((t) => t.title === "Array Dest");
    expect(array?.pageIndex).toBe(1);
    expect(array?.destY).toBe(500);
    expect(array?.level).toBe(2);
    const parent = targets.find((t) => t.title === "Parent");
    expect(parent?.level).toBe(2);
    const nested = targets.find((t) => t.title === "Nested Child");
    expect(nested?.level).toBe(3); // depth 1 → clamp(1 + 2, 2, 6)
  });
});

// ── Task 2 — title sanity (D11-07 helper half) ────────────────────────────────
describe("isSanePdfTitle — producer-garbage table", () => {
  it("rejects empty, whitespace, and placeholder titles", () => {
    expect(isSanePdfTitle("")).toBe(false);
    expect(isSanePdfTitle("   ")).toBe(false);
    expect(isSanePdfTitle("untitled")).toBe(false);
    expect(isSanePdfTitle("Untitled")).toBe(false);
  });

  it("rejects producer-filename garbage", () => {
    expect(isSanePdfTitle("Microsoft Word - report.docx")).toBe(false);
    expect(isSanePdfTitle("slides.pptx")).toBe(false);
    expect(isSanePdfTitle("export.pdf")).toBe(false);
  });

  it("rejects hex/UUID blobs and over-200-char titles", () => {
    expect(isSanePdfTitle("0123456789abcdef0123456789abcdef01234567")).toBe(false);
    expect(isSanePdfTitle("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isSanePdfTitle("A".repeat(201))).toBe(false);
  });

  it("accepts real titles", () => {
    expect(isSanePdfTitle("Annual Report 2025")).toBe(true);
    expect(isSanePdfTitle("A Study of Calm Reading")).toBe(true);
  });
});

describe("saneInfoTitle — Info-dict wiring", () => {
  it("returns the Info title when sane, undefined otherwise", () => {
    expect(saneInfoTitle({ Title: "Annual Report 2025" })).toBe("Annual Report 2025");
    expect(saneInfoTitle({ Title: "untitled" })).toBeUndefined();
    expect(saneInfoTitle({ Title: "Microsoft Word - x.docx" })).toBeUndefined();
    expect(saneInfoTitle({})).toBeUndefined();
    expect(saneInfoTitle({ Title: 42 })).toBeUndefined();
  });
});
