// tests/unit/server/mxss.spec.ts
// Plan 07-04 Task 2 — the mXSS regression suite (SC#4 phase-exit gate).
// Replaces the Wave-0 stub (07-01) with a real DOMPurify Attack Classes payload
// corpus.
//
// Gate contract (RESEARCH.md §Gate 2 L964-970): feed DOMPurify Attack Classes
// & Bypass History payloads through the full pipeline (Readability → DOMPurify
// → htmlToBlocks) and assert the resulting Block tree contains ZERO `<script>`,
// ZERO inline `on*` handlers, ZERO `javascript:` URIs, and ZERO SVG/MathML.
// The doc model IS the security boundary (ING-07): by the time content reaches
// React it is plain Block JSON, never HTML. A repo-wide `dangerouslySetInnerHTML`
// grep gate (07-07) is the belt-and-suspenders structural defense; the eslint
// `react/no-danger: "error"` rule already covers /server + /functions per
// 07-PATTERNS.md L713.
//
// Payload sources: DOMPurify Attack Classes & Bypass History wiki (CITED in
// 07-RESEARCH.md §Gate 2 L965). Each payload exercises a known sanitizer-bypass
// class; the assertion is that NONE survive into the Block tree.
import { describe, expect, it } from "vitest";
import { extractAndNormalize, sanitizeExtractedHtml } from "../../../server/htmlToBlocks";

// ── DOMPurify Attack Classes payload corpus (≥8 entries) ────────────────────
// Each entry: { name, html, forbiddenSubstring }. The forbiddenSubstring is
// the token that MUST NOT appear in the serialized output. The corpus covers:
// script tag, inline onerror, javascript: URI, SVG+script, MathML+script,
// mutation-XSS via noscript/title, sanitize-then-re-introduce, DOM clobbering,
// onload, onclick, iframe.
interface MxssPayload {
  name: string;
  /** The raw attack payload HTML fragment. */
  html: string;
  /** A substring that MUST NOT survive into the output. */
  forbiddenSubstring: string;
}

const MXSS_PAYLOADS: readonly MxssPayload[] = [
  {
    name: "script tag",
    html: "<script>alert(1)</script>",
    forbiddenSubstring: "<script",
  },
  {
    name: "inline onerror handler",
    html: '<img src="x" onerror="alert(1)">',
    forbiddenSubstring: "onerror",
  },
  {
    name: "javascript: URI in href",
    html: '<a href="javascript:alert(1)">click me</a>',
    forbiddenSubstring: "javascript:",
  },
  {
    name: "SVG with embedded script",
    html: "<svg><script>alert(1)</script></svg>",
    forbiddenSubstring: "alert",
  },
  {
    name: "MathML with embedded script",
    html: "<math><mtext><script>alert(1)</script></mtext></math>",
    forbiddenSubstring: "alert",
  },
  {
    name: "mutation-XSS via noscript/title breakout",
    html: '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>',
    forbiddenSubstring: "onerror",
  },
  {
    name: "sanitize-then-re-introduce via namespace confusion (math+mtext+style)",
    html: "<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>-->",
    forbiddenSubstring: "onerror",
  },
  {
    name: "DOM clobbering via img id=location",
    html: '<img id="location" src="https://example.com/i.png">',
    forbiddenSubstring: 'id="location"',
  },
  {
    name: "onload handler on svg",
    html: '<svg onload="alert(1)"></svg>',
    forbiddenSubstring: "onload",
  },
  {
    name: "onclick handler on button",
    html: '<button onclick="alert(1)">x</button>',
    forbiddenSubstring: "onclick",
  },
  {
    name: "iframe src javascript:",
    html: '<iframe src="javascript:alert(1)"></iframe>',
    forbiddenSubstring: "javascript:",
  },
] as const;

/** Wrap a payload fragment in a minimal readerable article so Readability
 * engages and the payload reaches the DOMPurify sanitize stage (rather than
 * being dropped by a null extraction). The payload sits between two text-heavy
 * paragraphs so the article clears Readability's charThreshold. */
function wrapInArticle(payload: string): string {
  const intro =
    "This is the introductory paragraph of the test article. ".repeat(8) +
    "It has enough body text for Readability to consider it readerable.";
  const outro =
    "This is the closing paragraph. ".repeat(8) +
    "Together with the intro it ensures the article clears the confidence threshold.";
  return `<!doctype html>
<html lang="en">
<head><title>mXSS Corpus</title></head>
<body>
<article>
  <h1>mXSS Corpus Article</h1>
  <p>${intro}</p>
  ${payload}
  <p>${outro}</p>
</article>
</body>
</html>`;
}

describe("sanitizeExtractedHtml — DOMPurify strips every Attack Classes payload", () => {
  // Direct DOMPurify boundary test: proves the sanitizer itself neutralizes
  // each payload, independent of Readability. This is the SC#4 core assertion.
  it.each(MXSS_PAYLOADS)("strips $name", ({ html, forbiddenSubstring }) => {
    const out = sanitizeExtractedHtml(html);
    expect(out).not.toContain(forbiddenSubstring);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<script");
  });
});

describe("extractAndNormalize — full pipeline strips every Attack Classes payload", () => {
  // Integration test: the payload travels Readability → DOMPurify → DOM walk →
  // Block tree. The serialized Block tree MUST NOT carry any forbidden token.
  it.each(MXSS_PAYLOADS)(
    "Block tree is clean for $name",
    async ({ html, forbiddenSubstring }) => {
      const { blocks } = await extractAndNormalize(wrapInArticle(html), undefined);
      const serialized = JSON.stringify(blocks);
      expect(serialized).not.toContain(forbiddenSubstring);
      expect(serialized).not.toContain("onerror");
      expect(serialized).not.toContain("onload");
      expect(serialized).not.toContain("onclick");
      expect(serialized).not.toContain("javascript:");
      expect(serialized).not.toContain("<script");
    },
  );
});

describe("mXSS corpus — aggregate guards (SC#4 phase-exit gate)", () => {
  it("no payload survives into any Block tree (full-pass over the corpus)", async () => {
    for (const p of MXSS_PAYLOADS) {
      const { blocks } = await extractAndNormalize(wrapInArticle(p.html), undefined);
      const serialized = JSON.stringify(blocks);
      // The aggregate regex catches ANY inline event handler + javascript: URI.
      expect(serialized).not.toMatch(/onerror|onload|onclick|onmouseover|javascript:/i);
      expect(serialized).not.toContain("<script");
      // SVG/MathML must be stripped by USE_PROFILES:{html:true}.
      expect(serialized.toLowerCase()).not.toContain("svg");
      expect(serialized.toLowerCase()).not.toContain("<math");
    }
  });

  it("USE_PROFILES html strips SVG and MathML root elements outright", () => {
    expect(sanitizeExtractedHtml("<svg><circle/></svg>")).not.toMatch(/svg/i);
    expect(sanitizeExtractedHtml("<math><mi>x</mi></math>")).not.toMatch(/<math/i);
  });

  it("ALLOW_DATA_ATTR:false strips data-* attributes (DOM-clobbering surface)", () => {
    const out = sanitizeExtractedHtml('<div data-foo="bar" data-x="y">content</div>');
    expect(out).not.toContain("data-foo");
    expect(out).not.toContain("data-x");
  });
});
