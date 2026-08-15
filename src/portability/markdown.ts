// src/portability/markdown.ts
// Fixed highlights-only Markdown template renderer — Phase 9 Plan 09-02
// (PORT-03 pure side). Locked decisions:
//   - D9-06: the SAME template serves per-article and library-wide export
//   - D9-07: fixed built-in template (NOT reader-editable) over the locked
//     variable contract (title/author/source/highlights[]/notes[])
//   - D9-08: highlight rendering = blockquote + citation line + optional
//     Note line
//   - D9-09: honest inclusion — ambiguous and orphan highlights are NEVER
//     silently dropped (ANNO-07 extended to the external-tool surface); they
//     render with italic *[approx]* / *[orphan]* markers and a footer reports
//     honest counts
//
// Pure module — no DOM, no I/O, no React. Every entry renders from its STORED
// highlight.quote.exact (the captured passage IS the text), so an orphan
// (article absent or quote unresolvable) still carries the reader's highlight
// and its note out to the external tool.
//
// Tri-state status comes from the SHIPPED re-anchoring machinery:
// resolveQuoteSelector is imported from src/content/normalizeText (the
// contract re-export site of src/annotations/resolution.ts) —
// REUSE-DO-NOT-FORK. Any divergence would shift every anchor.
import { resolveQuoteSelector } from "../content/normalizeText";
import type { CanonicalArticle } from "../content/types";
import type {
  HighlightRecord,
  LocationRecord,
  NoteRecord,
} from "../content/schema";

// ── Types ────────────────────────────────────────────────────────────────────

/** One highlight plus its optional note, pre-resolved to its honest tri-state
 * status (D5-02/ANNO-07 vocabulary: confident | ambiguous | orphan). */
export type HighlightEntry = {
  highlight: HighlightRecord;
  note?: NoteRecord;
  status: "confident" | "ambiguous" | "orphan";
};

/** One article's slice of the library-wide export (D9-06: sections build the
 * combined `## {article title}` file; `orderSectionsByRecency` orders them). */
export type HighlightSection = {
  article: CanonicalArticle;
  entries: HighlightEntry[];
};

// ── Line escaping (T-9-05 — markdown structure-injection guard) ─────────────

