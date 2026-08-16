// tests/fixtures/pdf/generate-synthetic-pdfs.ts
//
// Plan 11-01 Task 3 — deterministic synthetic PDF fixture generator with a
// built-in integrity self-check. Emitting the fixtures requires ONLY node:
// builtins (zero repo imports, zero npm dependencies) so the script runs with
// plain `node` (type-stripping-safe TypeScript: interfaces, type aliases, and
// type assertions only — no enums, no namespaces, no parameter properties).
//
// WHY SYNTHETIC: these fixtures exercise CODE PATHS (adapter parsing, scanned
// refusal, multi-column refusal, outline mapping, dehyphenation), NOT
// calibration thresholds. They are committable by design. The D11-04 real-PDF
// calibration corpus is a DIFFERENT thing entirely — it stays local +
// gitignored (see README.md in this directory).
//
// Each valid fixture is a minimal but well-formed PDF 1.4 document:
//   - "%PDF-1.4" header
//   - Catalog / Pages / Page / Contents / Font object table
//   - computed cross-reference (xref) byte offsets + trailer + startxref
//   - /MediaBox [0 0 612 792] (US Letter)
//   - font resources: /F1 Helvetica, /F2 Helvetica-Bold
//   - text drawn with BT /Fx size Tf x y Td (text) Tj ET operators
//
// Determinism: no timestamps, no random ids, no environment reads. Re-running
// the script produces byte-identical files (proven by the self-check below,
// which hashes a second in-process emit and compares).
//
// Usage: node tests/fixtures/pdf/generate-synthetic-pdfs.ts
// Exit code 0 = all fixtures written + self-check passed; 1 = violation.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

const PDF_VERSION = "%PDF-1.4";
const PDF_MAGIC = "%PDF-";
const PAGE_WIDTH = 612; // US Letter points
const PAGE_HEIGHT = 792;
const CORRUPT_MARKER = "this is not a pdf";
const SIZE_FLOOR_BYTES = 500; // valid fixtures must exceed this (self-check)

const SINGLE_COLUMN_X = 60;
const BODY_SIZE = 12;
const TITLE_SIZE = 18;
const BODY_LEADING = 16;

// The two-column x-ranges from 11-01-PLAN (approximately 60-280 and 312-532).
// 34 chars of 12pt Helvetica averages ~204pt wide: 60+204=264 and 312+204=516
// both land inside their ranges with margin.
const COLUMN_LEFT_X = 60;
const COLUMN_RIGHT_X = 312;
const COLUMN_WRAP_CHARS = 34;

const VALID_FIXTURE_NAMES = [
  "synthetic-single-column.pdf",
  "synthetic-two-column.pdf",
  "synthetic-scanned.pdf",
  "synthetic-outline.pdf",
] as const;
const CORRUPT_FIXTURE_NAME = "synthetic-corrupt.pdf";
const ALL_FIXTURE_NAMES = [...VALID_FIXTURE_NAMES, CORRUPT_FIXTURE_NAME] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type FontKey = "F1" | "F2";

/** One drawn text line: a BT…ET block at an absolute position.
 * Exported (11-02): the adapter unit suite reuses the serializer to build
 * tiny probe PDFs (x-gap / isReaderable cases) from the same code path that
 * produced the committed corpus — no forked PDF writer. */
export interface TextLine {
  x: number;
  y: number;
  font: FontKey;
  size: number;
  text: string;
}

/** One bookmark: an /Outlines item with an explicit array destination. */
interface OutlineEntry {
  title: string;
  /** Zero-based index into the fixture's page list. */
  pageIndex: number;
}

/** A complete fixture: page content streams + optional outline tree.
 * Exported (11-02) alongside serializePdf — see TextLine note. */
export interface FixtureSpec {
  /** One content-stream string per page (empty string = zero text items). */
  pages: string[];
  outlines?: OutlineEntry[];
}

// ── Content-stream construction ─────────────────────────────────────────────

