// server/htmlToBlocks.ts
// Plan 07-04 Task 1 — the extract → sanitize → DOM-walk stage of the ingestion
// pipeline. This is the production-grade promotion of the v1.0 D-09 throwaway
// (`scripts/normalize-source.ts`): Readability extracts the article body,
// DOMPurify sanitizes with a strict allowlist (the structural XSS defense,
// ING-07), and an exhaustive DOM walk maps the result onto the 9-kind Block
// tree (the exact shape from `src/content/schema.ts`).
//
// DOM substrate — Option A (jsdom-primary). The 07-01 jsdom-on-Workers spike
// returned a HYBRID CONTINGENCY verdict (human-approved 2026-08-11): jsdom AND
// linkedom both fail the mXSS gate on Workers, so extraction+sanitize run in a
// NODE-runtime function (07-06 routes the adapter). In Node, jsdom is the
// native pair for isomorphic-dompurify and works exactly as it did for the
// v1.0 `scripts/normalize-source.ts` ancestor. The `/server` adapter boundary
// (CONTEXT.md D7-05) keeps this logic runtime-agnostic.
//
// Security boundary (RESEARCH.md §Pattern 2 + §DOMPurify Strict Config): the
// doc model IS the security boundary. DOMPurify runs ONCE here at ingest; the
// resulting Block tree is pure JSON — never HTML — so React renders Block JSON
// and `dangerouslySetInnerHTML` exists nowhere (repo-wide eslint gate, 07-07).
//
// Pitfall 4 defenses baked into SANITIZE_CONFIG:
//   - USE_PROFILES:{html:true} — no SVG/MathML (the mXSS attack surface)
//   - explicit ALLOWED_TAGS — no ADD_TAGS widening
//   - ALLOW_DATA_ATTR:false — no data-* clobbering surface
//   - default ALLOWED_URI_REGEXP kept (blocks javascript:)
//   - NEVER re-parse sanitized HTML to string then back to DOM then render
import { JSDOM } from "jsdom";
import DOMPurify, { clearWindow } from "isomorphic-dompurify";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
import type { Block, InlineRun } from "../src/content/schema";

/** Partial Provenance — the subset htmlToBlocks can extract from meta/link
 * tags. Structurally compatible with `Partial<Provenance>` (z.infer); the
 * orchestrator (07-05) merges this into a full Provenance + computes
 * originalHtmlHash from the raw HTML. */
type ProvenancePartial = {
  sourceUrl?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
};

// ── D-04 inline marks (exactly link/code/strong/em) ─────────────────────────
// Mirrors scripts/normalize-source.ts L22-27 + src/content/schema.ts Mark
// union. Emitted objects are structurally validated by ArticleSchema.parse at
// the orchestrator boundary (07-05).
type Mark =
  | { type: "link"; href: string; title?: string }
  | { type: "code" }
  | { type: "strong" }
  | { type: "em" };

type InlineRunT = { text: string; marks: Mark[] };

// ── DOM node helpers (jsdom provides the DOM lib types) ─────────────────────
function isText(n: unknown): n is Text {
  return typeof n === "object" && n !== null && (n as Text).nodeType === 3;
}
function isEl(n: unknown): n is Element {
  return typeof n === "object" && n !== null && (n as Element).nodeType === 1;
}

