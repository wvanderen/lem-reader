// src/content/schema.ts
// Frozen Zod document model for Lem Reader (D-04 inline marks, D-06 identity,
// D-05 coordinate substrate). Lifted from 01-RESEARCH.md §Code Examples
// "Normalized Block Schema" with the locked design choices enforced.
//
// Security boundaries (Pitfall 5): every URL field carries a scheme allow-list
// refinement so javascript:/data:/file:/vbscript: hrefs are rejected at parse
// time, before they can reach the renderer.
//
// Recursive types (Pitfall 7): BlockquoteBlock.children and ListItem.content
// reference Block recursively. Zod's getter form handles runtime laziness, but
// TS cannot infer a self-referential const without a type annotation. We use
// the Zod-documented two-pass pattern: hand-write the recursive Block union,
// then annotate `BlockSchema: z.ZodType<Block>`. The hand-written type mirrors
// the discriminatedUnion below and is validated by tests/unit/schema.test.ts.
import { z } from "zod";

// ── URL scheme allow-lists (Pitfall 5 — stored XSS defense at the boundary) ──

/** http/https/mailto — for clickable link hrefs (mailto is valid in articles). */
const linkableUrl = z
  .string()
  .url()
  .refine((u) => /^(https?|mailto):$/i.test(new URL(u).protocol), {
    message: "Only http, https, mailto schemes allowed",
  });

/** http/https only — for figure sources and provenance sourceUrl (no mailto/data).
 * Exported so `src/ingestion/types.ts` can reuse the SAME refinement (single
 * source of truth for the URL-safety refinement — the Phase 7 ingestion
 * envelope imports this rather than re-declaring it inline). */
export const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:$/i.test(new URL(u).protocol), {
    message: "Only http and https schemes allowed",
  });

// ── D-04: locked inline mark set (exactly 4 — link, code, strong, em) ────────

export const LinkMark = z.object({
  type: z.literal("link"),
  href: linkableUrl, // Security: scheme allow-list (Pitfall 5)
  title: z.string().optional(),
});
export const CodeMark = z.object({ type: z.literal("code") });
export const StrongMark = z.object({ type: z.literal("strong") });
export const EmMark = z.object({ type: z.literal("em") });
export const Mark = z.union([LinkMark, CodeMark, StrongMark, EmMark]);

export const InlineRun = z.object({
  text: z.string().min(1),
  marks: z.array(Mark).default([]),
});

// ── Block kinds — discriminated union (O(1) parse + clean TS narrowing) ─────

export const HeadingBlock = z.object({
  kind: z.literal("heading"),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]), // Pitfall 10 — heading-order guard at parse time
  content: z.array(InlineRun),
});

export const ParagraphBlock = z.object({
  kind: z.literal("paragraph"),
  content: z.array(InlineRun),
});

export const BulletedListBlock = z.object({
  kind: z.literal("bulleted-list"),
  items: z.array(
    z.object({
      // recursive: a list item contains blocks (getter form — Pitfall 7)
      get content() {
        return z.array(BlockSchema);
      },
    }),
  ),
});

export const NumberedListBlock = z.object({
  kind: z.literal("numbered-list"),
  items: z.array(
    z.object({
      get content() {
        return z.array(BlockSchema);
      },
    }),
  ),
  start: z.number().int().min(1).default(1),
});

export const FigureBlock = z.object({
  kind: z.literal("figure"),
  alt: z.string(), // required for accessibility
  src: httpUrl, // local /public or remote https — no data: URIs (Pitfall 5)
  caption: z.array(InlineRun).default([]),
});

export const CodeBlock = z.object({
  kind: z.literal("code-block"),
  language: z.string().optional(), // e.g. "ts", "py" — for future highlighting
  source: z.string(),
});

export const FootnoteReferenceBlock = z.object({
  kind: z.literal("footnote-reference"),
  footnoteId: z.string().regex(/^fn-\d+$/), // controlled id format (Pitfall 4)
  marker: z.string(), // visible text, e.g. "[1]"
});