/** Escape the three characters that cannot appear raw in a PDF string. */
function escapePdfText(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** One text line → one BT/Tf/Td/Tj/ET operator block. */
function textLineOperator(line: TextLine): string {
  return `BT /${line.font} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`;
}

/** Lines → content stream (no trailing newline; /Length counts exact bytes).
 * Exported (11-02) for the adapter unit suite's tiny probe PDFs. */
export function buildContentStream(lines: TextLine[]): string {
  return lines.map(textLineOperator).join("\n");
}

/** Deterministic greedy word-wrap to a character budget. */
function wrapWords(text: string, widthChars: number): string[] {
  const words = text.split(" ");
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= widthChars) {
      current += " " + word;
    } else {
      wrapped.push(current);
      current = word;
    }
  }
  if (current.length > 0) wrapped.push(current);
  return wrapped;
}

/**
 * Compose 12pt body paragraphs top-down from yStart. Returns the drawn lines
 * plus the y cursor AFTER the last paragraph (including paragraph gap), so
 * callers can continue composing or measure vertical gaps deterministically.
 */
function composeParagraphs(
  paragraphs: string[],
  x: number,
  yStart: number,
  widthChars: number,
  leading: number,
  paragraphGap: number,
): { lines: TextLine[]; yAfter: number } {
  const lines: TextLine[] = [];
  let y = yStart;
  for (const paragraph of paragraphs) {
    for (const wrapped of wrapWords(paragraph, widthChars)) {
      lines.push({ x, y, font: "F1", size: BODY_SIZE, text: wrapped });
      y -= leading;
    }
    y -= paragraphGap;
  }
  return { lines, yAfter: y };
}

// ── PDF serialization ────────────────────────────────────────────────────────

/**
 * Serialize a FixtureSpec into a complete PDF 1.4 byte sequence with a
 * computed xref table. Object numbering (deterministic):
 *   1 = Catalog, 2 = Pages,
 *   page i → object 3+2i, content i → object 4+2i,
 *   /F1 font → 3+2P, /F2 font → 4+2P (P = page count),
 * outline root → 5+2P, outline item j → 6+2P+j (only when outlines exist).
 *
 * Exported (11-02): the adapter unit suite builds tiny probe PDFs (x-gap
 * space insertion, isReaderable-false cases) through THIS serializer so the
 * byte-level PDF construction lives in one place.
 */
