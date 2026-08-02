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

/** http/https only — for figure sources and provenance sourceUrl (no mailto/data). */
const httpUrl = z
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
  sourceUrl: httpUrl, // scheme-allow-listed (Pitfall 5)
  title: z.string().min(1),
  author: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  retrievedAt: z.string().datetime(),
  originalHtmlHash: z.string(), // SHA-256 of source HTML, for traceability
  license: z.string().optional(),
});

// ── Article ──────────────────────────────────────────────────────────────────

export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // stable slug; never the source URL (D-06)
  revision: z.number().int().min(1), // monotonic (D-06)
  lang: z.string().min(2), // BCP-47, e.g. "en", "en-US", "ja" — drives Intl.Segmenter locale
  provenance: Provenance,
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
});

// Inferred types — also re-exported from types.ts. Schemas are the single
// source of truth (Zod-at-boundary); never hand-write a parallel type for
// non-recursive shapes. Block is hand-written above ONLY because Zod cannot
// infer a self-referential const without a type annotation (Pitfall 7).
export type CanonicalArticle = z.infer<typeof ArticleSchema>;
export type InlineRun = z.infer<typeof InlineRun>;

// ── Reader settings (Phase 2 — READ-02/03, STATE-02/04) ──────────────────────
// Single composite record under Dexie key "reader-prefs" (D2 discretion /
// 02-RESEARCH.md Pattern 3). Closed-set enums + literal schemaVersion so any
// persisted value outside the contract is rejected at the read boundary
// (T-02-01 — Tampering V5). applyTheme consumes the inferred type directly.
// No recursion here — Pitfall 7 (the two-pass recursive Block pattern above)
// does NOT apply.
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(1), // STATE-04 migration hook
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
