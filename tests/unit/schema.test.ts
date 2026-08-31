import { describe, expect, it } from "vitest";
import { ArticleSchema, BlockSchema, LinkMark, Mark } from "../../src/content/schema";

/**
 * Boundary validation for the frozen Zod document model (D-04, D-06).
 * Guards Pitfalls 4 (DOM clobbering), 5 (stored XSS via scheme), 7 (recursive
 * Zod), 10 (heading order), and the locked inline-mark + block-kind sets.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

// Test payload builder — returns `unknown` so callers exercise Zod at runtime.
// Overrides are loosely typed (Record) because the point is to feed parse()
// shapes that may or may not validate; Zod is the authority, not TS here.
function validArticle(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "sha256:abc123def456",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Hello world." }] }],
    footnotes: [],
    ...overrides,
  };
}

// ── Round-trip ───────────────────────────────────────────────────────────────

describe("ArticleSchema round-trip", () => {
  it("parses a minimal valid article and preserves identity + first block kind", () => {
    const parsed = ArticleSchema.parse(validArticle());
    expect(parsed.id).toBe("test-article");
    expect(parsed.revision).toBe(1);
    expect(parsed.blocks[0]?.kind).toBe("paragraph");
    expect(parsed.footnotes).toEqual([]);
  });
});

// ── Identity / revision rejections (D-06) ────────────────────────────────────

describe("ArticleSchema.parse rejects bad identity / revision", () => {
  it.each([
    ["id is a URL (D-06 — id must be a slug, never the source URL)", { id: "https://example.com" }],
    ["id has uppercase letters", { id: "Test-Article" }],
    ["id has spaces", { id: "test article" }],
    ["revision is 0", { revision: 0 }],
    ["revision is 1.5 (non-integer)", { revision: 1.5 }],
    ["revision is negative", { revision: -1 }],
    ["blocks array is empty", { blocks: [] }],
  ])("throws when %s", (_label, override) => {
    expect(() => ArticleSchema.parse(validArticle(override))).toThrow();
  });
});

// ── Heading level guard (Pitfall 10) ─────────────────────────────────────────

describe("HeadingBlock level guard", () => {
  it("accepts levels 1–6", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const block = { kind: "heading", level, content: [{ text: "Heading" }] };
      expect(BlockSchema.parse(block).kind).toBe("heading");
    }
  });

  it.each([[7], [0], [8]])("rejects heading level %i (Pitfall 10)", (level) => {
    const block = { kind: "heading", level, content: [{ text: "Heading" }] };
    expect(() => BlockSchema.parse(block)).toThrow();
  });
});

// ── Footnote id regex (Pitfall 4 — DOM clobbering) ───────────────────────────

describe("FootnoteReferenceBlock footnoteId regex (Pitfall 4)", () => {
  it.each([
    ["main", "main"],
    ["fn-abc (non-numeric)", "fn-abc"],
    ["missing prefix", "1"],
    ["uppercase", "FN-1"],
  ])("rejects footnoteId %s", (_label, footnoteId) => {
    const block = { kind: "footnote-reference", footnoteId, marker: "[1]" };
    expect(() => BlockSchema.parse(block)).toThrow();
  });

  it("accepts footnoteId matching /^fn-\\d+$/", () => {
    const block = { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" };
    expect(BlockSchema.parse(block).kind).toBe("footnote-reference");
  });
});

// ── URL scheme rejection (Pitfall 5 — stored XSS) ────────────────────────────

describe("LinkMark href scheme allow-list (Pitfall 5)", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["vbscript:", "vbscript:msgbox(1)"],
  ])("rejects %s scheme href", (_label, href) => {
    expect(() => LinkMark.parse({ type: "link", href })).toThrow();
  });

  it("accepts an https: href", () => {
    expect(LinkMark.parse({ type: "link", href: "https://example.com" }).type).toBe("link");
  });

  it("accepts a mailto: href", () => {
    expect(LinkMark.parse({ type: "link", href: "mailto:nobody@example.com" }).type).toBe("link");
  });
});

// ── Each of the 9 block kinds round-trips ────────────────────────────────────

describe("BlockSchema discriminates exactly 9 kinds", () => {
  const cases: Array<{ kind: string; block: unknown }> = [
    { kind: "heading", block: { kind: "heading", level: 2, content: [{ text: "Title" }] } },
    { kind: "paragraph", block: { kind: "paragraph", content: [{ text: "Body." }] } },
    {
      kind: "blockquote",
      block: { kind: "blockquote", children: [{ kind: "paragraph", content: [{ text: "Quoted" }] }] },
    },
    {
      kind: "bulleted-list",
      block: { kind: "bulleted-list", items: [{ content: [{ kind: "paragraph", content: [{ text: "Item" }] }] }] },
    },
    {
      kind: "numbered-list",
      block: { kind: "numbered-list", items: [{ content: [{ kind: "paragraph", content: [{ text: "One" }] }] }] },
    },
    { kind: "figure", block: { kind: "figure", alt: "A photo", src: "https://example.com/photo.jpg" } },
    { kind: "code-block", block: { kind: "code-block", source: "const x = 1;" } },
    { kind: "footnote-reference", block: { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" } },
    { kind: "unsupported", block: { kind: "unsupported", originalKind: "video", plainDescription: "An embedded video." } },
  ];

  it.each(cases)("parses a valid $kind block and preserves .kind", ({ kind, block }) => {
    expect(BlockSchema.parse(block).kind).toBe(kind);
  });

  it("parses all 9 representative kinds without throwing", () => {
    for (const c of cases) {
      expect(() => BlockSchema.parse(c.block)).not.toThrow();
    }
    expect(cases).toHaveLength(9);
  });
});

// ── FigureBlock asset evolution (Phase 20 — D20-02/D20-06/D20-12/D20-13) ─────

describe("FigureBlock asset evolution (Phase 20 — IMG-01/IMG-02 substrate)", () => {
  // The three figure states of 20-RESEARCH Pattern 2, asserted at parse time:
  // legacy remote-src rows hydrate unchanged (D-05 substrate byte-identity),
  // refused figures omit src entirely (D20-06), accepted figures carry the
  // local asset:img-<12hex> reference (D20-12) + optional originalSrc +
  // orientation-corrected intrinsic dims (D20-13). A data: URI src has NO arm
  // in the union (D20-02 — one no-exceptions media boundary, Pitfall 5).
  it("parses a LEGACY row with a remote httpUrl src unchanged", () => {
    const parsed = BlockSchema.parse({
      kind: "figure",
      alt: "A photo",
      src: "https://example.com/photo.jpg",
    });
    if (parsed.kind !== "figure") throw new Error("expected figure");
    expect(parsed.src).toBe("https://example.com/photo.jpg");
    expect(parsed.alt).toBe("A photo");
    expect(parsed.caption).toEqual([]);
  });

  it("parses a REFUSED figure with src omitted (D20-06 — alt+caption survive, image surface is the placeholder)", () => {
    const parsed = BlockSchema.parse({ kind: "figure", alt: "A broken image" });
    if (parsed.kind !== "figure") throw new Error("expected figure");
    expect(parsed.src).toBeUndefined();
    expect(parsed.alt).toBe("A broken image");
  });

  it("parses an accepted figure with an asset:img-<12hex> ref src (D20-12)", () => {
    const parsed = BlockSchema.parse({
      kind: "figure",
      alt: "A local image",
      src: "asset:img-0123456789ab",
    });
    if (parsed.kind !== "figure") throw new Error("expected figure");
    expect(parsed.src).toBe("asset:img-0123456789ab");
  });

  it("parses originalSrc + width/height alongside the asset ref (D20-12 provenance + D20-13 dims)", () => {
    const parsed = BlockSchema.parse({
      kind: "figure",
      alt: "An image",
      src: "asset:img-0123456789ab",
      originalSrc: "https://example.com/photo.jpg",
      width: 640,
      height: 480,
    });
    if (parsed.kind !== "figure") throw new Error("expected figure");
    expect(parsed.originalSrc).toBe("https://example.com/photo.jpg");
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(480);
  });

  it.each([
    ["data: URI (D20-02 — the union simply has no arm for it)", "data:image/png;base64,iVBORw0KGgo="],
    ["javascript: URI (Pitfall 5 survives at parse time)", "javascript:alert(1)"],
  ])("rejects a banned-scheme src: %s", (_label, src) => {
    expect(() =>
      BlockSchema.parse({ kind: "figure", alt: "x", src }),
    ).toThrow();
  });

  it.each([
    ["wrong prefix", "asset:pic-0123456789ab"],
    ["11 hex chars (too short)", "asset:img-0123456789a"],
    ["13 hex chars (too long)", "asset:img-0123456789abc"],
    ["uppercase hex (regex is [a-z0-9])", "asset:img-0123456789AB"],
  ])("rejects a malformed asset ref: %s", (_label, src) => {
    expect(() =>
      BlockSchema.parse({ kind: "figure", alt: "x", src }),
    ).toThrow();
  });

  it.each([
    ["width 0", { width: 0, height: 10 }],
    ["height 0", { width: 10, height: 0 }],
    ["width -3", { width: -3, height: 10 }],
    ["non-integer width", { width: 1.5, height: 10 }],
  ])("rejects %s (D20-13 — intrinsic dims are positive ints)", (_label, dims) => {
    expect(() =>
      BlockSchema.parse({
        kind: "figure",
        alt: "x",
        src: "asset:img-0123456789ab",
        ...dims,
      }),
    ).toThrow();
  });

  it("rejects a non-http originalSrc (originalSrc is httpUrl-refined — provenance only)", () => {
    expect(() =>
      BlockSchema.parse({
        kind: "figure",
        alt: "x",
        src: "asset:img-0123456789ab",
        originalSrc: "data:text/html,<script>",
      }),
    ).toThrow();
  });
});

// ── Inline marks — locked set of 4 (D-04) ────────────────────────────────────

describe("Mark union is locked to exactly 4 marks (D-04)", () => {
  it("parses a run carrying [strong, em, code, link]", () => {
    const run = {
      text: "rich text",
      marks: [
        { type: "strong" },
        { type: "em" },
        { type: "code" },
        { type: "link", href: "https://example.com" },
      ],
    };
    // InlineRun is the schema; round-trip via ArticleSchema to exercise full path.
    const parsed = ArticleSchema.parse(
      validArticle({ blocks: [{ kind: "paragraph", content: [run] }] }),
    );
    const para = parsed.blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(para.content[0]?.marks).toHaveLength(4);
  });

  it.each([
    ["strikethrough", { type: "strikethrough" }],
    ["subscript", { type: "subscript" }],
    ["superscript", { type: "superscript" }],
  ])("rejects the %s mark (not in the locked D-04 set)", (_label, mark) => {
    expect(() => Mark.parse(mark)).toThrow();
  });
});
