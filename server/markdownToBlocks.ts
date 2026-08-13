// server/markdownToBlocks.ts
// Plan 08-01 Task 1 — the strict-CommonMark → 9-kind Block tree adapter. This
// is the second intake format of the Phase 7 ingestion pipeline (sibling of
// `server/htmlToBlocks.ts`). The orchestrator (`server/ingest.ts`) treats
// `markdownToBlocks` and `extractAndNormalize` identically downstream — they
// return the EXACT same `{ blocks, footnotes, lang, provenancePartial,
// isReaderable }` shape, and the same `ArticleSchema.parse` +
// `assertRoundTripAnchor` + `deriveConfidence` stages run on both paths.
//
// ──────────────────────────────────────────────────────────────────────────
// SECURITY BOUNDARY (D8-16 — Pitfall 8-2):
// Strict CommonMark by default escapes raw HTML to inert text. We never
// instruct remark-parse to pass through raw HTML. The mdast walker maps
// `html` nodes to a ParagraphBlock whose inline run text is the literal
// `node.value` string (e.g. the string "<script>alert(1)</script>"). The
// string never re-enters an HTML parser — React escapes text children on
// render, and the Block tree is pure JSON by the time it reaches the
// renderer. The repo-wide eslint `react/no-danger` rule is the
// belt-and-suspenders structural defense.
//
// ⚠️ Future maintainer: DO NOT enable raw-HTML pass-through on the parser,
// DO NOT pipe `html` node values through an HTML parser, DO NOT carry raw
// HTML as a structured payload. The doc model IS the security boundary
// (ING-07) — once content is Block JSON it is inert.
// ──────────────────────────────────────────────────────────────────────────
//
// Pitfall 8-1 (round-trip drift): the inline-run shape MUST match what
// `normalizeText` expects. `extractInlineMdast` + `tidyRuns` mirror the
// DOM-walking pair in `server/htmlToBlocks.ts` L121-181 byte-faithfully
// (whitespace collapse via the same `replace(/\s+/g, " ")`, mark
// accumulation, leading/trailing ws drop, adjacent same-mark merge). A drift
// here silently orphans every annotation anchor and trips
// `assertRoundTripAnchor` on the next ingest.
//
// Server-only (Pitfall 8-6): `unified` / `remark-parse` / `remark-frontmatter`
// / `yaml` are ESM-only and never imported by `/src/*` modules at runtime.
// Only the `Block` / `InlineRun` types are imported (erased by tsc), so the
// client bundle does not grow.
import { unified } from "unified";
import remarkParse from "remark-parse"; // strict CommonMark (raw HTML escaped by default)
import remarkFrontmatter from "remark-frontmatter"; // emits mdast `yaml` node for front-matter
import { parse as parseYaml } from "yaml"; // strict YAML 1.2 (safe-schema; no implicit type coercion)
import type { Block, InlineRun } from "../src/content/schema";

/** ProvenancePartial — same shape as `server/htmlToBlocks.ts` L37-42. The
 * orchestrator merges this into a full Provenance + computes originalHtmlHash
 * from the raw markdown bytes. */
type ProvenancePartial = {
  sourceUrl?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
};

// ── D-04 inline marks (exactly link/code/strong/em) ─────────────────────────
// Mirrors `server/htmlToBlocks.ts` L48-52 + src/content/schema.ts Mark union.
// Emitted objects are structurally validated by ArticleSchema.parse at the
// orchestrator boundary (07-05). The discriminatedUnion in schema.ts is the
// single source of truth; this mirror exists only because the mdast walker
// accumulates plain objects before tidyRuns narrows them to InlineRun.
type Mark =
  | { type: "link"; href: string; title?: string }
  | { type: "code" }
  | { type: "strong" }
  | { type: "em" };

type InlineRunT = { text: string; marks: Mark[] };

// ── The 9 schema-allowed block kinds (src/content/schema.ts BlockSchema). ────
// Used by the catch-all UnsupportedBlock branch (Pattern F — no `default`).
const SCHEMA_KINDS = new Set([
  "heading",
  "paragraph",
  "bulleted-list",
  "numbered-list",
  "blockquote",
  "figure",
  "code-block",
  "footnote-reference",
  "unsupported",
]);

