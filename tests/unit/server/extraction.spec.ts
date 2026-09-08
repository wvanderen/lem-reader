// tests/unit/server/extraction.spec.ts
// Plan 07-04 — Readability extract → DOMPurify sanitize → DOM walk → 9-kind
// Block tree. Replaces the Wave-0 stub (07-01) with the real extraction
// correctness suite.
//
// Contract (RESEARCH.md §Pattern 2 + §Validation Architecture L986-998): the
// URL path and the paste-HTML path produce the SAME Block shape
// (input-source-agnostic pipeline, D7-03); Readability output maps onto the 9
// block kinds via the exhaustive switch (Pattern F); anything unmappable →
// UnsupportedBlock with a DOC-06 plainDescription.
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  extractAndNormalize,
  htmlToBlocks,
  sanitizeExtractedHtml,
  type HtmlToBlocksResult,
} from "../../../server/htmlToBlocks";

// The 9 schema-allowed block kinds (src/content/schema.ts BlockSchema). Every
// extracted block MUST have a kind in this tuple — the exhaustive switch has
// no default; anything unmappable falls through to UnsupportedBlock.
const SCHEMA_KINDS = [
  "heading",
  "paragraph",
  "bulleted-list",
  "numbered-list",
  "blockquote",
  "figure",
  "code-block",
  "footnote-reference",
  "unsupported",
] as const;

// A representative article HTML fixture — enough body text (>500 chars) and
// article-like structure (<article> + h1 + multiple <p>) for Readability to
// engage and isProbablyReaderable to return true. Contains a link + marks so
// the D-04 inline-run extraction path is exercised.
const ARTICLE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta property="og:title" content="Test Article">
  <title>Test Article</title>
</head>
<body>
<article>
  <h1>Test Article</h1>
  <p>This is the first paragraph of the test article. It has enough text for Readability to consider it readerable. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud.</p>
  <h2>A Subheading</h2>
  <p>Another paragraph here with <a href="https://example.com">a link</a> and <strong>bold</strong> and <em>italic</em> text. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit.</p>
  <p>A third paragraph to ensure blockCount is comfortably above the confident threshold. Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error.</p>