/** Leading run of structure-breaking symbols (heading/bullet/quote markers). */
const LEADING_SYMBOL_RUN = /^[-+*>#]+/;
/** Leading ordered-list marker: a digit run followed by a period. */
const LEADING_ORDERED_MARKER = /^(\d+)\./;

/**
 * escapeMarkdownLine — backslash-escape ONLY a leading run of the
 * structure-breaking characters (hash, dash, plus, asterisk, greater-than, or
 * a digit-run followed by a period) at line start, so stored highlight/note
 * text cannot forge headings, lists, or nested blockquotes inside the export.
 * Mid-text punctuation is deliberately untouched — over-escaping makes the
 * quote ugly and harms the calm-reading ethos (Obsidian/Notion tolerate
 * mid-text punctuation fine).
 *
 * CommonMark note: backslash escapes apply only before ASCII punctuation, so
 * for a leading `1974.` the PERIOD is escaped (`1974\.`) — escaping a digit
 * would leak a literal backslash into the reader's text.
 */
export function escapeMarkdownLine(text: string): string {
  const ordered = LEADING_ORDERED_MARKER.exec(text);
  if (ordered) {
    const digits = ordered[1] ?? "";
    return `${digits}\\.${text.slice(ordered[0].length)}`;
  }
  const symbols = LEADING_SYMBOL_RUN.exec(text);
  if (symbols) {
    // Every character of the run is ASCII punctuation, so per-character
    // backslash escapes are CommonMark-safe (each backslash is consumed).
    const run = symbols[0];
    const escaped = Array.from(run, (ch) => `\\${ch}`).join("");
    return `${escaped}${text.slice(run.length)}`;
  }
  return text;
}

// ── Live tri-state collection (reuses the shipped resolver) ─────────────────

/**
 * collectHighlightEntries — join highlights with their notes and resolve each
 * highlight's honest tri-state status LIVE against the provided articles.
 *
 * - a highlight whose articleId maps to a provided article gets the real
 *   `resolveQuoteSelector(article, highlight.quote, highlight.position)`
 *   verdict: any TextPositionSelector return → "confident"; the string
 *   results map through unchanged;
 * - a highlight whose article is absent (removed, corrupt-dropped on read, or
 *   fixture-version skew) resolves to "orphan" WITHOUT being dropped — the
 *   renderer still emits its stored quote.exact and note (D9-09);
 * - notes attach by highlightId; a note with no matching highlight is skipped
 *   (the never-drop rule applies to notes OF highlights — a note whose
 *   highlight is gone cannot render as a standalone blockquote).
 */
export function collectHighlightEntries(
  articles: CanonicalArticle[],
  highlights: HighlightRecord[],
  notes: NoteRecord[],
): HighlightEntry[] {
  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  const noteByHighlightId = new Map(
    notes.map((n) => [n.highlightId, n] as const),
  );
  const entries: HighlightEntry[] = [];
  for (const highlight of highlights) {
    const note = noteByHighlightId.get(highlight.id);
    const article = articleById.get(highlight.articleId);
    let status: HighlightEntry["status"];
    if (!article) {
      status = "orphan";
    } else {
      const resolved = resolveQuoteSelector(
        article,
        highlight.quote,
        highlight.position,
      );
      status =
        resolved === "ambiguous" || resolved === "orphan"
          ? resolved
          : "confident";
    }
    entries.push(note ? { highlight, note, status } : { highlight, status });
  }
  return entries;
}

// ── The fixed template (D9-08 shape; exact punctuation locked by Plan 09-02) ─

/** Italic approx marker prefixed to an ambiguous entry's quote line (D9-09). */
const APPROX_MARKER = "*[approx]* ";
/** Orphan marker prefixed to an orphan entry's quote line (D9-09). */
const ORPHAN_MARKER = "*[orphan]* ";

function markerFor(status: HighlightEntry["status"]): string {
  if (status === "ambiguous") return APPROX_MARKER;
  if (status === "orphan") return ORPHAN_MARKER;
  return "";
}

/** The citation line: author + italic title, plus a source link when the
 * article has one. The author (and its comma) is omitted when absent. */
function citationLine(article: CanonicalArticle): string {
  const author = article.provenance.author;
  const core = author
    ? `${author}, *${article.provenance.title}*`
    : `*${article.provenance.title}*`;
  const source = article.provenance.sourceUrl
    ? ` ([source](${article.provenance.sourceUrl}))`
    : "";
  return `> — ${core}${source}`;
}

/** One entry's block: quote line, citation line, optional Note line. */
function blockLines(article: CanonicalArticle, e: HighlightEntry): string[] {
  const lines = [
    `> ${markerFor(e.status)}${escapeMarkdownLine(e.highlight.quote.exact)}`,
    citationLine(article),
  ];
  if (e.note) {
    lines.push(`> Note: ${escapeMarkdownLine(e.note.text)}`);
  }
  return lines;
}

/** The honest-counts fragment shared by per-article and totals footers. */
function countsFragment(entries: readonly HighlightEntry[]): string {
  const ambiguous = entries.filter((e) => e.status === "ambiguous").length;
  const orphan = entries.filter((e) => e.status === "orphan").length;
  return `${entries.length} highlights · ${ambiguous} ambiguous · ${orphan} orphan`;
}

/**
 * renderArticleHighlights — the per-article file (D9-06): one level-1 heading
 * naming the article, one block per entry (blockquote + citation + optional
 * Note), and a final exact-counts footer. Every provided entry renders —
 * including ambiguous and orphan entries (D9-09 never-drop).
 */
export function renderArticleHighlights(
  article: CanonicalArticle,
  entries: readonly HighlightEntry[],
): string {
  const lines: string[] = [`# Highlights — ${article.provenance.title}`];
  for (const e of entries) {
    lines.push("", ...blockLines(article, e));
  }
  lines.push("", `_${countsFragment(entries)}_`);
  return lines.join("\n");
}

/**
 * renderLibraryHighlights — the combined library-wide file (D9-06): one level-1
 * "Highlights" heading, one `## {article title}` section per section (same
 * blocks + per-section footer), and a final totals footer.
 */
export function renderLibraryHighlights(
  sections: readonly HighlightSection[],
): string {
  const lines: string[] = ["# Highlights"];
  for (const section of sections) {
    lines.push("", `## ${section.article.provenance.title}`);
    for (const e of section.entries) {
      lines.push("", ...blockLines(section.article, e));
    }
    lines.push("", `_${countsFragment(section.entries)}_`);
  }
  const all = sections.flatMap((s) => s.entries);
  lines.push("", `_Totals: ${countsFragment(all)}_`);
  return lines.join("\n");
}

// ── Section ordering (library-wide reading-recency order) ───────────────────

/**
 * orderSectionsByRecency — ordered COPY of sections for the combined file:
 * sections whose article has a location row (matched by articleId across the
 * provided LocationRecords — any revision) sort by savedAt descending (most
 * recently read first, latest row winning when several revisions exist);
 * sections without locations follow, sorted by provenance.title ascending
 * (localeCompare). The input array is not mutated.
 */
export function orderSectionsByRecency(
  sections: readonly HighlightSection[],
  locations: readonly LocationRecord[],
): HighlightSection[] {
  const latestByArticle = new Map<string, string>();
  for (const loc of locations) {
    const prev = latestByArticle.get(loc.articleId);
    // ISO-8601 strings compare lexicographically == chronologically.
    if (prev === undefined || loc.savedAt > prev) {
      latestByArticle.set(loc.articleId, loc.savedAt);
    }
  }
  const located = sections
    .filter((s) => latestByArticle.has(s.article.id))
    .sort((a, b) =>
      (latestByArticle.get(b.article.id) ?? "").localeCompare(
        latestByArticle.get(a.article.id) ?? "",
      ),
    );
  const unlocated = sections
    .filter((s) => !latestByArticle.has(s.article.id))
    .sort((a, b) =>
      a.article.provenance.title.localeCompare(b.article.provenance.title),
    );
  return [...located, ...unlocated];
}
