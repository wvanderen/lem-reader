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

/** Phase 20 (D20-12) — the local-asset reference arm of FigureBlock.src.
 * `asset:img-<12 lowercase hex>`: the img- prefix is the D7-07 shortHash
 * locality precedent; the regex-locked shape means the union can never
 * smuggle a javascript:/data: URI through this arm (Pitfall 5 discipline
 * survives at parse time). Exported for the asset-id construction contract
 * (server/fetchImageAsset.ts) and renderer discrimination. */
export const assetRef = z.string().regex(/^asset:img-[a-z0-9]{12}$/);

/** Phase 20 (20-RESEARCH Pattern 2) — the three figure states, all ONE block
 * kind (D20-06 — no new block kinds):
 *   - legacy row:  src = remote httpUrl (hydration-only; the renderer NEVER
 *     fetches it — IMG-03 for pre-v2.1 articles)
 *   - accepted:    src = asset:img-… (+ optional originalSrc/width/height)
 *   - refused:     src omitted (alt + caption render with the placeholder)
 * `width`/`height` are the D20-13 orientation-corrected intrinsic pixels the
 * pagination reserved box consumes; `originalSrc` is provenance/diagnostic
 * (D20-12) — where the bytes came from, never a fetch target. alt + caption
 * are byte-identical in every state (D-05 substrate; D19-01 caption marks). */
export const FigureBlock = z.object({
  kind: z.literal("figure"),
  alt: z.string(), // required for accessibility
  // D20-12 + D20-02: union has NO arm for data: URIs (one no-exceptions
  // media boundary, Pitfall 5) and no arm for javascript:/file:/vbscript:.
  src: z.union([httpUrl, assetRef]).optional(), // refused figures omit src
  originalSrc: httpUrl.optional(), // provenance only (D20-12)
  width: z.number().int().min(1).optional(), // D20-13 intrinsic px
  height: z.number().int().min(1).optional(), // D20-13 intrinsic px
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
  "youtube", // Issue #39 — transcript-as-article (InnerTube captions via server/youtubeTranscript.ts)
]);
export type ArticleSource = z.infer<typeof ArticleSourceSchema>;

// ── Issue #39 (decision #26) — transcript block-keyed timing metadata ────────

/** YOUTUBE_VIDEO_ID_REGEX — the canonical 11-character YouTube video id
 * alphabet (A-Za-z0-9_-). Lives HERE (not in src/ingestion/youtube.ts, which
 * re-exports it) because TranscriptMetaSchema below validates videoId with it
 * and the /src→ingestion import direction is forbidden — ingestion imports
 * content, never the reverse (the httpUrl single-source-of-truth precedent
 * above). Server/youtubeTranscript.ts keeps consuming it via the re-export. */
export const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/** BCP47_LANGUAGE_TAG_REGEX — a pragmatic BCP-47 language-tag shape:
 * language subtag (2-3 alpha), optional script (4 alpha), optional region
 * (2 alpha or 3 digits — "en", "pt-BR", "zh-Hans", "zh-Hant-TW", "es-419"),
 * optional variant subtags (5-8 alphanumerics). Deliberately NOT the full
 * RFC 5646 grammar (grandfathered and private-use primary subtags excluded)
 * — the boundary's job is refusing junk strings, not certifying compliance.
 * Decision #26: captionLanguage carries the chosen track's FULL code here,
 * so it is validated as a language tag, not merely min(1). */
export const BCP47_LANGUAGE_TAG_REGEX =
  /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-(?:[A-Za-z]{2}|\d{3}))?(-[A-Za-z0-9]{5,8})*$/;

/** TranscriptSegmentAnchorSchema — ONE block-keyed timestamp: `blockIndex`
 * indexes the article's persisted `blocks` array (stable per revision — the
 * same stability the pagination annotations depend on; any future change that
 * re-derives blocks must re-derive `segments` with them), `startMs` is the
 * block's start time. START-only granularity (decision #26): a block's end
 * time is derivable from the next mapped block's start (the last ends at
 * `durationSeconds`). Timestamps are metadata — NEVER rendered, never part of
 * normalizeText — so selectors, highlights, and reading position are
 * untouched. */
export const TranscriptSegmentAnchorSchema = z.object({
  blockIndex: z.number().int().min(0),
  startMs: z.number().int().min(0),
});
export type TranscriptSegmentAnchor = z.infer<typeof TranscriptSegmentAnchorSchema>;

