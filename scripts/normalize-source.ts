// THROWAWAY — D-09 dev tool, not product code. Never imported by the app bundle.
//
// Best-effort normalizer that reads saved source HTML and emits a DRAFT canonical
// JSON fixture for human review. The emitted JSON is a STARTING POINT — the
// human-reviewed/corrected JSON (src/fixtures/articles/*.canonical.json) is the
// source of truth, never this script's raw output (D-09).
//
// Usage:
//   npx tsx scripts/normalize-source.ts <source-html-path> <slug> [lang] [license] [--max-blocks N]
//
// Limitations (intentional — D-09 is an authoring aid, not product code):
//   - Generic heuristic content extraction; does not understand every site's chrome.
//   - `unsupported` blocks get a PLACEHOLDER plainDescription that the reviewer
//     MUST rewrite in plain reader-facing language (UI-SPEC §Copywriting).
//   - Footnote bodies are best-effort; the reviewer must verify footnoteId
//     consistency (every footnote-reference needs a matching FootnoteBody).
//   - Emits at most --max-blocks (default 60) to keep the draft reviewable.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";

// ── Inline marks (D-04: exactly link/code/strong/em) ─────────────────────────
type Mark =
  | { type: "link"; href: string; title?: string }
  | { type: "code" }
  | { type: "strong" }
  | { type: "em" };

type InlineRun = { text: string; marks: Mark[] };

function isText(n: unknown): n is Text {
  return typeof n === "object" && n !== null && (n as Text).nodeType === 3;
}
function isEl(n: unknown): n is Element {
  return typeof n === "object" && n !== null && (n as Element).nodeType === 1;
}

/** Recursively extract inline runs from a node, accumulating marks. */
function extractInline(node: Node, marks: Mark[]): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const child of Array.from(node.childNodes ?? [])) {
    if (isText(child)) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ");
      if (text.trim().length > 0) runs.push({ text, marks });
      else if (text.length > 0) runs.push({ text: " ", marks });
    } else if (isEl(child)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "br") {
        runs.push({ text: " ", marks });
        continue;
      }
      const next = [...marks];
      // D-04 mark set. sub/sup/del/strike/s are intentionally NOT carried.
      if (tag === "a") {
        const href = child.getAttribute("href") ?? "";
        if (/^(https?:|mailto:)/i.test(href)) {
          const title = child.getAttribute("title") ?? undefined;
          next.push(title ? { type: "link", href, title } : { type: "link", href });
        } else {
          // non-linkable anchor — recurse without a link mark
        }
      } else if (tag === "code" || tag === "kbd" || tag === "samp") {
        next.push({ type: "code" });
      } else if (tag === "strong" || tag === "b") {
        next.push({ type: "strong" });
      } else if (tag === "em" || tag === "i") {
        next.push({ type: "em" });
      }
      runs.push(...extractInline(child, next));
    }
  }
  return runs;
}

/** Collapse a leading/trailing whitespace-only run; merge adjacent identical-mark runs. */
function tidyRuns(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const r of runs) {
    if (r.text.trim().length === 0 && out.length === 0) continue; // drop leading ws
    const last = out[out.length - 1];
    const sameMarks =
      !!last &&
      last.marks.length === r.marks.length &&
      last.marks.every((m, i) => JSON.stringify(m) === JSON.stringify(r.marks[i]));
    if (sameMarks && !!last) {
      last.text += r.text;
    } else {
      out.push({ ...r });
    }
  }
  while (out.length && out[out.length - 1].text.trim().length === 0) out.pop();
  // collapse internal whitespace runs within each run's text
  for (const r of out) r.text = r.text.replace(/[ \t]{2,}/g, " ");
  return out;
}

// ── Block extraction ─────────────────────────────────────────────────────────
type Block = Record<string, unknown>;

const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote",
  "figure", "pre", "table", "hr",
]);

/** Elements that are unsupported in Phase 1 → emit one unsupported block. */
const UNSUPPORTED_TAGS = new Set([
  "table", "iframe", "video", "audio", "embed", "object", "canvas",
  "svg", "form", "input", "button", "select", "textarea", "math",
]);

/** Find the main article content container heuristically. */
function findContent(document: Document): Element {
  const candidates = [
    "article",
    "main",
    "#mw-content-text",        // Wikipedia
    ".mw-parser-output",        // Wikipedia alt
    "#content",                 // SEP / generic
    "#article-content",
    ".article-body",
    "[role='main']",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 200) return el;
  }
  return document.body ?? document.documentElement;
}

function headingLevel(tag: string): number | null {
  const m = /^h([1-6])$/.exec(tag);
  return m ? Number(m[1]) : null;
}