// ── SANITIZE_CONFIG — the locked DOMPurify strict allowlist (Pitfall 4) ──────
// RESEARCH.md §DOMPurify Strict Config L680-697 verbatim. ALLOWED_TAGS covers
// exactly the 9 block-kind tags + the 4 inline-mark tags + structural (br/hr)
// + sup (footnote-reference marker). Anything else is dropped by DOMPurify or
// becomes UnsupportedBlock in the DOM walk.
export const SANITIZE_CONFIG = {
  // No svg, no mathml (Pitfall 4 — the mXSS attack surface).
  USE_PROFILES: { html: true },
  // Exactly the tags that map to a v1.0 Block kind + the D-04 inline marks.
  ALLOWED_TAGS: [
    "p", "h1", "h2", "h3", "h4", "h5", "h6", // HeadingBlock
    "ul", "ol", "li", // BulletedListBlock / NumberedListBlock
    "blockquote", // BlockquoteBlock
    "pre", "code", // CodeBlock
    "a", // LinkMark
    "strong", "em", // StrongMark / EmMark
    "img", "figure", "figcaption", // FigureBlock (src httpUrl only)
    "br", "hr", // structural
    "sup", // FootnoteReferenceBlock (marker)
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "cite"],
  // Explicitly forbid the dangerous tags even if a profile would allow them.
  FORBID_TAGS: [
    "script", "style", "iframe", "object", "embed", "form", "input",
    "link", "meta", "base", "svg", "math",
  ],
  // No data-* attributes — eliminates the DOM-clobbering surface (Pitfall 4).
  // Do NOT set ALLOW_UNKNOWN_PROTOCOLS (preserves the default URI regex that
  // blocks javascript:).
  ALLOW_DATA_ATTR: false,
};

// ── Reverse-tabnabbing guard (T-7-18) ───────────────────────────────────────
// Defense-in-depth: add rel="noopener noreferrer" to every surviving
// <a target="_blank">. NOTE: target is not in ALLOWED_ATTR so target=_blank is
// stripped by DOMPurify before this hook fires — this hook is belt-and-
// suspenders for the day target is re-allowed. Registered once at module load.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node && node.nodeName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * sanitizeExtractedHtml — DOMPurify.sanitize under SANITIZE_CONFIG, then
 * clearWindow() to release the jsdom window state isomorphic-dompurify holds
 * internally. CRITICAL for long-running Node functions (isomorphic-dompurify
 * README): without clearWindow, the jsdom window leaks across requests.
 */
export function sanitizeExtractedHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  clearWindow();
  return clean;
}

// ── Inline-run extraction (D-04 mark set — copy of normalize-source.ts L39-95) ──
/** Recursively extract inline runs from a node, accumulating D-04 marks. */
function extractInline(node: Node, marks: Mark[]): InlineRunT[] {
  const runs: InlineRunT[] = [];
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
        // T-7-17: only http(s)/mailto hrefs become LinkMark; others are demoted
        // to plain text (the run recurses without a link mark). The schema's
        // linkableUrl refinement re-validates at ArticleSchema.parse time.
        if (/^(https?:|mailto:)/i.test(href)) {
          const title = child.getAttribute("title") ?? undefined;
          next.push(title ? { type: "link", href, title } : { type: "link", href });
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

/** Collapse leading/trailing whitespace-only runs; merge adjacent identical-mark runs. */
function tidyRuns(runs: InlineRunT[]): InlineRun[] {
  const out: InlineRunT[] = [];
  for (const r of runs) {
    if (r.text.trim().length === 0 && out.length === 0) continue; // drop leading ws
    const last = out[out.length - 1];
    const sameMarks =
      last !== undefined &&
      last.marks.length === r.marks.length &&
      last.marks.every((m, i) => JSON.stringify(m) === JSON.stringify(r.marks[i]));
    if (sameMarks && last !== undefined) {
      last.text += r.text;
    } else {
      out.push({ ...r });
    }
  }
  while (out.length) {
    const last = out[out.length - 1];
    if (last && last.text.trim().length === 0) out.pop();
    else break;
  }
  for (const r of out) r.text = r.text.replace(/[ \t]{2,}/g, " ");
  return out;
}

// ── Block-kind mapping (exhaustive — Pattern F; no default clause) ──────────
const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote",
  "figure", "pre", "table", "hr",
]);

const UNSUPPORTED_TAGS = new Set([
  "table", "iframe", "video", "audio", "embed", "object", "canvas",
  "svg", "form", "input", "button", "select", "textarea", "math",
]);

function headingLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const m = /^h([1-6])$/.exec(tag);
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4 | 5 | 6) : null;
}