/** TranscriptMetaSchema — the cohesive optional `ingestionMeta.transcript`
 * object (decision #26). Block-keyed metadata on the additive bag, NOT new
 * block fields: the block unions stay untouched (D20-06 — no new block
 * kinds). `captionSource` distinguishes human tracks from auto-generated ASR
 * (which forces `extractionConfidence: "low"` — never a silent upgrade to
 * trusted); "pasted" marks a transcript the reader pasted manually (the
 * youtube-bot-check fallback) — it ALSO forces "low" (unverified provenance).
 * `captionLanguage` is the chosen track's full BCP-47 code (the article's
 * `lang` carries its base language); "und" is the honest value when the
 * paste's language is unknowable. Nothing here is Dexie-indexed — the
 * bookId/chapterIndex additive precedent (no schema bump). */
export const TranscriptMetaSchema = z.object({
  videoId: z.string().regex(YOUTUBE_VIDEO_ID_REGEX),
  durationSeconds: z.number().int().min(0),
  captionSource: z.enum(["manual", "asr", "pasted"]),
  captionLanguage: z.string().regex(BCP47_LANGUAGE_TAG_REGEX), // decision #26: BCP-47, validated at the boundary
  segments: z.array(TranscriptSegmentAnchorSchema),
});
export type TranscriptMeta = z.infer<typeof TranscriptMetaSchema>;

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
  // Issue #39 (decision #26) — block-keyed transcript timing for youtube
  // articles. Additive-optional (Pitfall 9 — every non-youtube row omits the
  // field and hydrates to `undefined`, the bookId/chapterIndex mechanism
  // above); timestamps live HERE, never in blocks, never rendered.
  transcript: TranscriptMetaSchema.optional(),
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
  // Phase 17 (META-01..04, D17-12/D17-04) — reader-owned display overrides.
  // Additive-optional so existing rows parse unchanged (Pitfall 9 hydration,
  // the same mechanism as ingestionMeta above + tags); overrides travel
  // INSIDE the article record (D17-12), never a separate table or bundle
  // block. min(1) makes the empty-string override UNREPRESENTABLE (D17-04):
  // no override can ever produce an untitled article (canonical
  // provenance.title is min(1)), and an empty author field means
  // no-author-override, not an empty-string override.
  readerTitle: z.string().min(1).optional(),
  readerAuthor: z.string().min(1).optional(),
  // Reader-owned display overrides for the provenance date and source link
  // (the readerTitle/readerAuthor mechanism extended: same additive-optional
  // Pitfall 9 hydration, same min-guard discipline — a blank publishedAt or
  // sourceUrl is unrepresentable, and clearing an override means the key is
  // omitted from the whole-row put). readerPublishedAt stays ISO datetime so
  // every consumer can feed it to the shared formatters unchanged; the edit
  // dialog converts a date-only input to UTC-noon ISO (the reader knows the
  // day, not the clock time). readerSourceUrl is httpUrl like its canonical
  // mirror — it corrects the "Originally published at {domain}" link only.
  readerPublishedAt: z.string().datetime().optional(),
  readerSourceUrl: httpUrl.optional(),
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
export const ReaderSettingsObjectSchema = z.object({
  // STATE-04 migration hook: Phase 4 (Plan 04-02, D4-12) bumped the canonical
  // write version from 1 → 2 when readingMode was added. Issue #40 bumps the
  // canonical write version 2 → 3 when the read-aloud preferences (voice +
  // rate, below) were added. The union accepts ALL THREE literals so that an
  // existing v1 row (no readingMode field) and a v2 row (no voice/rate
  // fields) hydrate via the .default()s below on read — Pitfall 9 (NO Dexie
  // store change; the settings store is key-value, Dexie is opaque to the
  // value shape). v4 and above forward-reject (V5 boundary discipline
  // preserved).
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([z.literal(16), z.literal(18), z.literal(20), z.literal(22), z.literal(24)]),
  // D21-01/D21-02 (POLISH-09) + issue #18 (D22-01): the union is the
  // uniform-6 ladder [40..88] mirroring MEASURE_STEPS in
  // src/settings/tokens.ts (default stays 64). The pre-#18 maximum 72 is
  // still NOT a literal: a stored legacy-72 value is mapped calmly to the
  // nearest lower step (70) PRE-parse by clampLegacyMeasure at every
  // settings-entry seam (D21-03 — settingsStore / settingsMirror / the
  // import preferences block); it never widens this union (T-21-02), and
  // every other out-of-range value still fails parse → STATE-04 corrupt
  // routing.
  measure: z.union([
    z.literal(40),
    z.literal(46),
    z.literal(52),
    z.literal(58),
    z.literal(64),
    z.literal(70),
    z.literal(76),
    z.literal(82),
    z.literal(88),
  ]),
  spacing: z.enum(["compact", "comfortable", "spacious"]),
  // Issue #86 (decision #73) — the enum widens ADDITIVELY with "custom" (no
  // schemaVersion bump; the readingMode/voice .default() hydration
  // discipline: a v3 row parses unchanged). "custom" without a valid
  // customTheme fails the superRefine below → the existing honest corrupt
  // routing — never a silent fallback to a preset.
  theme: z.enum(["sepia", "light", "dark", "custom"]),
  // Issue #86 (decision #73) — the ONE custom theme (no names, no library):
  // baseTheme names the preset it was seeded from / resets to, and the FIVE
  // reader-editable tokens. Everything else in the palette is DERIVED at
  // apply time (src/settings/customTheme.ts) and never stored. Additive
  // optional: records without the field parse unchanged; hex strings are
  // strict 6-digit so derivation math and round-trips stay exact.
  customTheme: z
    .object({
      baseTheme: z.enum(["sepia", "light", "dark"]),
      tokens: z.object({
        surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        surfaceRaised: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        hairline: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    })
    .optional(),
  // Additive preference: older records omit this and retain instant turns.
  animatePageTurns: z.boolean().optional(),
  // D4-12 — readingMode preference. PROJECT.md: "Pagination is the distinctive
  // default experience, but it is not mandatory." .default("paginated") is the
  // value-shape migration mechanism: a v1 row lacking this field parses with
  // the default on read (Pitfall 9 — no data wipe, no migration script).
  readingMode: z.enum(["paginated", "scrolling"]).default("paginated"),
  // Issue #40 — read-aloud preferences (the v2 → v3 bump). Both are applied
  // to playback by the read-aloud engine; the Reading-settings controls
  // arrived with the completion ticket (issue #43).
  //   voice: the selected SpeechSynthesisVoice.voiceURI. Optional by
  //     contract — undefined means "the platform default voice" (never a
  //     lie: a stale URI for an uninstalled voice resolves to the default at
  //     play time, see src/readaloud/webSpeech.ts).
  //   rate: the SpeechSynthesisUtterance.rate multiplier. The Web Speech
  //     spec allows 0.1–10 but engines may constrain further; the acceptance
  //     protocol (O8) sets the control band at roughly 0.5–3, which the
  //     stored contract mirrors exactly ([0.5, 3], RATE_STEPS in
  //     src/settings/tokens.ts). Engines that stall at high rates surface
  //     through the session probe + the stall watchdog as calm, honest
  //     refusals — never a fake "playing" state (spike 0009 F4). .default(1)
  //     hydrates v1/v2 rows (Pitfall 9, the readingMode mechanism above).
  voice: z.string().min(1).optional(),
  rate: z.number().min(0.5).max(3).default(1),
});

// Issue #86 (decision #73) — the cross-field rule: theme "custom" REQUIRES a
// valid customTheme (the object schema above already rejects invalid hex /
// base themes). A "custom" row without one is treated as corrupt at every
// read seam (settingsStore / settingsMirror / the bundle's preferences
// block) — the honest routing, never a silent preset fallback. The wrap is
// ZodEffects: every existing import site safeParses THIS name (the object
// schema below stays exported only for future shape consumers).
export const ReaderSettingsSchema = ReaderSettingsObjectSchema.superRefine((s, ctx) => {
  if (s.theme === "custom" && s.customTheme === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["customTheme"],
      message: 'theme "custom" requires a valid customTheme record',
    });
  }
});
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;
export type CustomTheme = NonNullable<ReaderSettings["customTheme"]>;
export type CustomThemeTokens = CustomTheme["tokens"];

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