/** Minimal mdast node shape this walker depends on. We don't import the full
 * `@types/mdast` types (would require an extra dev dep); instead we mirror
 * only the fields the mapping table (RESEARCH.md §Pattern 1) reads. The
 * processor output IS mdast, so the structural contract is enforced by the
 * suite at `tests/unit/server/markdown-to-blocks.spec.ts`. */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  // heading
  depth?: number;
  // code
  lang?: string | null;
  // list
  ordered?: boolean;
  start?: number | null;
  // link / image
  url?: string;
  title?: string | null;
  alt?: string | null;
}

/** The unified processor — strict CommonMark + YAML front-matter (D8-16).
 * `remarkParse` (default CommonMark) escapes raw HTML; we never enable the
 * raw-HTML pass-through option. `remarkFrontmatter` recognises the leading
 * `--- ... ---` block and emits it as a `yaml` mdast node. */
const processor = unified().use(remarkParse).use(remarkFrontmatter);

// ── Inline-run extraction (D-04 mark set — mirrors htmlToBlocks L121-156) ────
/** Recurse mdast `.children` and accumulate inline runs carrying D-04 marks.
 * The recursion shape mirrors `extractInline` in htmlToBlocks.ts L121-156 so
 * the output feeds `normalizeText` identically (Pitfall 8-1). */
function extractInlineMdast(node: MdastNode, marks: Mark[]): InlineRunT[] {
  const runs: InlineRunT[] = [];
  for (const child of node.children ?? []) {
    if (child.type === "text") {
      // whitespace collapse — Pitfall 8-1 (byte-faithful with htmlToBlocks L125)
      const text = (child.value ?? "").replace(/\s+/g, " ");
      if (text.trim().length > 0) runs.push({ text, marks });
      else if (text.length > 0) runs.push({ text: " ", marks });
      continue;
    }
    if (child.type === "break") {
      // mdast `break` (a backslash + newline or two trailing spaces) → single
      // space — mirrors htmlToBlocks L130-133 (`<br>` handling).
      runs.push({ text: " ", marks });
      continue;
    }
    if (child.type === "inlineCode") {
      // mdast `inlineCode` is a LEAF with `.value` (no `.children`); emit the
      // literal value as a text run carrying the code mark. Mirrors the
      // htmlToBlocks `<code>` path: the mark is pushed AND the element's text
      // content is captured (L145-147 + L152 recursion). For mdast, the text
      // lives in `.value` not `.children`.
      const text = child.value ?? "";
      if (text.length > 0) {
        runs.push({ text, marks: [...marks, { type: "code" }] });
      }
      continue;
    }
    const next: Mark[] = [...marks];
    if (child.type === "link") {
      const href = child.url ?? "";
      // T-7-17 / T-8-02: only http(s)/mailto hrefs become LinkMark; others
      // are demoted to plain text (the run recurses without a link mark). The
      // schema's linkableUrl refinement re-validates at ArticleSchema.parse.
      if (/^(https?:|mailto:)/i.test(href)) {
        const title = child.title ?? undefined;
        next.push(title ? { type: "link", href, title } : { type: "link", href });
      }
    } else if (child.type === "strong") {
      next.push({ type: "strong" });
    } else if (child.type === "emphasis") {
      next.push({ type: "em" });
    }
    // For all other inline types (image, html inline, etc.) recurse without a
    // new mark — the content is carried as text children of the node, or
    // dropped if the node has no inline-runnable children.
    runs.push(...extractInlineMdast(child, next));
  }
  return runs;
}

/** Collapse leading/trailing whitespace-only runs; merge adjacent identical-
 * mark runs. Byte-faithful with htmlToBlocks.ts L159-181 (Pitfall 8-1 — a
 * drift here silently orphans every annotation anchor). */
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

// ── Block mapping (exhaustive if-chain — Pattern F; no `default:` clause) ────
/** Walk one top-level mdast node and emit 0..N Block nodes. Container kinds
 * (blockquote, listItem) recurse via flatMap so nested content composes
 * cleanly. Mirrors `visit()` in htmlToBlocks.ts L272-366. */