export const UnsupportedBlock = z.object({
  kind: z.literal("unsupported"),
  originalKind: z.string(), // internal, for diagnostics
  plainDescription: z.string().min(1), // human-written, user-facing
});

// ── Recursive Block union (two-pass — Pitfall 7) ────────────────────────────
// Hand-written to give TS a concrete type for the self-referential fields
// (Blockquote.children, ListItem.content). The const below is annotated
// `: z.ZodType<Block>` so z.infer yields this precise union, not `unknown`.

type HeadingT = z.infer<typeof HeadingBlock>;
type ParagraphT = z.infer<typeof ParagraphBlock>;
type FigureT = z.infer<typeof FigureBlock>;
type CodeT = z.infer<typeof CodeBlock>;
type FootnoteRefT = z.infer<typeof FootnoteReferenceBlock>;
type UnsupportedT = z.infer<typeof UnsupportedBlock>;

export const BlockquoteBlock = z.object({
  kind: z.literal("blockquote"),
  // recursive: a blockquote contains blocks (getter form — Pitfall 7)
  get children() {
    return z.array(BlockSchema);
  },
});

export type Block =
  | HeadingT
  | ParagraphT
  | { kind: "blockquote"; children: Block[] }
  | { kind: "bulleted-list"; items: { content: Block[] }[] }
  | { kind: "numbered-list"; items: { content: Block[] }[]; start: number }
  | FigureT
  | CodeT
  | FootnoteRefT
  | UnsupportedT;

export const BlockSchema: z.ZodType<Block> = z.discriminatedUnion("kind", [
  HeadingBlock,
  ParagraphBlock,
  BlockquoteBlock,
  BulletedListBlock,
  NumberedListBlock,
  FigureBlock,
  CodeBlock,
  FootnoteReferenceBlock,
  UnsupportedBlock,
]);

// ── Footnote bodies — participate in the coordinate stream at the footnotes region ──

export const FootnoteBody = z.object({
  id: z.string().regex(/^fn-\d+$/), // Pitfall 4 — DOM clobbering guard
  content: z.array(InlineRun),
});

// ── Provenance ───────────────────────────────────────────────────────────────

export const Provenance = z.object({
  // D7-08 + Pitfall 9: sourceUrl is `.optional()` so paste-HTML articles
  // (ING-02) — which have no canonical source URL — can omit it. Existing v1.0
  // fixtures always supply it, so they parse identically (additive change,
  // source-compatible). The renderer's "open original" affordance hides when
  // sourceUrl is absent (07-06). originalHtmlHash still provides traceability
  // for paste-sourced articles.
  sourceUrl: httpUrl.optional(), // scheme-allow-listed when present (Pitfall 5)
  title: z.string().min(1),
  author: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  retrievedAt: z.string().datetime(),
  originalHtmlHash: z.string(), // SHA-256 of source HTML, for traceability
  license: z.string().optional(),
});

// ── Article ──────────────────────────────────────────────────────────────────

// ── Phase 7 ingestion metadata (D7-02, D7-08) ───────────────────────────────
// Additive sub-schemas introduced by Phase 7. Backward-compatible with v1.0
// fixtures by construction: ArticleSchema.ingestionMeta is `.optional()`, so a
// v1.0 fixture (which omits the field) hydrates to `undefined` on read — the
// Pitfall 9 `.optional()`/`.default()` migration mechanism mirroring
// ReaderSettingsSchema.readingMode at L233-237. The compositeLibraryRepository
// (07-06) synthesizes { source: "fixture" } for display only; the canonical
// v1.0 row never carries ingestionMeta.