/** Build a FigureBlock from a <figure> or bare <img>; UnsupportedBlock if src
 * is not a valid http(s) URL (T-7-17 — ArticleSchema.httpUrl re-validates). */
function figureBlock(el: Element): Block[] {
  const tag = el.tagName.toLowerCase();
  const img = tag === "img" ? el : el.querySelector("img");
  const figcaption = tag === "figure" ? el.querySelector("figcaption") : null;
  if (!img) {
    return [{
      kind: "unsupported",
      originalKind: tag,
      plainDescription: "An image element from the original article that the reader could not load.",
    }];
  }
  const alt = img.getAttribute("alt") ?? "";
  // img.src (IDL) returns the absolute URL (resolved by jsdom against baseURI).
  // Fall back to the raw attribute for environments where IDL resolution is off.
  const rawSrc = img.getAttribute("src") ?? "";
  let src = rawSrc;
  try {
    const idl = (img as HTMLImageElement).src;
    if (idl) src = idl;
  } catch {
    /* keep rawSrc */
  }
  if (/^https?:/i.test(src)) {
    const caption = figcaption ? tidyRuns(extractInline(figcaption, [])) : [];
    return [{ kind: "figure", alt: alt || "", src, caption }];
  }
  return [{
    kind: "unsupported",
    originalKind: "figure",
    plainDescription: "An image whose source could not be normalized to a valid URL.",
  }];
}

/** Heuristically find the main article content container in a document. */
function findContentRoot(document: Document): Element {
  const candidates = [
    "article",
    "main",
    "#readability-page-1", // Readability wraps output in this
    "#mw-content-text",
    ".mw-parser-output",
    "#content",
    "[role='main']",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 0) return el;
  }
  return document.body ?? document.documentElement;
}

/** The result shape of htmlToBlocks + extractAndNormalize (minus isReaderable). */
export interface HtmlToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
}

/**
 * visit — map a single DOM element to 0..N Block nodes (Pattern F).
 *
 * Exhaustive if-chain over the block-level tags: h1-h6, p, blockquote, ul, ol,
 * figure, img, pre, sup (footnote-ref), + an UnsupportedBlock fallback that IS
 * the catch-all (no `default` clause; any unmappable tag becomes an honest
 * DOC-06 disclosure). Container-ish elements (div, section, aside, main,
 * article) recurse into children via flatMap to find nested block content.
 *
 * Returns Block[] (rather than pushing into a shared closure) so nested
 * containers (blockquote children, list-item content) compose cleanly.
 */