</article>
</body>
</html>`;

describe("sanitizeExtractedHtml — DOMPurify sanitize stage (ING-07)", () => {
  it("strips <script> tags, keeps <p>", () => {
    const out = sanitizeExtractedHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  it("strips inline onerror handlers", () => {
    const out = sanitizeExtractedHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("strips javascript: URIs from href", () => {
    const out = sanitizeExtractedHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("strips <svg><script> (USE_PROFILES html — no svg/math)", () => {
    const out = sanitizeExtractedHtml("<svg><script>alert(1)</script></svg>");
    expect(out.toLowerCase()).not.toContain("svg");
    expect(out).not.toContain("alert");
  });
});

describe("extractAndNormalize — Readability → DOMPurify → DOM walk", () => {
  it("returns a result with blocks, footnotes, lang, provenancePartial, isReaderable", async () => {
    const result = await extractAndNormalize(ARTICLE_HTML, "https://example.com/article");
    expect(result).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(Array.isArray(result.footnotes)).toBe(true);
    expect(typeof result.lang).toBe("string");
    expect(typeof result.isReaderable).toBe("boolean");
  });

  it("extracts blocks whose kinds are all in the 9-kind schema set", async () => {
    const { blocks } = await extractAndNormalize(ARTICLE_HTML, "https://example.com/article");
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(SCHEMA_KINDS).toContain(b.kind);
    }
  });

  it("extracts at least one heading and at least one paragraph", async () => {
    const { blocks } = await extractAndNormalize(ARTICLE_HTML, "https://example.com/article");
    const kinds = new Set(blocks.map((b) => b.kind));
    expect(kinds).toContain("heading");
    expect(kinds).toContain("paragraph");
  });

  it("strips <script> — no block carries script/alert content", async () => {
    const html = ARTICLE_HTML.replace("</article>", "<script>alert('pwned')</script></article>");
    const { blocks } = await extractAndNormalize(html, "https://example.com/article");
    const serialized = JSON.stringify(blocks);
    expect(serialized).not.toContain("alert");
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("pwned");
  });

  it("strips inline onerror — no block carries the handler", async () => {
    const html = ARTICLE_HTML.replace(
      "</article>",
      '<img src="https://example.com/img.png" onerror="alert(1)"></article>',
    );
    const { blocks } = await extractAndNormalize(html, "https://example.com/article");
    const serialized = JSON.stringify(blocks);
    expect(serialized).not.toContain("onerror");
  });

  it("URL-input and paste-input produce identical Block trees (D7-03 input-source-agnostic)", async () => {
    const urlResult = await extractAndNormalize(ARTICLE_HTML, "https://example.com/article");
    const pasteResult = await extractAndNormalize(ARTICLE_HTML, undefined);
    // D7-03: the pipeline is input-source-agnostic. The ONLY difference between
    // the url and paste paths is the finalUrl passed to jsdom (for relative-link
    // resolution). With absolute-only links, the Block trees are identical.
    expect(pasteResult.blocks).toEqual(urlResult.blocks);
  });

  it("detects lang from <html lang=...>, defaults to 'en'", async () => {
    const { lang } = await extractAndNormalize(ARTICLE_HTML, undefined);
    expect(lang).toBe("en");
  });

  it("maps a <table> to UnsupportedBlock with a non-empty plainDescription (DOC-06)", async () => {
    const html = ARTICLE_HTML.replace(
      "</article>",
      "<table><tr><th>Col</th></tr><tr><td>cell</td></tr></table></article>",
    );
    const { blocks } = await extractAndNormalize(html, "https://example.com/article");
    const tableUnsupported = blocks.find(
      (b): b is HtmlToBlocksResult["blocks"][number] & { originalKind: string } =>
        b.kind === "unsupported" && (b as { originalKind: string }).originalKind === "table",
    );
    expect(tableUnsupported).toBeDefined();
    expect(
      (tableUnsupported as { plainDescription: string } | undefined)?.plainDescription.length,
    ).toBeGreaterThan(0);
  });

  it("returns empty blocks + isReaderable:false-surface when Readability cannot extract", async () => {
    // A nearly-empty document Readability will refuse (charThreshold).
    const sparse = "<!doctype html><html><body><p>too short</p></body></html>";
    const result = await extractAndNormalize(sparse, undefined);
    expect(result).toBeDefined();
    // Either Readability returned null (empty blocks) or extraction produced a
    // thin result — both are acceptable; the orchestrator (07-05) + confidence
    // model (07-03) decide refusal. We only assert the pipeline doesn't throw.
    expect(Array.isArray(result.blocks)).toBe(true);
  });
});

// ── figureSrcResolver hook (Phase 20 Plan 20-02 Task 2) ─────────────────────
// The url/paste default path passes NO resolver and stays byte-stable: a
// non-http img src keeps producing the existing unsupported fallback. A
// resolver that CLAIMS a non-http src (the EPUB container-marker path,
// wired by 20-06) promotes it to a FigureBlock carrying the raw src string
// for later container resolution.

describe("htmlToBlocks — figureSrcResolver hook (20-02 Task 2)", () => {
  const RELATIVE_IMG_HTML =
    '<!doctype html><html><body><main><img src="images/pic.png" alt="A local picture"></main></body></html>';

  it("default-absent path is byte-stable: a relative img src still yields the unsupported fallback", () => {
    const dom = new JSDOM(RELATIVE_IMG_HTML);
    const { blocks } = htmlToBlocks(dom.window.document, undefined);
    const unsupported = blocks.find(
      (b): b is HtmlToBlocksResult["blocks"][number] & { originalKind: string } =>
        b.kind === "unsupported" &&
        (b as { originalKind: string }).originalKind === "figure",
    );
    expect(unsupported).toBeDefined();
    expect(blocks.find((b) => b.kind === "figure")).toBeUndefined();
  });

  it("a resolver-claimed non-http src becomes a FigureBlock carrying the raw src (EPUB marker path)", () => {
    const dom = new JSDOM(RELATIVE_IMG_HTML);
    const resolver = vi.fn((src: string) => src.startsWith("images/"));
    const { blocks } = htmlToBlocks(dom.window.document, undefined, resolver);

    expect(resolver).toHaveBeenCalledWith("images/pic.png");
    const fig = blocks.find((b) => b.kind === "figure");
    expect(fig).toBeDefined();
    if (fig && fig.kind === "figure") {
      expect(fig.src).toBe("images/pic.png");
      expect(fig.alt).toBe("A local picture");
      expect(fig.caption).toEqual([]);
    }
    expect(blocks.find((b) => b.kind === "unsupported")).toBeUndefined();
  });

  it("the resolver is never consulted for http(s) srcs", () => {
    const dom = new JSDOM(
      '<!doctype html><html><body><main><img src="https://example.com/pic.png" alt="Remote"></main></body></html>',
    );
    const resolver = vi.fn(() => true);
    const { blocks } = htmlToBlocks(dom.window.document, undefined, resolver);

    expect(resolver).not.toHaveBeenCalled();
    const fig = blocks.find((b) => b.kind === "figure");
    expect(fig).toBeDefined();
    if (fig && fig.kind === "figure") {
      expect(fig.src).toBe("https://example.com/pic.png");
    }
  });
});

// ── Quick task 260908-ef5 — inline-image hoisting + srcset selection ─────────
// Honesty: no silent garbage. An img inside a paragraph is hoisted to its own
// FigureBlock AFTER the paragraph (paragraph-first ordering); an img with a
// srcset imports the best candidate instead of the tiny fallback src. All
// cells follow the direct htmlToBlocks document-fixture pattern above.

describe("htmlToBlocks — inline-image hoisting (260908-ef5)", () => {
  const wrap = (inner: string) =>
    `<!doctype html><html><body><main>${inner}</main></body></html>`;

  it("a paragraph with text + one http img yields the paragraph FIRST, then the figure — runs byte-identical to the img-free equivalent", () => {
    const html = wrap(
      "<p>Text before the image stays put <img src=\"https://cdn.example.com/one.png\" alt=\"First inline\"> and text after it too.</p>",
    );
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    const imgFree = htmlToBlocks(
      new JSDOM(html.replace(/<img[^>]*>/, "")).window.document,
      undefined,
    ).blocks;

    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "figure"]);
    // The paragraph's inline runs are byte-identical to the img-free walk —
    // the img contributes nothing to run extraction (text preserved).
    expect(blocks[0]).toEqual(imgFree[0]);
    const fig = blocks[1];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/one.png");
    expect(fig.alt).toBe("First inline");
    expect(fig.caption).toEqual([]); // figcaption cannot nest inside p
  });

  it("a paragraph with TWO http imgs yields the paragraph, then both figures in document order", () => {
    const html = wrap(
      "<p>Before <img src=\"https://cdn.example.com/a.png\" alt=\"A\"> middle <img src=\"https://cdn.example.com/b.png\" alt=\"B\"> after.</p>",
    );
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "figure", "figure"]);
    const [figA, figB] = blocks.slice(1);
    if (figA?.kind !== "figure" || figB?.kind !== "figure") {
      throw new Error("expected figures");
    }
    expect(figA.src).toBe("https://cdn.example.com/a.png");
    expect(figB.src).toBe("https://cdn.example.com/b.png");
  });

  it("an img-only paragraph yields JUST the figure (empty paragraph omitted)", () => {
    const html = wrap("<p><img src=\"https://cdn.example.com/only.png\" alt=\"Only\"></p>");
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    expect(blocks.map((b) => b.kind)).toEqual(["figure"]);
    const fig = blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/only.png");
    expect(fig.alt).toBe("Only");
    expect(fig.caption).toEqual([]);
  });

  it("paragraphs inside blockquote children and list items hoist via the same recursion", () => {
    const html = wrap(
      "<blockquote><p>Quoted <img src=\"https://cdn.example.com/quote.png\" alt=\"Quoted\"></p></blockquote>" +
        "<ul><li><p>Listed <img src=\"https://cdn.example.com/list.png\" alt=\"Listed\"></p></li></ul>",
    );
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    const quote = blocks[0];
    const list = blocks[1];
    if (quote?.kind !== "blockquote" || list?.kind !== "bulleted-list") {
      throw new Error("expected blockquote + bulleted-list");
    }
    expect(quote.children.map((c) => c.kind)).toEqual(["paragraph", "figure"]);
    expect(list.items[0]?.content.map((c) => c.kind)).toEqual(["paragraph", "figure"]);
    const quoteFig = quote.children[1];
    if (quoteFig?.kind !== "figure") throw new Error("expected figure");
    expect(quoteFig.src).toBe("https://cdn.example.com/quote.png");
  });

  it("a non-resolvable relative inline img yields the paragraph PLUS the honest unsupported disclosure (never a silent drop)", () => {
    // No document URL → the relative src cannot resolve → same honest
    // UnsupportedBlock a bare top-level relative img produces.
    const html = wrap("<p>Keep me <img src=\"images/pic.png\" alt=\"Local\"></p>");
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "unsupported"]);
    const unsupported = blocks[1];
    if (unsupported?.kind !== "unsupported") throw new Error("expected unsupported");
    expect(unsupported.originalKind).toBe("figure");
    expect(unsupported.plainDescription.length).toBeGreaterThan(0);
  });

  it("the heading arm is NOT hoisted — heading-with-image stays byte-stable (scope decision)", () => {
    const html = wrap("<h2>Heading <img src=\"https://cdn.example.com/h.png\" alt=\"H\"></h2>");
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, undefined);
    expect(blocks.map((b) => b.kind)).toEqual(["heading"]);
    const heading = blocks[0];
    if (heading?.kind !== "heading") throw new Error("expected heading");
    // Byte-stable with the pre-260908-ef5 walk: extractInline has no img arm,
    // so the run keeps its trailing space and NO figure block is emitted.
    expect(heading.content.map((r) => r.text).join("")).toBe("Heading ");
  });
});

describe("htmlToBlocks — srcset best-candidate selection (260908-ef5)", () => {
  const wrap = (inner: string, url?: string) =>
    [`<!doctype html><html><body><main>${inner}</main></body></html>`, url] as const;

  it("width descriptors: picks the largest candidate up to 1600 (1080w over 480w despite the 1x1 placeholder src)", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/pic-480.png 480w, https://cdn.example.com/pic-1080.png 1080w\" alt=\"Responsive\">",
    );
    const { blocks } = htmlToBlocks(new JSDOM(html).window.document, url);
    const fig = blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/pic-1080.png");
    expect(fig.alt).toBe("Responsive");
  });

  it("width descriptors: a within-cap candidate beats every over-cap candidate; all-over-1600 picks the largest available", () => {
    const [withinBeatsOver, url1] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/pic-2048.png 2048w, https://cdn.example.com/pic-1200.png 1200w\" alt=\"A\">",
    );
    const figA = htmlToBlocks(new JSDOM(withinBeatsOver).window.document, url1).blocks[0];
    if (figA?.kind !== "figure") throw new Error("expected figure");
    expect(figA.src).toBe("https://cdn.example.com/pic-1200.png");

    const [allOver, url2] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/pic-1920.png 1920w, https://cdn.example.com/pic-3840.png 3840w\" alt=\"B\">",
    );
    const figB = htmlToBlocks(new JSDOM(allOver).window.document, url2).blocks[0];
    if (figB?.kind !== "figure") throw new Error("expected figure");
    expect(figB.src).toBe("https://cdn.example.com/pic-3840.png");
  });

  it("density-only candidates: the smallest at or above 1 wins; all-below-1 picks the largest below", () => {
    const [atOrAbove, url1] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/a.png 1x, https://cdn.example.com/b.png 2x, https://cdn.example.com/c.png 3x\" alt=\"A\">",
    );
    const figA = htmlToBlocks(new JSDOM(atOrAbove).window.document, url1).blocks[0];
    if (figA?.kind !== "figure") throw new Error("expected figure");
    expect(figA.src).toBe("https://cdn.example.com/a.png");

    const [below, url2] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/a.png 0.5x, https://cdn.example.com/b.png 0.75x\" alt=\"B\">",
    );
    const figB = htmlToBlocks(new JSDOM(below).window.document, url2).blocks[0];
    if (figB?.kind !== "figure") throw new Error("expected figure");
    expect(figB.src).toBe("https://cdn.example.com/b.png");
  });

  it("a bare URL with no descriptor is a density-1 candidate", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"https://cdn.example.com/bare.png, https://cdn.example.com/hi-dpi.png 2x\" alt=\"Bare\">",
    );
    const fig = htmlToBlocks(new JSDOM(html).window.document, url).blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/bare.png");
  });

  it("malformed parts are skipped calmly — the valid candidate still wins, the helper never throws", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/fallback.png\" srcset=\", https://cdn.example.com/good.png 2x, , part-with-extra tokens here, https://cdn.example.com/bad-desc.png 480q, 480w\" alt=\"M\">",
    );
    const fig = htmlToBlocks(new JSDOM(html).window.document, url).blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/good.png");
  });

  it("relative candidates resolve against the document URL", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/1x1.png\" srcset=\"images/pic-480.png 480w, images/pic-1080.png 1080w\" alt=\"R\">",
      "https://example.com/article/",
    );
    const fig = htmlToBlocks(new JSDOM(html, { url }).window.document, url).blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://example.com/article/images/pic-1080.png");
  });

  it("a non-http scheme candidate is skipped, keeping plain src (T-EF5-03)", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/keep-src.png\" srcset=\"javascript:alert(1) 900w\" alt=\"S\">",
    );
    const fig = htmlToBlocks(new JSDOM(html).window.document, url).blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/keep-src.png");
  });

  it("an empty/unparseable srcset leaves plain src in force (byte-stable)", () => {
    const [html, url] = wrap(
      "<img src=\"https://cdn.example.com/plain.png\" srcset=\"\" alt=\"P\">",
    );
    const fig = htmlToBlocks(new JSDOM(html).window.document, url).blocks[0];
    if (fig?.kind !== "figure") throw new Error("expected figure");
    expect(fig.src).toBe("https://cdn.example.com/plain.png");
  });
});

describe("sanitizeExtractedHtml preserves the srcset attribute (260908-ef5 ALLOWED_ATTR proof)", () => {
  it("an https srcset survives sanitization (consumed only by our parser — T-EF5-03)", () => {
    const out = sanitizeExtractedHtml(
      "<img src=\"https://cdn.example.com/a.png\" srcset=\"https://cdn.example.com/a-480.png 480w, https://cdn.example.com/a-1080.png 1080w\" alt=\"x\">",
    );
    expect(out).toContain("srcset");
    expect(out).toContain("a-1080.png");
  });
});