function visit(node: MdastNode): Block[] {
  // yaml front-matter is handled by the top-level walker (does NOT emit a
  // Block). Defensive guard — if a yaml node ever reaches visit(), emit
  // nothing rather than a misleading block.
  if (node.type === "yaml") return [];

  if (node.type === "heading") {
    const depth = node.depth ?? 1;
    // Clamp to 1..6 — schema's HeadingBlock.level union refuses anything
    // outside, and mdast depth is already 1..6 per CommonMark, but the guard
    // keeps the level typed as the schema's literal union.
    const level = Math.max(1, Math.min(6, depth)) as 1 | 2 | 3 | 4 | 5 | 6;
    const content = tidyRuns(extractInlineMdast(node, []));
    return content.length ? [{ kind: "heading", level, content }] : [];
  }

  if (node.type === "paragraph") {
    // Block-level standalone image: a paragraph whose only child is an image
    // → FigureBlock (mirrors htmlToBlocks figure handling; the markdown spec
    // has no native figure syntax, so this is the canonical promotion path).
    const onlyChild = (node.children ?? [])[0];
    const isStandaloneImage =
      (node.children ?? []).length === 1 && onlyChild && onlyChild.type === "image";
    if (isStandaloneImage && onlyChild) {
      return figureFromImage(onlyChild);
    }
    const content = tidyRuns(extractInlineMdast(node, []));
    return content.length ? [{ kind: "paragraph", content }] : [];
  }

  if (node.type === "blockquote") {
    const children = (node.children ?? []).flatMap((c) => visit(c));
    if (children.length) return [{ kind: "blockquote", children }];
    // Fallback: empty blockquote → nothing. Mirrors htmlToBlocks L312-315.
    return [];
  }

  if (node.type === "list") {
    const ordered = node.ordered === true;
    const items: { content: Block[] }[] = [];
    for (const item of node.children ?? []) {
      if (item.type !== "listItem") continue;
      // listItem.children is typically [paragraph, ...]; walk each as a block.
      const itemContent = (item.children ?? []).flatMap((c) => visit(c));
      if (itemContent.length) items.push({ content: itemContent });
    }
    if (!items.length) return [];
    if (!ordered) return [{ kind: "bulleted-list", items }];
    const start = typeof node.start === "number" && node.start > 0 ? node.start : 1;
    return [{ kind: "numbered-list", items, start }];
  }

  if (node.type === "code") {
    const source = node.value ?? "";
    if (!source.trim().length) return [];
    const lang = typeof node.lang === "string" && node.lang.length > 0
      ? node.lang.toLowerCase()
      : undefined;
    return [lang ? { kind: "code-block", source, language: lang } : { kind: "code-block", source }];
  }

  if (node.type === "thematicBreak") {
    // Decorative; no Block kind in the schema (mirrors htmlToBlocks hr case).
    return [];
  }

  if (node.type === "html") {
    // Pitfall 8-2 — raw HTML block: emit a ParagraphBlock whose inline run
    // text is the literal `node.value` string. The string is INERT TEXT — it
    // never re-enters an HTML parser. React escapes text children on render.
    // The doc model IS the security boundary (ING-07).
    const text = node.value ?? "";
    if (!text.length) return [];
    return [{ kind: "paragraph", content: [{ text, marks: [] }] }];
  }

  // image at top level (rare — mdast usually wraps in paragraph) → FigureBlock
  if (node.type === "image") {
    return figureFromImage(node);
  }

  // Catch-all (Pattern F — no `default:` clause; the unsupported branch IS
  // the catch-all). Any mdast node type not enumerated above becomes an
  // honest DOC-06 disclosure.
  return [{
    kind: "unsupported",
    originalKind: node.type,
    plainDescription: `A ${node.type} element from the original document that the reader could not render.`,
  }];
}

/** Build a FigureBlock from an mdast image node; UnsupportedBlock if src is
 * not a valid http(s) URL (T-8-02 — mirrors htmlToBlocks L223-231 link/image
 * scheme discipline; ArticleSchema.httpUrl re-validates at parse time). */
function figureFromImage(node: MdastNode): Block[] {
  const src = node.url ?? "";
  if (/^https?:/i.test(src)) {
    const alt = node.alt ?? "";
    return [{ kind: "figure", alt, src, caption: [] }];
  }
  return [{
    kind: "unsupported",
    originalKind: "image",
    plainDescription: "An image whose source could not be normalized to a valid URL.",
  }];
}