export function serializePdf(spec: FixtureSpec): Buffer {
  const pageCount = spec.pages.length;
  const pageObjectNum = (i: number): number => 3 + 2 * i;
  const contentObjectNum = (i: number): number => 4 + 2 * i;
  const fontRegularNum = 3 + 2 * pageCount;
  const fontBoldNum = 4 + 2 * pageCount;
  const outlineRootNum = 5 + 2 * pageCount;
  const outlineItemNum = (j: number): number => outlineRootNum + 1 + j;

  // 1-indexed object bodies (index 0 unused — reserved by the xref free entry).
  const objects: (string | undefined)[] = [];

  objects[1] =
    `<< /Type /Catalog /Pages 2 0 R` +
    (spec.outlines ? ` /Outlines ${outlineRootNum} 0 R /PageMode /UseOutlines` : "") +
    ` >>`;
  objects[2] =
    `<< /Type /Pages /Kids [${spec.pages
      .map((_, i) => `${pageObjectNum(i)} 0 R`)
      .join(" ")}] /Count ${pageCount} >>`;

  spec.pages.forEach((content, i) => {
    objects[pageObjectNum(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> ` +
      `/Contents ${contentObjectNum(i)} 0 R >>`;
    objects[contentObjectNum(i)] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  objects[fontRegularNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[fontBoldNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  if (spec.outlines) {
    const items = spec.outlines;
    objects[outlineRootNum] =
      `<< /Type /Outlines /First ${outlineItemNum(0)} 0 R ` +
      `/Last ${outlineItemNum(items.length - 1)} 0 R /Count ${items.length} >>`;
    items.forEach((item, j) => {
      const prev = j > 0 ? ` /Prev ${outlineItemNum(j - 1)} 0 R` : "";
      const next = j < items.length - 1 ? ` /Next ${outlineItemNum(j + 1)} 0 R` : "";
      // Explicit array destination: [pageRef /XYZ left top zoom] at the page
      // TOP (y = PAGE_HEIGHT, zoom 0 = "retain the reader's zoom").
      objects[outlineItemNum(j)] =
        `<< /Title (${escapePdfText(item.title)}) /Parent ${outlineRootNum} 0 R${prev}${next} ` +
        `/Dest [${pageObjectNum(item.pageIndex)} 0 R /XYZ 0 ${PAGE_HEIGHT} 0] >>`;
    });
  }

  // Serialize body, recording each object's byte offset for the xref table.
  let out = PDF_VERSION + "\n";
  const offsets: number[] = [];
  const objectCount = objects.length; // == highest object number + 1 == /Size
  for (let num = 1; num < objectCount; num++) {
    offsets[num] = Buffer.byteLength(out, "latin1");
    out += `${num} 0 obj\n${objects[num]}\nendobj\n`;
  }

  // xref: each entry is exactly 20 bytes (10-digit offset, space, 5-digit
  // generation, space, n|f, space, newline).
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let num = 1; num < objectCount; num++) {
    out += `${String(offsets[num]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

// ── Fixture specs ────────────────────────────────────────────────────────────

/** Fixture 1 — 3 single-column pages (title + headings + hyphen split + gap). */
function singleColumnSpec(): FixtureSpec {
  // Page 1: one 18pt bold title-size line + 12pt body paragraphs, ending with
  // a hyphen-at-line-end split word ("conclu-" / "sion…") for dehyphenation.
  const page1Body = composeParagraphs(
    [
      "Long-form reading asks for steady attention. A page that keeps its place, its measure, and its rhythm lets the reader stay inside the argument instead of managing the window around it.",
      "This document is a synthetic fixture. Every glyph inside it was placed by a script so that the byte stream, the page count, and the layout stay identical across machines and re-runs.",
    ],
    SINGLE_COLUMN_X,
    706,
    80,
    BODY_LEADING,
    8,
  );
  const hyphenY = page1Body.yAfter;
  const page1 = buildContentStream([
    { x: SINGLE_COLUMN_X, y: 740, font: "F2", size: TITLE_SIZE, text: "A Study of Calm Reading" },
    ...page1Body.lines,
    { x: SINGLE_COLUMN_X, y: hyphenY, font: "F1", size: BODY_SIZE, text: "Good pagination should read like conclu-" },
    { x: SINGLE_COLUMN_X, y: hyphenY - BODY_LEADING, font: "F1", size: BODY_SIZE, text: "sion rather than interruption." },
  ]);

  // Page 2: an 18pt bold heading + paragraphs.
  const page2Body = composeParagraphs(
    [
      "The method is deliberately boring. A generator emits a document with known geometry, a reader parses it back, and the test compares the recovered text against what was placed.",
      "Any difference between placed and recovered text is a defect in the reading pipeline, never in the fixture, because the fixture is derived from constants alone.",
    ],
    SINGLE_COLUMN_X,
    706,
    80,
    BODY_LEADING,
    8,
  );
  const page2 = buildContentStream([
    { x: SINGLE_COLUMN_X, y: 740, font: "F2", size: TITLE_SIZE, text: "Method" },
    ...page2Body.lines,
  ]);

  // Page 3: two paragraph groups separated by a ~200pt vertical gap
  // (figure stand-in — the gap represents an unextractable figure region).
  // composeParagraphs returns yAfter = lastLineY - leading - paragraphGap, so
  // starting group two at (yAfter - 200) puts its first baseline ~224pt below
  // group one's last baseline — comfortably a "figure-sized" visual gap.
  const groupOne = composeParagraphs(
    ["The first group of paragraphs sits above the figure stand-in. Its lines are dense enough to establish a reading rhythm before the visual pause."],
    SINGLE_COLUMN_X,
    740,
    80,
    BODY_LEADING,
    8,
  );
  const groupTwo = composeParagraphs(
    ["The second group resumes below the figure stand-in. Text after a large vertical gap should still flow into the same reading order without a forced break."],
    SINGLE_COLUMN_X,
    Math.floor(groupOne.yAfter) - 200,
    80,
    BODY_LEADING,
    8,
  );
  const page3 = buildContentStream([...groupOne.lines, ...groupTwo.lines]);

  return { pages: [page1, page2, page3] };
}

/** Fixture 2 — 2 two-column pages (refuse-side fixture for the D11-03
 * multi-column detector; each column carries well over 15% of page text). */
function twoColumnSpec(): FixtureSpec {
  const composeColumn = (paragraphs: string[]): TextLine[] =>
    composeParagraphs(paragraphs, 0, 740, COLUMN_WRAP_CHARS, 14, 6).lines
      .map((line) => ({ ...line, x: COLUMN_LEFT_X }));
  const composeRightColumn = (paragraphs: string[]): TextLine[] =>
    composeParagraphs(paragraphs, 0, 740, COLUMN_WRAP_CHARS, 14, 6).lines
      .map((line) => ({ ...line, x: COLUMN_RIGHT_X }));

  const page1 = buildContentStream([
    ...composeColumn([
      "Columns divide a printed page into parallel streams of prose. A reader follows one stream from the top of the page to the bottom before crossing the gutter to the next column in line.",
      "Magazines and journals use columns to control line length, and therefore pacing, on a wide sheet of paper.",
    ]),
    ...composeRightColumn([
      "Screens inherited the convention without the physical constraint. On a narrow viewport two columns squeeze line length below any comfortable reading measure for the eyes.",
      "A repagination engine must detect the layout instead of assuming a single flow of text.",
    ]),
  ]);

  const page2 = buildContentStream([
    ...composeColumn([
      "The detector compares text mass in the left and right x-ranges of every page. When both ranges carry more than fifteen percent of the page text the document refuses intake.",
      "Detection happens before any block mapping runs.",
    ]),
    ...composeRightColumn([
      "Refusal is honest failure. A silently reordered column would mangle quotations and scramble anchors, so the calm answer is a typed reason and no library entry at all.",
      "The reader keeps a predictable surface.",
    ]),
  ]);

  return { pages: [page1, page2] };
}

/** Fixture 3 — 2 pages with EMPTY content streams (no text operators at all:
 * the scanned-document class — zero extractable text items). */
function scannedSpec(): FixtureSpec {
  return { pages: ["", ""] };
}

/** Fixture 4 — 2 single-column pages + /Outlines tree with two bookmark items
 * using explicit array destinations at page tops (outline-first heading
 * fixture for D11-08). */
function outlineSpec(): FixtureSpec {
  const page1Body = composeParagraphs(
    [
      "An outlined document carries a bookmark tree alongside its pages. Screen readers and sidebar views use the outline for navigation, so the first heading of a section can come from a bookmark.",
      "Both bookmarks in this fixture point at the top of a page through explicit array destinations.",
    ],
    SINGLE_COLUMN_X,
    706,
    80,
    BODY_LEADING,
    8,
  );
  const page1 = buildContentStream([
    { x: SINGLE_COLUMN_X, y: 740, font: "F2", size: TITLE_SIZE, text: "Outlined Document" },
    ...page1Body.lines,
  ]);

  const page2Body = composeParagraphs(
    [
      "The second section sits on its own page so the second bookmark has an unambiguous target. Heading recovery should prefer the outline entry when one points at this page.",
    ],
    SINGLE_COLUMN_X,
    706,
    80,
    BODY_LEADING,
    8,
  );
  const page2 = buildContentStream([
    { x: SINGLE_COLUMN_X, y: 740, font: "F2", size: TITLE_SIZE, text: "Second Section" },
    ...page2Body.lines,
  ]);

  return {
    pages: [page1, page2],
    outlines: [
      { title: "Opening Notes", pageIndex: 0 },
      { title: "Second Section", pageIndex: 1 },
    ],
  };
}

/** Fixture 5 — not a PDF at all: literal ASCII bytes (the pdf-unreadable
 * class). Emitted directly, NOT through serializePdf. */
function corruptBytes(): Buffer {
  return Buffer.from(CORRUPT_MARKER, "latin1");
}

// ── Build / write / self-check ───────────────────────────────────────────────

interface NamedOutput {
  name: string;
  bytes: Buffer;
}

/** Build every fixture in-memory in canonical order (pure: no filesystem). */
function buildAllFixtures(): NamedOutput[] {
  return [
    { name: "synthetic-single-column.pdf", bytes: serializePdf(singleColumnSpec()) },
    { name: "synthetic-two-column.pdf", bytes: serializePdf(twoColumnSpec()) },
    { name: "synthetic-scanned.pdf", bytes: serializePdf(scannedSpec()) },
    { name: "synthetic-outline.pdf", bytes: serializePdf(outlineSpec()) },
    { name: CORRUPT_FIXTURE_NAME, bytes: corruptBytes() },
  ];
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Built-in integrity self-check (the relocated Wave-0 sentinel assertions).
 * Re-reads every output from disk and exits non-zero on any violation:
 *   1. the four valid fixtures begin with the PDF magic prefix,
 *   2. the four valid fixtures exceed SIZE_FLOOR_BYTES,
 *   3. the corrupt fixture contains its ASCII marker text,
 *   4. a second in-process emit hashes byte-identical to what is on disk
 *      (idempotency proof — deterministic regeneration).
 */
function selfCheck(dir: string): string[] {
  const problems: string[] = [];
  const validNames = VALID_FIXTURE_NAMES as readonly string[];

  for (const name of ALL_FIXTURE_NAMES) {
    const onDisk = readFileSync(join(dir, name));
    if (validNames.includes(name)) {
      if (!onDisk.subarray(0, PDF_MAGIC.length).toString("latin1").startsWith(PDF_MAGIC)) {
        problems.push(`${name}: missing %PDF- magic prefix`);
      }
      if (onDisk.byteLength <= SIZE_FLOOR_BYTES) {
        problems.push(`${name}: ${onDisk.byteLength} bytes <= ${SIZE_FLOOR_BYTES} floor`);
      }
    } else if (!onDisk.toString("latin1").includes(CORRUPT_MARKER)) {
      problems.push(`${name}: missing corrupt-marker text "${CORRUPT_MARKER}"`);
    }
  }

  // Idempotency: two fresh in-process builds must hash identically AND match
  // the bytes now on disk.
  const first = buildAllFixtures();
  const second = buildAllFixtures();
  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = second[i];
    if (!a || !b) {
      problems.push(`emit slot ${i} missing an output (first=${Boolean(a)}, second=${Boolean(b)})`);
      continue;
    }
    if (a.name !== b.name) {
      problems.push(`emit order changed: ${a.name} vs ${b.name}`);
      continue;
    }
    if (sha256(a.bytes) !== sha256(b.bytes)) {
      problems.push(`${a.name}: non-deterministic emit (first != second hash)`);
    }
    if (sha256(readFileSync(join(dir, a.name))) !== sha256(a.bytes)) {
      problems.push(`${a.name}: disk bytes differ from in-process emit`);
    }
  }
  return problems;
}

function main(): void {
  const dir = dirname(fileURLToPath(import.meta.url));
  mkdirSync(dir, { recursive: true });

  for (const output of buildAllFixtures()) {
    writeFileSync(join(dir, output.name), output.bytes);
    console.log(`wrote ${output.name} (${output.bytes.byteLength} bytes)`);
  }

  const problems = selfCheck(dir);
  if (problems.length > 0) {
    console.error("SELF-CHECK FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("self-check PASS: 4 valid fixtures (%PDF- prefix + >500B), corrupt marker present, re-emit byte-identical");
}

// Run as a script only: `node tests/fixtures/pdf/generate-synthetic-pdfs.ts`.
// Importing this module (11-02's unit suite) reuses the serializer WITHOUT
// re-writing fixtures or logging — the direct-run check compares the module
// URL against the invoked script path (standard ESM main-module idiom).
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