/** Walk block-level children of a container, emitting canonical blocks. */
function walkBlocks(container: Element, maxBlocks: number): Block[] {
  const blocks: Block[] = [];
  const visit = (el: Element) => {
    if (blocks.length >= maxBlocks) return;
    const tag = el.tagName.toLowerCase();

    // Skip obvious chrome / non-content
    if (
      el.classList?.contains("mw-editsection") || // Wikipedia [edit] links
      el.getAttribute?.("role") === "navigation" ||
      el.classList?.contains("reference") && tag === "li" // handled separately
    ) {
      return;
    }

    // In-text footnote reference: <sup class="reference"><a href="#cite_note-N">[N]</a></sup>
    if (tag === "sup" && el.classList?.contains("reference")) {
      const marker = (el.textContent ?? "").trim();
      const num = /^=?\s*(\d+)/.exec(marker)?.[1] ?? String(blocks.length);
      blocks.push({
        kind: "footnote-reference",
        footnoteId: `fn-${num}`,
        marker: marker || `[${num}]`,
      });
      return;
    }

    const level = headingLevel(tag);
    if (level !== null) {
      const content = tidyRuns(extractInline(el, []));
      if (content.length) blocks.push({ kind: "heading", level, content });
      return;
    }

    if (tag === "p") {
      const content = tidyRuns(extractInline(el, []));
      if (content.length) blocks.push({ kind: "paragraph", content });
      return;
    }

    if (tag === "blockquote") {
      const children = walkBlocks(el, maxBlocks - blocks.length);
      if (children.length) blocks.push({ kind: "blockquote", children });
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const items: { content: Block[] }[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== "li") continue;
        const content = walkBlocks(li, maxBlocks - blocks.length);
        if (content.length) items.push({ content });
      }
      if (items.length) {
        if (tag === "ul") blocks.push({ kind: "bulleted-list", items });
        else blocks.push({ kind: "numbered-list", items, start: 1 });
      }
      return;
    }

    if (tag === "figure") {
      const img = el.querySelector("img");
      const cap = el.querySelector("figcaption");
      const alt = img?.getAttribute("alt") ?? "";
      let src = img?.getAttribute("src") ?? img?.getAttribute("data-src") ?? "";
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("/") && img?.baseURI) {
        try {
          src = new URL(src, img.baseURI).href;
        } catch {
          /* leave as-is */
        }
      }
      if (/^https?:/i.test(src)) {
        const caption = cap ? tidyRuns(extractInline(cap, [])) : [];
        blocks.push({ kind: "figure", alt: alt || "Image from the original article.", src, caption });
      } else {
        blocks.push({
          kind: "unsupported",
          originalKind: "figure",
          plainDescription: "PLACEHOLDER: An image whose source could not be normalized. Describe it in reader-facing language.",
        });
      }
      return;
    }

    if (tag === "pre") {
      const codeEl = el.querySelector("code");
      const source = (codeEl ?? el).textContent ?? "";
      if (source.trim().length) {
        const cls = (codeEl?.getAttribute("class") ?? el.getAttribute("class") ?? "");
        const lang = /(?:language|lang)-(\w+)/.exec(cls)?.[1];
        blocks.push({ kind: "code-block", source, ...(lang ? { language: lang } : {}) });
      }
      return;
    }

    if (UNSUPPORTED_TAGS.has(tag)) {
      blocks.push({
        kind: "unsupported",
        originalKind: tag,
        plainDescription: `PLACEHOLDER: An embedded ${tag} element from the original article. Describe what a reader is missing in plain language.`,
      });
      return;
    }

    if (tag === "hr") return; // skip thematic breaks

    // Container-ish elements (div, section, aside, main, article, span, dd, dl, dt):
    // recurse into children to find nested block content.
    if (!BLOCK_TAGS.has(tag) && !UNSUPPORTED_TAGS.has(tag)) {
      for (const child of Array.from(el.children)) visit(child);
    }
  };

  for (const child of Array.from(container.children)) visit(child);
  return blocks;
}