function visit(el: Element, footnoteCounter: { n: number }): Block[] {
  const tag = el.tagName.toLowerCase();

  // Skip obvious chrome / non-content decoration.
  if (
    (el as Element & { classList?: DOMTokenList }).classList?.contains("mw-editsection") ||
    el.getAttribute?.("role") === "navigation"
  ) {
    return [];
  }

  // In-text footnote reference: <sup class="reference"> (Wikipedia/SEP).
  if (
    tag === "sup" &&
    ((el as Element & { classList?: DOMTokenList }).classList?.contains("reference") ||
      (el as Element & { classList?: DOMTokenList }).classList?.contains("footnote"))
  ) {
    const marker = (el.textContent ?? "").trim();
    footnoteCounter.n += 1;
    const num = /^=?\s*(\d+)/.exec(marker)?.[1] ?? String(footnoteCounter.n);
    return [{
      kind: "footnote-reference",
      footnoteId: `fn-${num}`,
      marker: marker || `[${num}]`,
    }];
  }

  const level = headingLevel(tag);
  if (level !== null) {
    const content = tidyRuns(extractInline(el, []));
    return content.length ? [{ kind: "heading", level, content }] : [];
  }

  if (tag === "p") {
    const content = tidyRuns(extractInline(el, []));
    return content.length ? [{ kind: "paragraph", content }] : [];
  }

  if (tag === "blockquote") {
    const children = Array.from(el.children).flatMap((c) => visit(c, footnoteCounter));
    if (children.length) return [{ kind: "blockquote", children }];
    // Fallback: capture the blockquote's own inline text as a paragraph.
    const content = tidyRuns(extractInline(el, []));
    return content.length ? [{ kind: "paragraph", content }] : [];
  }

  if (tag === "ul" || tag === "ol") {
    const items: { content: Block[] }[] = [];
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      const liContent = Array.from(li.children).flatMap((c) => visit(c, footnoteCounter));
      if (liContent.length) items.push({ content: liContent });
    }
    if (!items.length) return [];
    if (tag === "ul") return [{ kind: "bulleted-list", items }];
    const start = Number(el.getAttribute("start") ?? 1);
    return [{ kind: "numbered-list", items, start }];
  }

  if (tag === "figure" || tag === "img") {
    return figureBlock(el);
  }

  if (tag === "pre") {
    const codeEl = el.querySelector("code");
    const source = (codeEl ?? el).textContent ?? "";
    if (!source.trim().length) return [];
    const cls = codeEl?.getAttribute("class") ?? el.getAttribute("class") ?? "";
    const lang = /(?:language|lang)-(\w+)/.exec(cls)?.[1];
    return [lang ? { kind: "code-block", source, language: lang } : { kind: "code-block", source }];
  }

  if (tag === "hr") return []; // decorative thematic break — no Block kind

  if (UNSUPPORTED_TAGS.has(tag)) {
    return [{
      kind: "unsupported",
      originalKind: tag,
      plainDescription: `An embedded ${tag} element from the original article that the reader could not render.`,
    }];
  }

  // Container-ish elements (div, section, aside, main, article, span, dl):
  // recurse into children to find nested block content.
  if (!BLOCK_TAGS.has(tag)) {
    return Array.from(el.children).flatMap((c) => visit(c, footnoteCounter));
  }

  // Catch-all (no `default:` clause — the unsupported branch IS the default).
  return [{
    kind: "unsupported",
    originalKind: tag,
    plainDescription: `A ${tag} element from the original article that the reader could not render.`,
  }];
}

/**
 * htmlToBlocks — walk a sanitized DOM and emit a 9-kind Block tree.
 *
 * Delegates to `visit` for the exhaustive block-kind mapping (Pattern F).
 * Returns blocks, footnotes, lang, and a partial Provenance extracted from the
 * given DOM. (When called from extractAndNormalize on the sanitized Readability
 * content fragment, lang/provenance are thin — extractAndNormalize overrides
 * them with the richer original-document values.)
 */
export function htmlToBlocks(
  sanitizedDom: Document,
  sourceUrl: string | undefined,
): HtmlToBlocksResult {
  const footnoteCounter = { n: 0 };
  const root = findContentRoot(sanitizedDom);
  const blocks = Array.from(root.children).flatMap((child) => visit(child, footnoteCounter));

  return {
    blocks,
    footnotes: extractFootnoteBodies(sanitizedDom),
    lang: detectLang(sanitizedDom),
    provenancePartial: buildProvenance(sanitizedDom, sourceUrl),
  };
}

