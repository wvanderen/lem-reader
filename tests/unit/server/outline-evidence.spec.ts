// tests/unit/server/outline-evidence.spec.ts
// Issue #236 — reliable publisher outline evidence captured during
// extraction. The source's own table of contents (same-page nav links whose
// targets are headings) is the one signal that distinguishes AUTHORIAL
// chapters from ordinary headings — captured from the source DOM while it is
// available, with no additional network requests, matched later only when it
// reconciles strictly and in source order (structure.ts's gate).
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

// URL-arm ingest (issue #237) runs the real safeFetch pipeline: DNS is
// controlled at the module boundary (the safe-fetch.spec pattern); fetch is
// stubbed per-test.
vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  },
}));
import dns from "node:dns";

import { collectOutlineEvidence, extractAndNormalize } from "../../../server/htmlToBlocks";
import { ingest } from "../../../server/ingest";
import { ArticleSchema } from "../../../src/content/schema";
import { deriveWorkStructure, validateWorkStructure } from "../../../src/content/structure";
import {
  PUBLISHER_CHAPTER_TITLES,
  PUBLISHER_WORK_TITLE,
  publisherIndexWorkHtml,
} from "../../../tests/fixtures/publisherIndexWork";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

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

describe("collectOutlineEvidence — the publisher index region (issue #237)", () => {
  // The reference source's index is NOT a nav of same-page fragment links:
  // it is a heading-titled card ("Index") listing chapter-page links. The
  // entries are read as ordered TITLES — hrefs are never fetched.
  const SELF_URL = "https://clockwork.example/the-clockmakers-archive/all-pages.htm";

  /** A minimal index-page scaffold — one helper so each caller declares
   * only the shape it tests (the card markup, optional prelude, body). */
  function indexPage(opts: {
    prelude?: string;
    heading: string;
    list?: string;
    body: string;
  }): string {
    return `<!doctype html><html><body><article>
      ${opts.prelude ?? ""}
      ${opts.heading}
      ${opts.list ?? ""}
      ${opts.body}
    </article></body></html>`;
  }
  const WORK_URL = "https://example.com/work.htm";
  const evidenceAt = (html: string, url = WORK_URL): string[] => {
    const dom = new JSDOM(html, { url });
    return collectOutlineEvidence(dom.window.document, url);
  };
  const TWO_HEADINGS = `<h2 id="one">One</h2><p>text.</p><h2 id="two">Two</h2><p>text.</p>`;

  it("reads the fourteen-entry index card in order, dropping the self-referential entry", () => {
    const dom = new JSDOM(publisherIndexWorkHtml(), { url: SELF_URL });
    expect(collectOutlineEvidence(dom.window.document, SELF_URL)).toEqual([
      PUBLISHER_WORK_TITLE,
      ...PUBLISHER_CHAPTER_TITLES,
    ]);
  });

  it("keeps an unresolvable self-link when no base URL exists (paste path)", () => {
    // Without a fetched URL there is nothing to resolve the self-link
    // against — the entry is kept and derivation's strict reconciliation
    // decides (a paste of the all-pages shape honestly falls back).
    const dom = new JSDOM(publisherIndexWorkHtml());
    const entries = collectOutlineEvidence(dom.window.document);
    expect(entries).toHaveLength(PUBLISHER_CHAPTER_TITLES.length + 2);
    expect(entries.at(-1)).toBe("All Pages");
  });

  it("excludes only the entry resolving to the imported document itself", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: `<h2>Contents</h2>`,
          list: `<ul>
        <li><a href="https://clockwork.example/work/all-pages.htm">All Pages</a></li>
        <li><a href="one.htm">One</a></li>
        <li><a href="two.htm">Two</a></li>
      </ul>`,
          body: TWO_HEADINGS,
        }),
        "https://clockwork.example/work/all-pages.htm",
      ),
    ).toEqual(["One", "Two"]);
  });

  it("entry text excludes nested lists (a sub-index is not part of the label)", () => {
    // Capture reads entry labels: "One" and "Two" (never the nested list's
    // "Sub heading"). Whether they reconcile with headings is derivation's
    // strictly validated decision.
    expect(
      evidenceAt(
        indexPage({
          heading: `<h3>Contents</h3>`,
          list: `<ul>
        <li>One<ul><li><a href="#sub">Sub heading</a></li></ul></li>
        <li>Two</li>
      </ul>`,
          body: `<h2 id="sub">Sub heading</h2><p>text.</p>`,
        }),
      ),
    ).toEqual(["One", "Two"]);
  });

  it("rejects the whole index when a title exceeds the evidence bound", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul><li>One</li><li>${"Missing".repeat(44)}</li><li>Two</li></ul>`,
          body: TWO_HEADINGS,
        }),
      ),
    ).toEqual([]);
  });

  it("rejects an oversized index rather than accepting a truncated prefix", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul>${Array.from({ length: 201 }, (_, i) => `<li>Chapter ${i}</li>`).join("")}</ul>`,
          body: TWO_HEADINGS,
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["#two", "#one"],
    ["#missing", "#two"],
    ["#paragraph", "#two"],
    ["#one", "#one"],
    ["#%", "#two"],
    ["#", "#two"],
    ["https://example.com/work.htm#two", "https://example.com/work.htm#one"],
  ])("rejects contradictory or invalid local targets: %s, %s", (first, second) => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul><li><a href="${first}">One</a></li><li><a href="${second}">Two</a></li></ul>`,
          body: `${TWO_HEADINGS}<p id="paragraph">Not a heading.</p>`,
        }),
      ),
    ).toEqual([]);
  });

  it("rejects a single index entry claiming multiple links", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul><li><a href="#one">One</a><a href="#two">Two</a></li><li>Two</li></ul>`,
          body: TWO_HEADINGS,
        }),
      ),
    ).toEqual([]);
  });

  it("rejects numbered local entries whose target order contradicts their ordinals", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul><li><a href="#second">Letters</a></li><li><a href="#first">Letters (2)</a></li></ul>`,
          body: `<h2 id="first">Letters</h2><p>A.</p><h2 id="second">Letters</h2><p>B.</p>`,
        }),
      ),
    ).toEqual([]);
  });

  it("accepts valid local targets, including publisher ordinals and index typography", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: "<h2>Contents</h2>",
          list: `<ul><li><a href="#first">Letters</a></li><li><a href="#second">Letters (2)</a></li><li><a href="#end">APPENDIX: Log</a></li></ul>`,
          body: `<h2 id="first">Letters</h2><p>A.</p><h2 id="second">Letters</h2><p>B.</p><h2 id="end">APPENDIX Log</h2><p>C.</p>`,
        }),
      ),
    ).toEqual(["Letters", "Letters (2)", "APPENDIX: Log"]);
  });

  it("validates fragment-only links on the paste path without a base URL", () => {
    const dom = new JSDOM(
      indexPage({
        heading: "<h2>Contents</h2>",
        list: `<ul><li><a href="#two">One</a></li><li><a href="#one">Two</a></li></ul>`,
        body: TWO_HEADINGS,
      }),
    );
    expect(collectOutlineEvidence(dom.window.document)).toEqual([]);
  });

  it("returns no evidence when the index heading has no following list", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: `<h3>Index</h3>`,
          body: `<p>Contents are described in prose only.</p>
      ${TWO_HEADINGS}`,
        }),
      ),
    ).toEqual([]);
  });

  it("a list alone is not evidence — the publisher must declare the index", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: `<ul class="nav"><li><a href="one.htm">One</a></li><li><a href="two.htm">Two</a></li></ul>`,
          body: TWO_HEADINGS,
        }),
      ),
    ).toEqual([]);
  });

  it("an ordered list works as the index region", () => {
    expect(
      evidenceAt(
        indexPage({
          heading: `<h2>Table of Contents</h2>`,
          list: `<ol><li><a href="one.htm">One</a></li><li><a href="two.htm">Two</a></li></ol>`,
          body: TWO_HEADINGS,
        }),
      ),
    ).toEqual(["One", "Two"]);
  });

  it("nav fragment evidence takes precedence over an index region", () => {
    expect(
      evidenceAt(
        indexPage({
          prelude: `<nav><a href="#alpha">Alpha</a><a href="#beta">Beta</a></nav>`,
          heading: `<h3>Contents</h3>`,
          list: `<ul><li><a href="one.htm">One</a></li><li><a href="two.htm">Two</a></li></ul>`,
          body: `<h2 id="alpha">Alpha</h2><p>text.</p><h2 id="beta">Beta</h2><p>text.</p>`,
        }),
      ),
    ).toEqual(["Alpha", "Beta"]);
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

  it("ingests the fourteen-entry publisher index into validated publisher chapters (issue #237)", async () => {
    // Paste path: no base URL, so the fixture drops the self-referential
    // entry (unresolvable self-links are derivation's honest fallback, not
    // silently droppable). The remaining disagreement resolves fully.
    const response = await ingest({
      html: publisherIndexWorkHtml({ selfLink: false }),
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) throw new Error("expected article success");
    const article = response.article;
    const structure = article.structure;
    expect(structure).toBeDefined();
    expect(validateWorkStructure(article, structure!)).not.toBeNull();
    const chapters = structure!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters).toHaveLength(14);
    expect(chapters.map((c) => c.title)).toEqual([...PUBLISHER_CHAPTER_TITLES]);
    expect(chapters.every((c) => c.titleSource === "publisher")).toBe(true);
    // The conflicting heading hierarchy stays INSIDE the publisher chapters:
    // no "Session of March 29" chapter, and the spurious splits are gone.
    expect(chapters.some((c) => c.title.startsWith("Session of"))).toBe(false);
    // Canonical identity untouched by division.
    expect(article.revision).toBe(1);
  });

  it("degrades the ambiguous bare-repeat variant to honest heading-derived structure", async () => {
    const response = await ingest({
      html: publisherIndexWorkHtml({ variant: "ambiguous-bare-repeats", selfLink: false }),
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) throw new Error("expected article success");
    const article = response.article;
    const structure = article.structure;
    expect(structure).toBeDefined();
    expect(validateWorkStructure(article, structure!)).not.toBeNull();
    const chapters = structure!.destinations.filter((d) => d.kind === "chapter");
    // No publisher chapter survived the ambiguity — the heading heuristic
    // derived the sections, including the over-splitting sessions.
    expect(chapters.every((c) => c.titleSource === "heading")).toBe(true);
    expect(chapters.map((c) => c.title)).toContain("Session of March 29");
    expect(chapters.map((c) => c.title)).toContain("Letters to the Guild");
  });

  it("fetches the imported URL exactly once — the index's links are never crawled", async () => {
    // The reference shape's home arm: ingest({ url }). The index card's
    // sixteen chapter-page hrefs are read as TITLES; a fetch count of one
    // is the no-crawl contract as CI evidence, not a by-construction claim.
    resolve4Mock.mockResolvedValue(["93.184.216.34"]); // public — SSRF guard passes
    resolve6Mock.mockResolvedValue([]);
    const url = "https://clockwork.example/the-clockmakers-archive/all-pages.htm";
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => ({
      status: 200,
      ok: true,
      url,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => publisherIndexWorkHtml(),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await ingest({ url });
      expect(response.ok).toBe(true);
      if (!response.ok || !("article" in response)) throw new Error("expected article success");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The base URL makes the self-referential "All Pages" entry resolvable
      // and excludable — the arm the paste path cannot exercise.
      const article = response.article;
      const chapters = article.structure!.destinations.filter((d) => d.kind === "chapter");
      expect(chapters).toHaveLength(14);
      expect(chapters.map((c) => c.title)).toEqual([...PUBLISHER_CHAPTER_TITLES]);
      expect(chapters.every((c) => c.titleSource === "publisher")).toBe(true);
      expect(validateWorkStructure(article, article.structure!)).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(["over-limit", "contradictory-link"])(
    "ingest falls back honestly for an index with %s evidence",
    async (variant) => {
      let html = publisherIndexWorkHtml({ selfLink: false });
      if (variant === "over-limit") {
        html = html.replace(
          '<ul class="nav flex-column">',
          `<ul class="nav flex-column"><li>${"Missing".repeat(44)}</li>`,
        );
      } else {
        html = html
          .replace('href="/the-clockmakers-archive/introduction.htm"', 'href="#wrong-chapter"')
          .replace("<h2>The Early Benches</h2>", '<h2 id="wrong-chapter">The Early Benches</h2>');
      }
      const response = await ingest({ html });
      expect(response.ok).toBe(true);
      if (!response.ok || !("article" in response)) throw new Error("expected article success");
      const chapters = response.article.structure!.destinations.filter((d) => d.kind === "chapter");
      expect(chapters.length).toBeGreaterThan(0);
      expect(chapters.every((c) => c.titleSource === "heading")).toBe(true);
      expect(chapters.map((c) => c.title)).toContain("Session of March 29");
    },
  );

  it("a legacy record derives honest heading structure from the same document without evidence", async () => {
    // A saved work carries no captured evidence — its client-side derivation
    // runs evidence-less and must neither refetch nor fabricate publisher
    // chapters: the same document derives safe heading sections (over-splits
    // and all) with a fully valid structure.
    const extracted = await extractAndNormalize(
      publisherIndexWorkHtml({ selfLink: false }),
      undefined,
    );
    const derived = deriveWorkStructure({
      id: "legacy-fixture",
      revision: 1,
      lang: extracted.lang,
      blocks: extracted.blocks,
      footnotes: extracted.footnotes,
      provenanceTitle: PUBLISHER_WORK_TITLE,
    });
    expect(derived).toBeDefined();
    const chapters = derived!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters.every((c) => c.titleSource === "heading")).toBe(true);
    const parsed = ArticleSchema.parse({
      id: "legacy-fixture",
      revision: 1,
      lang: extracted.lang,
      provenance: {
        title: PUBLISHER_WORK_TITLE,
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "6".repeat(64),
      },
      blocks: extracted.blocks,
      footnotes: extracted.footnotes,
      structure: derived,
    });
    expect(validateWorkStructure(parsed, derived!)).not.toBeNull();
  });
});
