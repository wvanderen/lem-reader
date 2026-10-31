// src/routes/review/reviewFilter.ts
// Plan 10-01 Task 1 — the pure review-list derivation for the annotation
// review panel (RECV-01, D10-09/D10-05/D10-08/D10-13). The `filterLibrary`
// pattern (src/ingestion/library/libraryFilter.ts) applied to the whole
// annotation library: join → classify → filter → group → sort, all in ONE
// pure function so the panel's data logic is unit-testable without Dexie,
// React, or a DOM (tests/unit/review-filter.test.ts).
//
// Locked decisions:
//   - D10-09: filtering/sorting is a PURE derivation — no Dexie, no React,
//     no IO in this module. Callers own loading (the LibraryView pattern).
//   - D10-05: never-drop — every annotation appears exactly once. An absent
//     article means status "orphan" with the row KEPT (orphanEntries tail,
//     the D9-09 markdown-export rule extended to the panel) — highlights
//     AND, since issue #210, article notes alike.
//   - D10-08: filters AND-compose (articleTag + annotationTag + articleId +
//     type + query + confidence); confidence "all" includes ambiguous and
//     orphan rows — tri-state is never silently filtered away. Confidence
//     composes across BOTH kinds: highlights carry the honest tri-state;
//     article notes carry the coarse confident/orphan pair (a note with no
//     article is an orphan, one with its article is confident — it was
//     never passage-resolved, so "ambiguous" cannot arise).
//   - D10-13: tri-state re-derivation runs through the SHIPPED
//     resolveQuoteSelectorInText (src/annotations/resolution.ts — the
//     canonical D5-02 core, REUSE-DO-NOT-FORK) with per-article memoized
//     clusters via the LIFTED MemoizedArticleText
//     (src/portability/conflicts.ts) — zero per-highlight recompute of
//     normalizeText/graphemeClusters (the Phase 9 conflicts pattern).
//
// Issue #210 — the review's second row kind:
//   - ArticleNote rows join the SAME derivation: one filter set, one sort
//     set, one orphan tail, no second pipeline (REUSE-DO-NOT-FORK). Entries
//     are a discriminated union on `kind`; every highlight-specific field
//     (quote, tri-state, resolved position) lives only on the highlight
//     variant so the compiler keeps the row renderers honest.
//   - TYPE filter ("all" | "highlights" | "article-notes") — AND-composed
//     like every other dimension; "all" is the default (article notes are
//     never hidden by default).
//   - SEARCH — the query haystack is the lowercase join of the row's
//     readable fields: the highlight's stored quote + its passage note +
//     its annotation tags; the article note's text + its annotation tags
//     (the library search's lowercase-substring discipline,
//     libraryFilter.ts D8-06).
//   - The former highlightTag dimension is the ANNOTATION-tag dimension:
//     sameTag (case-insensitive) against the entry's own tags — a
//     highlight's or an article note's, never the article's tags.
//   - SORTING stays the existing cross-library orders applied consistently
//     across types (no global article-note promotion; the article-view's
//     article-note-first rule does NOT apply here): date interleaves both
//     kinds by createdAt; the position-voiced sorts (article/position)
//     order highlights by position.start and place article notes — which
//     have no passage position — after them, newest-created first.
//
// Sort keys (three verified precedents):
//   - date:     ISO-8601 lexicographic == chronological (markdown.ts L238-240)
//   - article:  provenance.title localeCompare (markdown.ts L253)
//   - position: position.start ascending (AnnotationsDrawer.tsx L75-79)
//
// Threat register (10-01-PLAN.md `<threat_model>`):
//   - T-10-01a: HighlightRecord.id/articleId are foreign-controlled strings
//     (imported bundles). They enter Map.get lookups ONLY — never dynamic
//     property access, never eval-shaped use.
//   - T-10-01b: stored note/highlight text moves through here as data only;
//     rendering plans (10-02) render it as React text children — never raw
//     HTML (react/no-danger + lint:no-danger enforced repo-wide).
import { resolveQuoteSelectorInText } from "../../annotations/resolution";
import { MemoizedArticleText } from "../../portability/conflicts";
import { effectiveTitle } from "../../ingestion/library/effectiveMetadata";
// Issue #117 — the ONE case-insensitive tag comparison (tagText.sameTag —
// the Q7A discipline) backs the annotation-tag dimension: annotation tags
// are record-local casings (the write seam folds only against the library
// vocabulary), so two rows may carry "Margin" and "margin".
import { sameTag } from "../../ingestion/library/tagText";
import type { TextPositionSelector } from "../../content/normalizeText";
import type { ArticleNote } from "../../persistence/articleNotesStore";
import type { CanonicalArticle, HighlightRecord, NoteRecord } from "../../content/schema";

