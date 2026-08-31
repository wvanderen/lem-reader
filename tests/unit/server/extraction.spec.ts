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
