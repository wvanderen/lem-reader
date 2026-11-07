// src/content/chapterTargets.ts
// Issue #244 — the ONE chapter-target algebra: resolving a collection
// entry's chapter target against the live library records, and resolving a
// reader route's chapter scope to a concrete reading assignment.
//
// Pure functions, zero React, zero Dexie (the store-seam discipline — the
// caller passes the article rows; this module owns the algebra over them).
// Every definition here is shared by ALL consumers so they cannot disagree:
// the add-dialog picker, the store's write-seam validation, the collection
// detail view's row resolution, and the reader route's assignment
// resolution.
//
// The two chapter target shapes (schema.ts, issue #244):
//   - { kind: "book-chapter", bookId, articleId } — one EXISTING chapter
//     article of one EPUB book (the article's ingestionMeta.bookId must
//     equal bookId — the membership is verified, never assumed).
//   - { kind: "work-chapter", articleId, destinationId } — one chapter
//     destination (kind === "chapter") of a saved web work's structure.
//     Generated reading parts are not targets: the destinationId regex
//     admits `ch-*` only, so a `pt-*` id fails the SHAPE before any lookup.
//
// Structure resolution (resolveWorkStructure) is the SAME freeze contract
// useWorkStructure applies to the reader: a SAVED snapshot that validates
// against the article's canonical content is used as-is; otherwise the
// structure derives deterministically from canonical content (issue #236 —
// same boundaries and ids a snapshot would carry) and must pass the same
// validation. A target is only offered/accepted when its destination
// survives THIS gate, so a target that resolves here is a target the reader
// resolves identically.
//
// The reader-side ChapterAssignment (resolveChapterAssignment) is the
// route's declared reading scope: offsets are canonical D-05 grapheme
// bounds (the one coordinate currency — ADR 0001); an assignment scopes
// where reading starts and stops WITHOUT creating a substitute article or
// a second saved position (ADR 0011).
import type { Book, CanonicalArticle, StructureDestination, WorkStructure } from "./schema";
import { deriveWorkStructure, validateWorkStructure, structureLeaves } from "./structure";
import { articleGraphemeIndex } from "./normalizeText";

/**
 * The ONE structure resolution the target algebra and the reader share (the
 * useWorkStructure freeze contract): a saved snapshot that validates wins;
 * otherwise the deterministic derivation, itself validated. Null when the
 * article has no readable text or no structure survives validation.
 */
export function resolveWorkStructure(article: CanonicalArticle): WorkStructure | null {
  if (article.structure !== undefined) {
    const saved = validateWorkStructure(article, article.structure);
    if (saved !== null) return saved;
  }
  const derived = deriveWorkStructure({ ...article, provenanceTitle: article.provenance.title });
  if (derived === undefined) return null;
  return validateWorkStructure(article, derived);
}

/**
 * The chapter destinations of one article's resolved structure, in structure
 * order — the add-picker's chapter rows (issue #244 AC: "validated stable
 * chapter targets from established structural snapshots"; the ids are
 * range-encoded and stable across typography and reloads). Generated parts
 * are NOT returned: only `kind: "chapter"` destinations are targets.
 */
export function listWorkChapterTargets(article: CanonicalArticle): StructureDestination[] {
  const structure = resolveWorkStructure(article);
  if (structure === null) return [];
  return structure.destinations.filter((d) => d.kind === "chapter");
}

/**
 * Resolve one work-chapter target against the article's CURRENT structure.
 * Null when the article is absent from the caller's fold (checked by the
 * caller), when it is a book member (chapters of books are book targets'
 * business, not work-chapter targets), or when the destinationId does not
 * resolve to a chapter destination of the live structure (a stale target
 * after a re-ingest changed the ranges).
 */
export function resolveWorkChapterTarget(
  article: CanonicalArticle,
  destinationId: string,
): StructureDestination | null {
  if (article.ingestionMeta?.bookId !== undefined) return null;
  const structure = resolveWorkStructure(article);
  if (structure === null) return null;
  const destination = structure.destinations.find((d) => d.id === destinationId);
  return destination !== undefined && destination.kind === "chapter" ? destination : null;
}