// ── Types ────────────────────────────────────────────────────────────────────

/** The three section sorts the panel offers (CONTEXT D10 sort set). */
export type ReviewSort = "date" | "article" | "position";

/** The honest tri-state vocabulary (D5-02/ANNO-07 — reused, not redefined). */
export type ConfidenceValue = "confident" | "ambiguous" | "orphan";

/** Confidence filter value; "all" passes every status (D10-08). */
export type ConfidenceFilter = "all" | ConfidenceValue;

/** Issue #210 — the annotation-type filter; "all" is the default. */
export type ReviewTypeFilter = "all" | "highlights" | "article-notes";

/**
 * The filter shape consumed by deriveReviewSections — AND-composed (D10-08).
 * The tag dimensions are clearly named singles:
 */
export interface ReviewFilters {
  /**
   * Single-select ARTICLE-tag filter; null = no filter. Byte-identical
   * meaning to the pre-#117 `tag` field (exact match on the article's own
   * tags): orphans have no article to carry a tag, so they drop out ONLY
   * while this filter is active — existing article-tag searches return
   * the same matches as before. NEVER the annotations' tags (issue #209
   * vocabulary — article tags and annotation tags are separate namespaces).
   */
  articleTag: string | null;
  /**
   * Single-select ANNOTATION-tag filter; null = no filter. Matches the
   * entry's OWN tags (case-insensitive, sameTag) — a highlight's or, since
   * issue #210, an article note's; never the article's tags. No article
   * requirement — an orphan can still match its own annotation tag.
   */
  annotationTag: string | null;
  /** Restrict to one article's annotations; null = no article filter. */
  articleId: string | null;
  /** Tri-state filter; "all" never silently filters ambiguous/orphan rows.
   * Composes across kinds: highlights carry the tri-state; article notes
   * carry the coarse confident/orphan pair (never "ambiguous"). */
  confidence: ConfidenceFilter;
  /** Issue #210 — annotation type; "all" (the default) passes both kinds. */
  type: ReviewTypeFilter;
  /** Issue #210 — free-text search over the row's readable fields; "" or
   * whitespace-only disables the query branch (the library search rule). */
  query: string;
}

/** One highlight row: the record, its optional note, its honest tri-state
 * status, and the article it joined to (absent for orphan-tail rows). */
export interface HighlightReviewEntry {
  kind: "highlight";
  highlight: HighlightRecord;
  note?: NoteRecord;
  status: ConfidenceValue;
  article?: CanonicalArticle;
  /** Current resolved range; display verifies exact text before using its boundaries. */
  resolvedPosition?: TextPositionSelector;
}

/** One article-note row: the saved record, its coarse anchor status (an
 * article note has no passage anchor: "confident" when its article exists,
 * "orphan" when the article vanished — never "ambiguous"), and the article
 * it joined to (absent for orphan-tail rows). No quote selector, no passage
 * destination — an article note has none (the parent spec's never-fabricate
 * rule). The coarse status keeps the confidence dimension AND-composable
 * across kinds (D10-08) without pretending a note was passage-resolved. */
export type ArticleNoteConfidence = "confident" | "orphan";

export interface ArticleNoteReviewEntry {
  kind: "article-note";
  note: ArticleNote;
  status: ArticleNoteConfidence;
  article?: CanonicalArticle;
}

export type ReviewEntry = HighlightReviewEntry | ArticleNoteReviewEntry;

/** One article's group of entries. `key` is the article id (stable for
 * React list keys and section anchoring). */
export interface ReviewSection {
  key: string;
  article: CanonicalArticle;
  entries: ReviewEntry[];
}

/** The derivation result: per-article sections + the never-drop orphan tail
 * (D10-05 — article-less entries are collected here, never discarded). */
export interface ReviewDerivation {
  sections: ReviewSection[];
  orphanEntries: ReviewEntry[];
}

// ── Row vocabularies (shared with the view's unit assertions) ────────────────

/** The entry's creation instant — the date-sort key for BOTH kinds. */
export function entryCreatedAt(entry: ReviewEntry): string {
  return entry.kind === "highlight" ? entry.highlight.createdAt : entry.note.createdAt;
}

/** The entry's search haystack — the lowercase join of its readable fields
 * (the libraryFilter D8-06 discipline). Stored quote + passage note + the
 * entry's own annotation tags for highlights; text + annotation tags for
 * article notes. Rendered text only — never markup (T-10-01b). */
function entryHaystack(entry: ReviewEntry): string {
  if (entry.kind === "highlight") {
    return [entry.highlight.quote.exact, entry.note?.text ?? "", ...(entry.highlight.tags ?? [])]
      .join(" ")
      .toLowerCase();
  }
  return [entry.note.text, ...(entry.note.tags ?? [])].join(" ").toLowerCase();
}