/** ArticleSourceSchema — D7-08 + D8-15 + D8-16 origin discriminator. The enum
 * is CLOSED; future phases widen it additively ("pdf" Phase 11, "epub-chapter"
 * Phase 12). Phase 8 adds "markdown" (D8-16 — `.md` upload via
 * markdownToBlocks) and "html-upload" (D8-15 — `.html` file-upload reuses the
 * paste path but carries a distinct badge per D8-02). Both widenings are
 * anticipated by ARCHITECTURE.md L390 and are forward-compatible. */
export const ArticleSourceSchema = z.enum([
  "fixture",
  "url",
  "paste",
  "markdown", // Phase 8 — D8-16 (.md upload via markdownToBlocks)
  "html-upload", // Phase 8 — D8-15 (.html file-upload; paste textarea stays as "paste")
  "pdf", // Phase 11 — ING-04 (.pdf upload via pdfToBlocks)
  "epub-chapter", // Phase 12 — ING-05 (.epub upload via epubToBooks; one article per chapter, Option A)
]);
export type ArticleSource = z.infer<typeof ArticleSourceSchema>;

/** IngestionMetaSchema — derived per-article metadata written at ingest time.
 * Shape per 07-RESEARCH.md §IngestionMeta/ArticleSource Schema L566-574.
 * `extractionConfidence` carries only "high" | "low" — the "unsupported"
 * three-state outcome (ING-06) is refused at ingest (never reaches persistence);
 * the client sees it as the failure envelope reason `extraction-unsupported`. */
export const IngestionMetaSchema = z.object({
  source: ArticleSourceSchema,
  // D7-08 + D8-15: origin discriminator widens additively. "upload" covers
  // BOTH markdown + html-upload (both come from the file picker); the
  // `source` field carries the format distinction. Hides "open original"
  // for paste + upload (neither has a canonical sourceUrl).
  origin: z.enum(["url", "paste", "upload"]).optional(),
  sourceUrl: httpUrl.optional(), // D7-08: Provenance.sourceUrl mirror (present for url; absent for paste/upload)
  originalHtmlHash: z.string(), // SHA-256 of fetched/pasted/uploaded source bytes — traceability
  fetchedAt: z.string().datetime().optional(), // ISO-8601 (present for url; absent for paste/upload)
  extractionConfidence: z.enum(["high", "low"]), // the derived signal; "unsupported" never persists
  extractionWarnings: z.array(z.string()).default([]), // e.g. "3 unsupported blocks omitted"
  // Phase 12 (Plan 12-01 Task 2) — ARCHITECTURE L401-402: epub-chapter
  // articles carry their book + position within it. Additive-optional;
  // existing rows parse unchanged (absent fields — Pitfall 9 backward-compat,
  // the same mechanism as `source`-era widenings above).
  bookId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(), // FK → BookSchema.id (grouping reads key on this)
  chapterIndex: z.number().int().min(0).optional(), // position within BookSchema.chapterArticleIds (admitted order — D12-10/D12-11 numbering)
});
export type IngestionMeta = z.infer<typeof IngestionMetaSchema>;

export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // stable slug; never the source URL (D-06)
  revision: z.number().int().min(1), // monotonic (D-06)
  lang: z.string().min(2), // BCP-47, e.g. "en", "en-US", "ja" — drives Intl.Segmenter locale
  provenance: Provenance,
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
  // Phase 7 — additive. v1.0 fixtures omit this field and parse to `undefined`
  // (Pitfall 9 backward-compat). Ingester path (07-05) always supplies it.
  ingestionMeta: IngestionMetaSchema.optional(),
  // Phase 8 — D8-05..D8-08 + RESEARCH §Pattern 2: document tags denormalized
  // on the article row. Additive; v1.0 fixtures + Phase 7 rows omit the field
  // and hydrate to `[]` via `.default([])` (Pitfall 9 backward-compat — same
  // migration mechanism as `ingestionMeta` above + readingMode at L280).
  // Plan 02 builds the tag store + the `*tags` Dexie multi-entry index on top
  // of this field; Plan 01 only lands the schema field so Plan 02 is additive.
  tags: z.array(z.string().min(1)).default([]).optional(),
});