/** One EPUB chapter target's honest validity: the book row exists, the
 * chapter article row exists, and the article really belongs to the book
 * (ingestionMeta.bookId === bookId — the membership the schema cannot
 * verify across two records). */
export function resolveBookChapterTarget(
  book: Book | undefined,
  chapterArticle: CanonicalArticle | undefined,
): CanonicalArticle | null {
  if (book === undefined || chapterArticle === undefined) return null;
  return chapterArticle.ingestionMeta?.bookId === book.id ? chapterArticle : null;
}

// ── The reader-side assignment (the route's declared reading scope) ──

/** A chapter assignment resolved for the reader route. `startOffset` is
 * inclusive, `endOffset` exclusive — canonical D-05 grapheme bounds, the
 * same currency as saved locations, highlights, and speech (ADR 0001). */
export interface ChapterAssignment {
  /** "destination" — a chapter range INSIDE a web work (the article stays
   * mounted; pagination/speech scope to the range). "whole" — the whole
   * article as a book chapter (EPUB): the article IS the chapter, so the
   * bounds are 0..total and the scoping concerns the handoff/stop behavior,
   * not the coordinates. */
  readonly kind: "destination" | "whole";
  /** The chapter destination for "whole" === undefined (the article is the
   * chapter — there is no in-article destination). */
  readonly destination: StructureDestination | undefined;
  /** The chapter's title (destination title, or the article title for
   * "whole" — the EPUB chapter article's own name). */
  readonly title: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

/** The chapter destination-id grammar a route scope may carry (the SAME
 * regex the work-chapter target schema enforces — one rule, both sides).
 * The literal "chapter" is the whole-article EPUB scope. */
const DESTINATION_SCOPE_REGEX = /^ch-\d+\.(?:b|\d+)$/;

/**
 * Resolve the route's `#/article/<id>/c/<scope>` chapter scope to a
 * concrete assignment, or null when the scope does not describe a readable
 * assignment for THIS article (unknown scope grammar, a destination that
 * no longer validates — a stale target after a re-ingest — or a scope on a
 * work whose structure is unavailable). Null means the open degrades to
 * ordinary whole-work reading: calm, never a dead end (the stale-handoff
 * honesty the AC names).
 */
export function resolveChapterAssignment(
  article: CanonicalArticle,
  structure: WorkStructure | null,
  scope: string,
): ChapterAssignment | null {
  const total = articleGraphemeIndex(article).totalGraphemes;
  if (total <= 0) return null;
  // The whole-article scope ("chapter" — the EPUB book-chapter open): the
  // assignment bounds are the article itself; no structure is consulted.
  if (scope === "chapter") {
    return {
      kind: "whole",
      destination: undefined,
      title: article.provenance.title,
      startOffset: 0,
      endOffset: total,
    };
  }
  if (!DESTINATION_SCOPE_REGEX.test(scope) || structure === null) return null;
  const destination = structure.destinations.find((d) => d.id === scope);
  if (destination === undefined || destination.kind !== "chapter") return null;
  return {
    kind: "destination",
    destination,
    title: destination.title,
    startOffset: destination.startOffset,
    endOffset: destination.endOffset,
  };
}

/** Is `offset` inside the assignment's range? The resume gate (issue #244
 * AC: open at the shared saved position only when it falls inside the
 * assigned chapter). Offsets at the exclusive end belong to the NEXT
 * chapter — the shared position at a chapter's exact end resumes there. */
export function assignmentContainsOffset(assignment: ChapterAssignment, offset: number): boolean {
  return offset >= assignment.startOffset && offset < assignment.endOffset;
}

/** The first leaf destination at-or-after `offset` — the heading the reader
 * lands on when a continue-the-work action enters the next chapter (the
 * landing focus target). Null when offset is past the last leaf's start. */
export function leafAtOrAfter(
  structure: WorkStructure,
  offset: number,
): StructureDestination | null {
  const leaves = structureLeaves(structure);
  for (const leaf of leaves) {
    if (leaf.startOffset >= offset) return leaf;
  }
  return null;
}