/** Newest-first within a same-voice group (ISO-8601 lexicographic). */
function byNewestFirst(a: ReviewEntry, b: ReviewEntry): number {
  return entryCreatedAt(a) < entryCreatedAt(b) ? 1 : -1;
}

// ── The derivation ───────────────────────────────────────────────────────────

/**
 * deriveReviewSections — join every annotation with its article, classify
 * each highlight row's honest tri-state status, apply the AND-composed
 * filters, group under articles, and sort. Pure: no mutation of the inputs,
 * no IO, no React. Every annotation survives to exactly one output row
 * unless a filter explicitly excludes it (D10-05 never-drop).
 *
 * Pipeline order (locked by the plan):
 *   (a) JOIN — articleById + noteByHighlightId Maps (Map.get lookups only —
 *       foreign bundle ids never reach property access; T-10-01a), exactly
 *       the markdown.ts collectHighlightEntries join shape. Article notes
 *       join by their own articleId (issue #210).
 *   (b) CLASSIFY — ONE MemoizedArticleText per call; each highlight with an
 *       article resolves through resolveQuoteSelectorInText against the
 *       per-article memoized clusters (D10-13). Non-string results map to
 *       "confident" (the conflicts.ts resolveHighlightStatus mapping).
 *       An absent article → "orphan", row KEPT. Article notes carry no
 *       anchor to resolve.
 *   (c) FILTER — articleTag ∧ annotationTag ∧ articleId ∧ type ∧ query ∧
 *       confidence, AND-composed (D10-08; the tag dimensions are
 *       independent — issue #117). Confidence composes across kinds via
 *       each entry's status (tri-state for highlights, coarse
 *       confident/orphan for article notes).
 *   (d) GROUP — article-backed entries under their article; article-less
 *       entries into orphanEntries. Sections exist only for articles with
 *       surviving entries (no empty sections).
 *   (e) SORT — date: sections by newest entry createdAt descending
 *       (ISO-8601 lexicographic), entries newest-first — both kinds
 *       interleaved; article: sections by provenance.title localeCompare,
 *       highlights ascending by position.start with article notes after
 *       them (newest-created first); position: sections in the input
 *       articles-array order, highlights ascending by position.start with
 *       article notes after them (newest-created first). Article notes
 *       have no passage position, so the position-voiced sorts never
 *       promote or interleave them — they trail their section.
 *
 * @param articles     The whole library (composite fixtures + ingested rows).
 * @param highlights   Every stored highlight (whole-library read).
 * @param notes        Every stored note (joined 1:1 via highlightId).
 * @param articleNotes Every stored saved article note (issue #210).
 * @param filters      AND-composed filter set.
 * @param sort         One of the three ReviewSort orders.
 */