/** Extract footnote bodies from a references/references list (Wikipedia/SEP). */
function extractFootnoteBodies(document: Document, max = 12): { id: string; content: InlineRun[] }[] {
  const out: { id: string; content: InlineRun[] }[] = [];
  const lists = document.querySelectorAll("ol.references, .references ol, #References ol, section#notes ol, ol.citation");
  let n = 0;
  for (const list of Array.from(lists)) {
    for (const li of Array.from(list.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      if (n >= max) break;
      n += 1;
      const content = tidyRuns(extractInline(li, []));
      if (content.length) out.push({ id: `fn-${n}`, content });
    }
    if (out.length >= max) break;
  }
  return out;
}

// ── Provenance extraction ────────────────────────────────────────────────────
function metaContent(document: Document, selector: string): string | undefined {
  const el = document.querySelector(selector);
  const v = el?.getAttribute("content") ?? undefined;
  return v && v.trim() ? v.trim() : undefined;
}

function buildProvenance(document: Document, sourceHtml: string, sourceUrlHint: string) {
  const originalHtmlHash = createHash("sha256").update(Buffer.from(sourceHtml, "utf-8")).digest("hex");
  const title =
    metaContent(document, "meta[property='og:title']") ??
    (document.querySelector("title")?.textContent?.trim() || undefined) ??
    (document.querySelector("h1")?.textContent?.trim() || undefined) ??
    "Untitled";
  const author =
    metaContent(document, "meta[name='author']") ??
    metaContent(document, "meta[property='article:author']") ??
    undefined;
  const publishedAt =
    metaContent(document, "meta[property='article:published_time']") ??
    undefined;
  const canonical =
    metaContent(document, "link[rel='canonical']",) ??
    metaContent(document, "meta[property='og:url']") ??
    sourceUrlHint;
  return {
    sourceUrl: /^https?:/i.test(canonical) ? canonical : sourceUrlHint,
    title,
    ...(author ? { author } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    retrievedAt: new Date().toISOString(),
    originalHtmlHash,
  };
}

function metaContentAttr(document: Document, selector: string): string | undefined {
  // helper for <link rel=canonical href=...>: read href not content
  const el = document.querySelector(selector);
  if (!el) return undefined;
  return el.getAttribute("href") ?? undefined;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/normalize-source.ts <source-html> <slug> [lang] [license] [--max-blocks N] [--source-url URL]");
    process.exit(1);
  }
  const sourcePath = args[0] as string;
  const slug = args[1] as string;
  const lang = (args[2] as string) || "en";
  const license = args[3] && !args[3].startsWith("--") ? (args[3] as string) : undefined;
  const maxBlocksIdx = args.indexOf("--max-blocks");
  const maxBlocks = maxBlocksIdx >= 0 ? Number(args[maxBlocksIdx + 1]) : 60;
  const urlIdx = args.indexOf("--source-url");
  const sourceUrlHint = urlIdx >= 0 ? (args[urlIdx + 1] as string) : `https://example.com/${slug}`;

  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error(`slug must match /^[a-z0-9-]+$/ — got "${slug}"`);
    process.exit(1);
  }

  const sourceHtml = await readFile(sourcePath, "utf-8");
  const { document } = parseHTML(sourceHtml);

  const content = findContent(document);
  const blocks = walkBlocks(content, maxBlocks);
  const footnotes = extractFootnoteBodies(document);

  let provenance = buildProvenance(document, sourceHtml, sourceUrlHint);
  // buildProvenance used the wrong canonical lookup; fix here:
  const canonicalHref = metaContentAttr(document, "link[rel='canonical']");
  if (canonicalHref && /^https?:/i.test(canonicalHref)) provenance.sourceUrl = canonicalHref;
  if (license) provenance = { ...provenance, license };

  const fixture = {
    id: slug,
    revision: 1,
    lang,
    provenance,
    blocks,
    footnotes,
  };

  const outPath = `src/fixtures/articles/${slug}.canonical.json`;
  await writeFile(outPath, JSON.stringify(fixture, null, 2) + "\n", "utf-8");

  console.log(`\nEmitted DRAFT fixture → ${outPath}`);
  console.log(`  blocks: ${blocks.length}, footnotes: ${footnotes.length}`);
  console.log(`  sourceUrl: ${provenance.sourceUrl}`);
  console.log(`  title: ${provenance.title}`);
  console.log(`  originalHtmlHash (sha-256): ${provenance.originalHtmlHash}`);
  console.log(`\nREVIEW REQUIRED (D-09):`);
  console.log(`  1. Verify block coverage against the source article; trim nav/footer noise.`);
  console.log(`  2. REWRITE every unsupported.plainDescription in plain reader-facing language.`);
  console.log(`  3. Verify footnoteId consistency: every footnote-reference needs a matching footnote body.`);
  console.log(`  4. Confirm provenance (sourceUrl, author, publishedAt) are real and correct.`);
  console.log(`  5. Confirm id slug "${slug}" matches the filename.`);
  console.log(`  The reviewed JSON is the source of truth, not this script's output.`);
}

main().catch((err) => {
  console.error("normalize-source failed:", err);
  process.exit(1);
});