// Inferred types — also re-exported from types.ts. Schemas are the single
// source of truth (Zod-at-boundary); never hand-write a parallel type for
// non-recursive shapes. Block is hand-written above ONLY because Zod cannot
// infer a self-referential const without a type annotation (Pitfall 7).
export type CanonicalArticle = z.infer<typeof ArticleSchema>;
export type InlineRun = z.infer<typeof InlineRun>;

// ── Book (Phase 12 — ING-05, Option A: one article per chapter + thin record) ─

/** BookSchema — the thin book record grouping epub-chapter articles
 * (ARCHITECTURE Pattern 4; shape per 12-RESEARCH.md L565-577 lifted verbatim
 * PLUS two planner additions the sketch omitted: `tags` (D12-04 — tags live
 * on the Book record, mirroring the ArticleSchema.tags Phase 8 mechanism)
 * and `addedAt` (library default-sort + continue-strip ordering)).
 * `chapterArticleIds` is ORDERED — the book's own TOC per D12-06: "Chapter
 * N of M" numbering runs over this list, and `skippedChapterCount` is
 * disclosed additively (D12-11) rather than renumbering it. `source` is the
 * literal "epub-upload" (the only book-producing source in Phase 12). */
export const BookSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // `epub-<12hex>` — content-hash, dedupe-refuse (D7-07 precedent)
  title: z.string().min(1), // OPF dc:title (spec-REQUIRED; fallback filename)
  authors: z.array(z.string()).default([]), // dc:creator (repeatable; all kept)
  language: z.string().min(2), // OPF dc:language (spec-REQUIRED)
  chapterArticleIds: z.array(z.string().regex(/^[a-z0-9-]+$/)), // ordered — the book's TOC (D12-06)
  publisher: z.string().optional(), // dc:publisher
  publishedDate: z.string().optional(), // dc:date (raw OPF string; publisher formats vary — not datetime-refined)
  identifier: z.string().optional(), // dc:identifier (ISBN/UUID — traceability only)
  skippedChapterCount: z.number().int().min(0).default(0), // D12-11 disclosure derives from this
  source: z.literal("epub-upload"),
  originalFileHash: z.string(), // sha256 of the EPUB bytes
  tags: z.array(z.string().min(1)).default([]).optional(), // D12-04 — tags live on the Book record
  addedAt: z.string().datetime(), // library default-sort + continue-strip ordering stamp
});
export type Book = z.infer<typeof BookSchema>;

// ── Reader settings (Phase 2 — READ-02/03, STATE-02/04) ──────────────────────
// Single composite record under Dexie key "reader-prefs" (D2 discretion /
// 02-RESEARCH.md Pattern 3). Closed-set enums + literal schemaVersion so any
// persisted value outside the contract is rejected at the read boundary
// (T-02-01 — Tampering V5). applyTheme consumes the inferred type directly.
// No recursion here — Pitfall 7 (the two-pass recursive Block pattern above)
// does NOT apply.
export const ReaderSettingsSchema = z.object({
  // STATE-04 migration hook: Phase 4 (Plan 04-02, D4-12) bumped the canonical
  // write version from 1 → 2 when readingMode was added. The union accepts
  // BOTH literals so that an existing v1 row (no readingMode field) hydrates
  // readingMode via the .default() below on read — Pitfall 9 (NO Dexie store
  // change; the settings store is key-value, Dexie is opaque to the value
  // shape). v3 and above forward-reject (V5 boundary discipline preserved).
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([
    z.literal(16),
    z.literal(18),
    z.literal(20),
    z.literal(22),
    z.literal(24),
  ]),
  measure: z.union([
    z.literal(52),
    z.literal(58),
    z.literal(64),
    z.literal(72),
  ]),
  spacing: z.enum(["compact", "comfortable", "spacious"]),
  theme: z.enum(["sepia", "light", "dark"]),
  // D4-12 — readingMode preference. PROJECT.md: "Pagination is the distinctive
  // default experience, but it is not mandatory." .default("paginated") is the
  // value-shape migration mechanism: a v1 row lacking this field parses with
  // the default on read (Pitfall 9 — no data wipe, no migration script).
  readingMode: z.enum(["paginated", "scrolling"]).default("paginated"),
});
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;