export function deriveReviewSections(
  articles: readonly CanonicalArticle[],
  highlights: readonly HighlightRecord[],
  notes: readonly NoteRecord[],
  articleNotes: readonly ArticleNote[],
  filters: ReviewFilters,
  sort: ReviewSort,
): ReviewDerivation {
  // (a) JOIN — the markdown.ts collectHighlightEntries shape (Map.get only).
  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  const noteByHighlightId = new Map(notes.map((n) => [n.highlightId, n] as const));

  // (b) CLASSIFY — memoized tri-state (D10-13): one MemoizedArticleText per
  // call means normalizeText/graphemeClusters run once per article id, not
  // once per highlight.
  const memoizedText = new MemoizedArticleText();
  const entries: ReviewEntry[] = [];
  for (const highlight of highlights) {
    const article = articleById.get(highlight.articleId); // Map.get — T-10-01a
    const note = noteByHighlightId.get(highlight.id);
    let status: ConfidenceValue;
    let resolvedPosition: HighlightReviewEntry["resolvedPosition"];
    if (!article) {
      status = "orphan"; // absent article → orphan, row KEPT (D10-05)
    } else {
      const resolved = resolveQuoteSelectorInText(
        memoizedText.clustersFor(article),
        highlight.quote,
        article.lang,
        highlight.position,
      );
      if (typeof resolved !== "string") resolvedPosition = resolved;
      status = resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
    }
    const entry: HighlightReviewEntry = article
      ? { kind: "highlight", highlight, status, article }
      : { kind: "highlight", highlight, status };
    if (resolvedPosition) entry.resolvedPosition = resolvedPosition;
    if (note) entry.note = note;
    entries.push(entry);
  }
  // Issue #210 — the second row kind joins the SAME entry stream, with its
  // coarse anchor status (confident = article present, orphan = vanished).
  for (const note of articleNotes) {
    const article = articleById.get(note.articleId); // Map.get — T-10-01a
    entries.push(
      article
        ? { kind: "article-note", note, status: "confident", article }
        : { kind: "article-note", note, status: "orphan" },
    );
  }

  // (c) FILTER — AND-composed (D10-08): every active filter must pass.
  // (Hoisted narrowings — property narrowing does not survive callbacks.)
  const { articleTag, annotationTag, type } = filters;
  const q = filters.query.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (type === "highlights" && entry.kind !== "highlight") return false;
    if (type === "article-notes" && entry.kind !== "article-note") return false;
    if (articleTag !== null) {
      // The pre-#117 meaning, byte-identical: exact match on the ARTICLE's
      // own tags. Orphans have no article to carry a tag — they drop out
      // only while this filter is active.
      if (!entry.article) return false;
      if (!(entry.article.tags ?? []).includes(articleTag)) return false;
    }
    if (annotationTag !== null) {
      // The entry's OWN annotation tags (never the article's), either kind
      // since #210: case-insensitive (sameTag) because record-local casings
      // are not folded across rows. No article requirement — an orphan can
      // still match its own annotation tag.
      const ownTags =
        entry.kind === "highlight" ? (entry.highlight.tags ?? []) : (entry.note.tags ?? []);
      if (!ownTags.some((t) => sameTag(t, annotationTag))) {
        return false;
      }
    }
    if (filters.articleId !== null) {
      const entryArticleId =
        entry.kind === "highlight" ? entry.highlight.articleId : entry.note.articleId;
      if (entryArticleId !== filters.articleId) return false;
    }
    if (q.length > 0) {
      if (!entryHaystack(entry).includes(q)) return false;
    }
    if (filters.confidence !== "all") {
      // Both kinds carry an honest status (tri-state / coarse pair), so the
      // dimension AND-composes across the type filter too: "orphan" returns
      // vanished-article rows of BOTH kinds; "ambiguous" never matches an
      // article note (a note is never passage-resolved).
      if (entry.status !== filters.confidence) return false;
    }
    return true;
  });

  // (d) GROUP — article-backed entries under their article; article-less
  // entries into the never-drop orphan tail. Sections exist only for
  // articles with surviving entries (no empty sections).
  const sectionsByArticleId = new Map<string, ReviewSection>();
  const orphanEntries: ReviewEntry[] = [];
  for (const entry of filtered) {
    const article = entry.article;
    if (!article) {
      orphanEntries.push(entry);
      continue;
    }
    let section = sectionsByArticleId.get(article.id);
    if (section === undefined) {
      section = { key: article.id, article, entries: [] };
      sectionsByArticleId.set(article.id, section);
    }
    section.entries.push(entry);
  }

  // (e) SORT — three key precedents; each branch also orders the entries
  // within every section. Fresh arrays throughout — inputs are not mutated.
  const sections = [...sectionsByArticleId.values()];
  // Position-voiced entry order: highlights ascend by position.start
  // (the stored hint — the display re-verifies); article notes have NO
  // passage position, so they trail their section, newest-created first
  // (the article view's note voice — never promoted, never interleaved).
  const byPositionThenNotes = (a: ReviewEntry, b: ReviewEntry): number => {
    if (a.kind === "highlight" && b.kind === "highlight") {
      return a.highlight.position.start - b.highlight.position.start;
    }
    if (a.kind === "article-note" && b.kind === "article-note") return byNewestFirst(a, b);
    return a.kind === "highlight" ? -1 : 1;
  };
  if (sort === "date") {
    // ISO-8601 strings compare lexicographically == chronologically
    // (markdown.ts L238-240 precedent). Both kinds interleave by createdAt.
    const newestCreatedAt = (section: ReviewSection): string => {
      let newest = "";
      for (const e of section.entries) {
        const created = entryCreatedAt(e);
        if (created > newest) newest = created;
      }
      return newest;
    };
    sections.sort((a, b) => (newestCreatedAt(a) < newestCreatedAt(b) ? 1 : -1));
    for (const section of sections) {
      section.entries.sort(byNewestFirst);
    }
  } else if (sort === "article") {
    sections.sort((a, b) => effectiveTitle(a.article).localeCompare(effectiveTitle(b.article)));
    for (const section of sections) {
      section.entries.sort(byPositionThenNotes);
    }
  } else {
    // "position" — sections in the INPUT articles-array order (reading-order
    // stability across the library as the caller loaded it).
    const inputOrder = new Map(articles.map((a, i) => [a.id, i] as const));
    sections.sort(
      (a, b) => (inputOrder.get(a.article.id) ?? 0) - (inputOrder.get(b.article.id) ?? 0),
    );
    for (const section of sections) {
      section.entries.sort(byPositionThenNotes);
    }
  }

  return { sections, orphanEntries };
}