// ── Public adapter shape (identical to ExtractAndNormalizeResult) ────────────
/** MarkdownToBlocksResult — byte-identical shape to
 * `server/htmlToBlocks.ts` `ExtractAndNormalizeResult` (L462-464). The
 * orchestrator destructures both with the same code. */
export interface MarkdownToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
  isReaderable: boolean;
}

/**
 * markdownToBlocks — the strict-CommonMark → Block tree adapter. Pure function
 * (no I/O); safe to call concurrently. Returns the same shape as
 * `extractAndNormalize` so `server/ingest.ts` dispatches both identically.
 *
 * Front-matter handling (D8-17): a leading `---\ntitle: T\nauthor: A\ndate: D\n---`
 * block is parsed via strict YAML 1.2 and merged into `provenancePartial`.
 * Only `title` / `author` / `date` string fields are carried; non-string
 * fields are dropped. `date` becomes an ISO-8601 string via
 * `new Date(date).toISOString()` — the schema's `.datetime()` refinement
 * re-validates at ArticleSchema.parse.
 *
 * The filename → title fallback chain (D8-17) runs in `server/ingest.ts`
 * (Task 2), not here — this adapter is filename-agnostic.
 */
export async function markdownToBlocks(md: string): Promise<MarkdownToBlocksResult> {
  const tree = processor.parse(md);

  const blocks: Block[] = [];
  const provenancePartial: ProvenancePartial = {};

  for (const node of tree.children as unknown as MdastNode[]) {
    // yaml front-matter → provenancePartial (does NOT emit a Block).
    if (node.type === "yaml") {
      mergeYamlFrontMatter(node.value ?? "", provenancePartial);
      continue;
    }
    blocks.push(...visit(node));
  }

  return {
    blocks,
    footnotes: [], // strict CommonMark has no footnote syntax (RESEARCH §Pattern 1 L319)
    lang: "en", // markdown carries no lang attribute (mirrors htmlToBlocks detectLang default)
    provenancePartial,
    isReaderable: blocks.length >= 3, // mirrors deriveConfidence heuristic; planner-tunable
  };
}

/** Parse a YAML front-matter block and merge title/author/date string fields
 * into `provenancePartial` (D8-17). Non-string fields are dropped. `date` is
 * converted to ISO-8601 via `new Date(date).toISOString()`; if the parse
 * throws (invalid date) the field is dropped. Strict YAML 1.2 mitigates
 * T-8-03 (billion-laughs / type coercion — the `yaml` package uses the
 * safe-schema by default; no implicit type coercion). */
function mergeYamlFrontMatter(yamlText: string, out: ProvenancePartial): void {
  let meta: unknown;
  try {
    meta = parseYaml(yamlText);
  } catch {
    // Invalid YAML → drop the front-matter silently; the title fallback chain
    // in ingest.ts picks up filename → neutral string.
    return;
  }
  if (typeof meta !== "object" || meta === null) return;
  const record = meta as Record<string, unknown>;
  if (typeof record.title === "string" && record.title.length > 0) {
    out.title = record.title;
  }
  if (typeof record.author === "string" && record.author.length > 0) {
    out.author = record.author;
  }
  if (typeof record.date === "string" && record.date.length > 0) {
    try {
      out.publishedAt = new Date(record.date).toISOString();
    } catch {
      /* invalid date string — drop the field */
    }
  }
}

/**
 * stripMarkdownExtension — pure string-only helper that strips a trailing
 * `.md` or `.markdown` extension (case-insensitive). Implements the D8-17
 * filename-fallback channel that `server/ingest.ts` consumes when deriving a
 * title from the uploaded filename (front-matter absent). The File API
 * returns just the filename (no leading path), so this helper does NO
 * path-basename logic — it operates on the raw string the client passes.
 *
 * Examples (mirrored in the unit suite):
 *   stripMarkdownExtension("essay.md")         === "essay"
 *   stripMarkdownExtension("essay.markdown")   === "essay"
 *   stripMarkdownExtension("Essay.MD")         === "Essay"
 *   stripMarkdownExtension("no-extension")     === "no-extension"
 *   stripMarkdownExtension("archive.post.md")  === "archive.post"
 */
export function stripMarkdownExtension(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, "");
}

// Re-export SCHEMA_KINDS for the unit suite (single source of truth).
export { SCHEMA_KINDS };