// ── Reading location (Phase 2 — STATE-01, D-05 substrate, D-06 key) ──────────
// Persisted at the compound [articleId+revision] key. graphemeOffset is into
// normalizeText(article) (D-05). articleId + revision reuse the exact patterns
// from ArticleSchema above (D-06 stability contract — single source of truth).
export const LocationRecordSchema = z.object({
  schemaVersion: z.literal(1), // STATE-04 migration hook
  articleId: z.string().regex(/^[a-z0-9-]+$/), // matches ArticleSchema.id (D-06)
  revision: z.number().int().min(1), // D-06 monotonic
  graphemeOffset: z.number().int().min(0), // D-05 offset into normalizeText
  savedAt: z.string().datetime(), // ISO-8601 — used for last-write-wins tiebreak
});
export type LocationRecord = z.infer<typeof LocationRecordSchema>;

// ── Annotations (Phase 5 — ANNO-05/06/07, STATE-03/04) ──────────────────────
// W3C Web Annotation selectors over the D-05 grapheme substrate, persisted as
// part of a HighlightRecord. D5-03: persist BOTH position (O(1) primary anchor
// for the same-revision common case) AND quote (recovery substrate for the
// cross-revision re-anchoring path in D5-01). These schemas are the trust
// boundary between Dexie and runtime (STATE-04) — every row is validated on
// read. Note text is z.string() — NEVER HTML (Pitfall 8: React escapes text
// children by default; the react/no-danger ESLint rule forbids the raw-HTML
// injection prop; there is no URL field and no HTML parsing anywhere).

/** Grapheme offset range into normalizeText(article); start inclusive, end exclusive.
 * Mirrors the TextPositionSelector interface at normalizeText.ts L117-120. */
export const TextPositionSelectorSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .refine((s) => s.end > s.start, { message: "end must be > start" });

/** A TextQuote selector over the normalized grapheme text (prefix/exact/suffix).
 * Mirrors the TextQuoteSelector interface at normalizeText.ts L123-127. */
export const TextQuoteSelectorSchema = z.object({
  prefix: z.string(),
  exact: z.string().min(1),
  suffix: z.string(),
});

/** HighlightRecord — one durable highlight (D5-03 dual-selector persistence).
 * schemaVersion for STATE-04 migration; id is crypto.randomUUID() at the call
 * site (05-RESEARCH.md Open Question #2 — no collision with fn-N footnote ids). */
export const HighlightRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  articleId: z.string().regex(/^[a-z0-9-]+$/), // reuse LocationRecord regex (D-06)
  revision: z.number().int().min(1), // revision AT CREATION TIME (orphan detection)
  position: TextPositionSelectorSchema, // D5-03: grapheme range (primary anchor)
  quote: TextQuoteSelectorSchema, // D5-03: prefix/exact/suffix (recovery substrate)
  createdAt: z.string().datetime(), // ISO-8601
});
export type HighlightRecord = z.infer<typeof HighlightRecordSchema>;

/** NoteRecord — one note attached to a highlight (1:1 via highlightId).
 * text is z.string() (NEVER HTML — Pitfall 8). Empty string = no note
 * (the caller deletes or never creates the NoteRecord per D5-10). */
export const NoteRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  highlightId: z.string(), // FK → HighlightRecord.id
  text: z.string(), // reader-authored; React-escaped; never HTML-parsed (Pitfall 8)
  updatedAt: z.string().datetime(),
});
export type NoteRecord = z.infer<typeof NoteRecordSchema>;