// ── Reading sessions (milestone "reading history & stats" — issue #34) ──────
// ONE append-only row per visit (decision #24). History accrues only while
// recorded, so recording ships ahead of any stats UI. startOffset/endOffset
// are canonical grapheme offsets into normalizeText(article) (the D-05
// substrate — never page numbers); activeSeconds is idle-capped active time
// (the ReadingSessionRecorder accumulator). The row is keyed by a per-visit
// uuid primary key: a visit's row is UPSERTED as its totals refine (flush
// discipline) but never duplicated and never deleted except by the article
// cascade (D5-12 extension — a session's lifecycle is exactly its article's,
// the D20-15 asset precedent).
export const ReadingSessionRecordSchema = z.object({
  schemaVersion: z.literal(1), // STATE-04 migration hook
  id: z.string(), // crypto.randomUUID() at session begin — the visit identity
  articleId: z.string().regex(/^[a-z0-9-]+$/), // reuse LocationRecord regex (D-06)
  startedAt: z.string().datetime(), // ISO-8601 — when the visit began
  endedAt: z.string().datetime(), // ISO-8601 — last flushed moment of the visit
  startOffset: z.number().int().min(0), // D-05 offset where the visit started
  endOffset: z.number().int().min(0), // D-05 offset where the visit last stood
  activeSeconds: z.number().int().min(0), // idle-capped active time (floored)
});
export type ReadingSessionRecord = z.infer<typeof ReadingSessionRecordSchema>;