// ── Footnote body extraction (copy of normalize-source.ts L256-271) ──────────
/** Extract footnote bodies from a references/footnotes list. IDs match /^fn-\d+$/. */
function extractFootnoteBodies(
  document: Document,
  max = 50,
): { id: string; content: InlineRun[] }[] {
  const out: { id: string; content: InlineRun[] }[] = [];
  const lists = document.querySelectorAll(
    "ol.references, .references ol, #References ol, section#notes ol, section.footnotes ol, ol.citation",
  );
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

// ── Provenance + lang extraction ────────────────────────────────────────────
function metaContent(document: Document, selector: string): string | undefined {
  const el = document.querySelector(selector);
  const v = el?.getAttribute("content") ?? undefined;
  return v && v.trim() ? v.trim() : undefined;
}

function linkHref(document: Document, selector: string): string | undefined {
  const el = document.querySelector(selector);
  const v = el?.getAttribute("href") ?? undefined;
  return v && v.trim() ? v.trim() : undefined;
}

/** Build a Partial<Provenance> from the document's meta/link tags. The
 * orchestrator (07-05) merges this with id/revision/retrievedAt/originalHtmlHash. */
function buildProvenance(document: Document, sourceUrl: string | undefined): ProvenancePartial {
  const ogTitle = metaContent(document, "meta[property='og:title']");
  const docTitle = document.querySelector("title")?.textContent?.trim();
  const h1Title = document.querySelector("h1")?.textContent?.trim();
  const title = ogTitle ?? docTitle ?? h1Title ?? undefined;
  const author =
    metaContent(document, "meta[name='author']") ??
    metaContent(document, "meta[property='article:author']") ??
    undefined;
  const publishedAt =
    metaContent(document, "meta[property='article:published_time']") ?? undefined;
  const canonical =
    linkHref(document, "link[rel='canonical']") ??
    metaContent(document, "meta[property='og:url']") ??
    sourceUrl;
  const partial: ProvenancePartial = {};
  if (title) partial.title = title;
  if (author) partial.author = author;
  if (publishedAt) partial.publishedAt = publishedAt;
  if (canonical && /^https?:/i.test(canonical)) partial.sourceUrl = canonical;
  return partial;
}

/** Read <html lang="...">; default "en" if absent. */
function detectLang(document: Document): string {
  const lang = document.documentElement?.getAttribute("lang") ?? "";
  return lang.trim() || "en";
}

// ── extractAndNormalize — the full extract → sanitize → walk stage ───────────
export interface ExtractAndNormalizeResult extends HtmlToBlocksResult {
  isReaderable: boolean;
}

/**
 * extractAndNormalize — the full pipeline stage.
 *
 * 1. Construct the original jsdom document (url passed so Readability resolves
 *    relative links AND img.src resolves against the document base).
 * 2. isProbablyReaderable — the cheap pre-check feeding deriveConfidence (07-03).
 * 3. Extract provenance + lang from the ORIGINAL document head (richer than the
 *    Readability content fragment, which has no <head>).
 * 4. Readability.parse on a CLONE (Readability mutates its input — RESEARCH L106).
 * 5. null extraction → empty blocks (orchestrator + confidence decide refusal).
 * 6. Else: sanitize article.content (DOMPurify + clearWindow), re-parse into a
 *    clean DOM, walk to Block tree.
 */
export async function extractAndNormalize(
  html: string,
  finalUrl: string | undefined,
): Promise<ExtractAndNormalizeResult> {
  // 1. Original document — url enables relative-link + img.src resolution.
  const url = finalUrl && /^https?:/i.test(finalUrl) ? finalUrl : undefined;
  const dom = new JSDOM(html, { url: url ?? undefined });
  const document = dom.window.document;

  // 2. Readability pre-check (feeds deriveConfidence in 07-05).
  const isReaderable = isProbablyReaderable(document);

  // 3. Provenance + lang from the ORIGINAL document head (richer than the
  // Readability content fragment).
  const provenancePartial = buildProvenance(document, url);
  const lang = detectLang(document);

  // 4. Readability on a clone (Readability MUTATES its input). cloneNode
  // returns Node per the DOM lib types; Readability expects a Document.
  const reader = new Readability(document.cloneNode(true) as Document);
  const article = reader.parse();

  // 5. null extraction → orchestrator handles via deriveConfidence.
  if (article === null || !article.content) {
    return { blocks: [], footnotes: [], lang, provenancePartial, isReaderable };
  }

  // 6. Sanitize the extracted content, re-parse, walk to Block tree.
  const sanitized = sanitizeExtractedHtml(article.content);
  const cleanDom = new JSDOM(sanitized, { url: url ?? undefined });
  const walked = htmlToBlocks(cleanDom.window.document, url);

  // The original-document lang + provenance are richer than what htmlToBlocks
  // can extract from the sanitized content fragment — prefer them.
  return {
    blocks: walked.blocks,
    footnotes: walked.footnotes,
    lang,
    provenancePartial,
    isReaderable,
  };
}
