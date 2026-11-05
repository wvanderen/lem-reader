// tests/unit/server/outline-evidence.spec.ts
// Issue #236 — reliable publisher outline evidence captured during
// extraction. The source's own table of contents (same-page nav links whose
// targets are headings) is the one signal that distinguishes AUTHORIAL
// chapters from ordinary headings — captured from the source DOM while it is
// available, with no additional network requests, matched later only when it
// reconciles strictly and in source order (structure.ts's gate).
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { collectOutlineEvidence, extractAndNormalize } from "../../../server/htmlToBlocks";
import { ingest } from "../../../server/ingest";
import { validateWorkStructure } from "../../../src/content/structure";

/** A small all-in-one-page work: a publisher contents nav linking to the
 * three chapter headings, plus front matter and an h3 subsection the index
 * does NOT list (the reference source's shape — the index, not the heading
 * hierarchy, says what a chapter is). */
const CHAPTERED_HTML = `<!doctype html>
<html lang="en">
<head><title>The Collected Essays</title></head>
<body>
<article>
  <nav class="contents" aria-label="Contents">
    <ul>
      <li><a href="#ch-roots">Roots of the Argument</a></li>
      <li><a href="#ch-crisis">The Crisis Years</a></li>
      <li><a href="#ch-reckon">A Reckoning</a></li>
    </ul>
  </nav>
  <h1>The Collected Essays</h1>
  <p>Front matter introduces the collection. ${"Front matter prose continues here with enough text for the extractor to keep this block. ".repeat(3)}</p>
  <h2 id="ch-roots">Roots of the Argument</h2>
  <p>${"The first chapter develops its thesis across several paragraphs of steady prose. ".repeat(6)}</p>
  <h3 id="sub-a">A subsection</h3>
  <p>${"The subsection refines one point without becoming a chapter of its own. ".repeat(4)}</p>
  <h2 id="ch-crisis">The Crisis Years</h2>
  <p>${"The second chapter turns to the crisis across paragraphs of steady prose. ".repeat(6)}</p>
  <h2 id="ch-reckon">A Reckoning</h2>
  <p>${"The final chapter weighs the evidence across paragraphs of steady prose. ".repeat(6)}</p>
</article>
</body>
</html>`;

describe("collectOutlineEvidence", () => {
  it("reads ordered chapter titles from nav fragment links to headings", () => {
    const dom = new JSDOM(CHAPTERED_HTML);
    expect(collectOutlineEvidence(dom.window.document)).toEqual([
      "Roots of the Argument",
      "The Crisis Years",
      "A Reckoning",
    ]);
  });

  it("dedupes repeated links to the same heading and orders by target position", () => {
    const html = `<!doctype html><html><body><article>
      <nav><a href="#b">Beta</a><a href="#b">Beta again</a><a href="#a">Alpha</a></nav>
      <h2 id="a">Alpha</h2><p>alpha text.</p><h2 id="b">Beta</h2><p>beta text.</p>
    </article></body></html>`;
    const dom = new JSDOM(html);
    // Document order of the TARGETS (Alpha precedes Beta), not link order.
    expect(collectOutlineEvidence(dom.window.document)).toEqual(["Alpha", "Beta"]);
  });

  it("ignores external links, missing targets, and non-heading targets", () => {
    const html = `<!doctype html><html><body><article>
      <nav>
        <a href="https://example.com/out">External</a>
        <a href="#gone">Missing</a>
        <a href="#para">A paragraph</a>
        <a href="#one">Real One</a>
      </nav>
      <p id="para">Not a heading.</p>
      <h2 id="one">Real One</h2><p>text.</p>
    </article></body></html>`;
    const dom = new JSDOM(html);
    expect(collectOutlineEvidence(dom.window.document)).toEqual([]);
  });

  it("needs at least two entries before evidence counts", () => {
    const html = `<!doctype html><html><body><article>
      <nav><a href="#one">Solo</a></nav>
      <h2 id="one">Solo</h2><p>text.</p>
    </article></body></html>`;
    const dom = new JSDOM(html);
    expect(collectOutlineEvidence(dom.window.document)).toEqual([]);
  });

  it("only trusts nav containers (a stray same-page link list is not evidence)", () => {
    const html = `<!doctype html><html><body><article>
      <ul><li><a href="#one">One</a></li><li><a href="#two">Two</a></li></ul>
      <h2 id="one">One</h2><p>text.</p><h2 id="two">Two</h2><p>text.</p>
    </article></body></html>`;
    const dom = new JSDOM(html);
    expect(collectOutlineEvidence(dom.window.document)).toEqual([]);
  });
});

describe("extraction carries outline evidence", () => {
  it("extractAndNormalize returns the ordered evidence beside the blocks", async () => {
    const result = await extractAndNormalize(CHAPTERED_HTML, "https://example.com/collected");
    expect(result.outlineEvidence).toEqual([
      "Roots of the Argument",
      "The Crisis Years",
      "A Reckoning",
    ]);
  });

  it("works with role=navigation containers too", async () => {
    const html = CHAPTERED_HTML.replace(
      '<nav class="contents" aria-label="Contents">',
      '<div role="navigation">',
    ).replace("</nav>", "</div>");
    const result = await extractAndNormalize(html, "https://example.com/collected");
    expect(result.outlineEvidence?.length).toBe(3);
  });
});

describe("ingest composes the structural snapshot", () => {
  it("ingests a publisher outline without a browser-global Node constructor", async () => {
    // Production uses each JSDOM document's realm, not Vitest's DOM globals.
    vi.stubGlobal("Node", undefined);
    try {
      const response = await ingest({ html: CHAPTERED_HTML });
      expect(response.ok).toBe(true);
      if (!response.ok || !("article" in response)) return;
      expect(response.article.structure?.destinations.map((d) => d.titleSource)).toEqual([
        "publisher",
        "publisher",
        "publisher",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a chaptered paste saves with publisher chapters and a valid structure", async () => {
    const response = await ingest({ html: CHAPTERED_HTML });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) throw new Error("expected article success");
    const article = response.article;
    expect(article.structure).toBeDefined();
    const structure = article.structure!;
    expect(structure.revision).toBe(article.revision);
    expect(validateWorkStructure(article, structure)).not.toBeNull();
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual([
      "Roots of the Argument",
      "The Crisis Years",
      "A Reckoning",
    ]);
    expect(chapters.map((c) => c.titleSource)).toEqual(["publisher", "publisher", "publisher"]);
    // The publisher index outranks the heading hierarchy: the h3 subsection
    // did NOT become a chapter.
    expect(chapters).toHaveLength(3);
    // Canonical identity untouched by division.
    expect(article.revision).toBe(1);
  });

  it("a headingless paste saves with honest generated parts", async () => {
    const paragraphs = Array.from(
      { length: 8 },
      (_, i) =>
        `<p>Part ${i} of the argument continues with ${"a steady run of calm prose. ".repeat(700)}</p>`,
    ).join("\n");
    const response = await ingest({
      html: `<!doctype html><html><body><article><h1>No chapters here</h1>${paragraphs}</article></body></html>`,
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) throw new Error("expected article success");
    const article = response.article;
    expect(article.structure).toBeDefined();
    const chapters = article.structure!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters).toHaveLength(0);
    const parts = article.structure!.destinations;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const part of parts) {
      expect(part.titleSource).toBe("generated");
      expect(part.parentChapterId).toBeUndefined();
    }
  });
});
