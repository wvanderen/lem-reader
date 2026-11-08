// src/content/completion.ts
// Issue #246 — the ONE shared-completion algebra. Every completion surface
// consumes THESE definitions so they cannot disagree: the collection detail
// view's entry rows + progress line, the reader's chapter-transition
// recorder, and the TOC finished marks (issue #246 AC — shared completion
// across collections and ordinary reading).
//
// Pure functions, zero React, zero Dexie (the store-seam discipline — the
// caller passes the folds; this module owns the algebra over them).
//
// The model (ADR 0011 + ADR 0001 — compatibility contract):
//   - Completion lives on the READING TARGET, never on a collection
//     membership: one record per target, shared by every collection
//     referencing it and by ordinary reading. A book-chapter target and its
//     chapter article are THE SAME reading (completionTargetKey normalizes
//     both to `article:<articleId>`), so a correction through either surface
//     is one truth everywhere.
//   - Whole-article targets (article, book-chapter) KEEP the existing
//     canonical-location contract: finished derives from the latest
//     LocationRecord via isFinishedOffset (readingPosition — the ONE
//     threshold). An explicit reader correction (a completion record) or a
//     recorded reading signal overrides it only while it is the NEWEST
//     signal (updatedAt vs the location's savedAt) — reading again is newer
//     intent than an older correction, and a correction never moves or
//     erases the saved passage position (it lives in a different store).
//   - Book targets aggregate their DECLARED chapters (the deriveBookProgress
//     denominator — the same TOC the library's progress hairline counts): a
//     book is finished when every declared chapter is finished (each chapter
//     honoring its own corrections). A book-level correction overrides the
//     aggregate until a newer chapter-level signal arrives.
//   - Work-chapter targets (chapters of a saved web work) are RECORD-ONLY:
//     there is no per-chapter location (ADR 0001 — one canonical position
//     per work), so completion comes ONLY from a valid chapter-reading
//     transition recorded by the reader or an explicit correction. No
//     derivation from the containing work's saved position or end pin ever
//     fabricates historic chapter coverage (issue #246 AC — a later offset
//     does not prove skipped chapters were read).
//
// Reading transitions (chaptersCompletedByMove): a chapter completes when a
// FORWARD READING MOVE crosses its canonical end offset — a manual page
// turn, a reader scroll, or the read-aloud voice (listening is reading,
// ADR 0001). Jumps, restores, landings, and layout reflows are NOT reading
// moves; their callers never invoke the algebra. Movement through a window
// boundary is completion only when the canonical chapter end lies between
// the two anchors — an intermediate layout window end completes nothing by
// itself.
import type {
  CollectionEntryTarget,
  CompletionRecord,
  LocationRecord,
  StructureDestination,
} from "./schema";
import { isFinishedOffset } from "../reader/readingPosition";

/**
 * completionTargetKey — the ONE target identity (the collectionsStore's
 * sameCollectionTarget discipline, made a string so a Dexie row can carry
 * it as a primary key and every fold can key by it). The book-chapter arm
 * deliberately collapses onto the chapter ARTICLE's key: the chapter IS the
 * article (ADR 0011 — one reading, one completion truth), and the book
 * membership is context, never a second reading.
 */
export function completionTargetKey(target: CollectionEntryTarget): string {
  switch (target.kind) {
    case "article":
      return `article:${target.articleId}`;
    case "book":
      return `book:${target.bookId}`;
    case "book-chapter":
      return `article:${target.articleId}`;
    case "work-chapter":
      return `work-chapter:${target.articleId}/${target.destinationId}`;
  }
}

/** Everything an entry-completion derivation reads (plain folds — the view
 * derives them from the ONE LibrarySnapshot; tests hand-build them). */
export interface EntryCompletionInputs {
  /** THE completion-record fold, keyed by completionTargetKey. */
  completionByKey: ReadonlyMap<string, CompletionRecord>;
  /** THE latest-location fold (max savedAt per articleId — the snapshot's
   * latestLocationByArticleId, never raw rows). */
  latestLocationByArticleId: ReadonlyMap<string, LocationRecord>;
  /** Lookup for an article's normalized-text grapheme total. undefined when
   * the row is absent (partial import) — such readings count UNFINISHED. */
  textLengthOf: (articleId: string) => number | undefined;
  /** A book's DECLARED chapter-article ids (the deriveBookProgress
   * denominator). Empty for unknown books. */
  chapterArticleIdsOf: (bookId: string) => readonly string[];
}

/**
 * newerSignal — the ONE max-fold step over ISO signal stamps (location
 * savedAt / record updatedAt). undefined inputs never win. The article and
 * book derivations share it so the newest-signal precedence cannot fork.
 */
function newerSignal(at: string | undefined, newest: string | undefined): string | undefined {
  if (at === undefined) return newest;
  if (newest === undefined || at > newest) return at;
  return newest;
}

/**
 * recordSupersedes — the ONE correction arbitration: a completion record
 * stands only while it is NEWER than the newest derived signal (a newer
 * location save or chapter record is reading intent the correction yields
 * to). No signal at all → the record stands alone.
 */
function recordSupersedes(record: CompletionRecord, newestSignal: string | undefined): boolean {
  return newestSignal === undefined || record.updatedAt > newestSignal;
}

/**
 * articleCompletionFinished — the ONE whole-article truth: derived from the canonical
 * location (the existing threshold contract) unless a completion record is
 * the NEWER signal. Missing location or unknown total → derived-unfinished
 * (a row-less chapter can never read finished — the deriveBookProgress
 * discipline); a record with no location to arbitrate against stands alone.
 */
export function articleCompletionFinished(
  loc: LocationRecord | undefined,
  total: number | undefined,
  record: CompletionRecord | undefined,
): boolean {
  const derived =
    loc !== undefined && total !== undefined && isFinishedOffset(loc.graphemeOffset, total);
  if (record !== undefined && recordSupersedes(record, loc?.savedAt)) {
    return record.finished;
  }
  return derived;
}

function articleFinished(articleId: string, inputs: EntryCompletionInputs): boolean {
  return articleCompletionFinished(
    inputs.latestLocationByArticleId.get(articleId),
    inputs.textLengthOf(articleId),
    inputs.completionByKey.get(completionTargetKey({ kind: "article", articleId })),
  );
}

/**
 * entryFinished — is this collection-entry target finished? See the module
 * header for the per-kind semantics. An entry whose target is absent from
 * the library derives unfinished (an unlinked row counts, never finishes —
 * honest progress, not optimistic progress).
 */
export function entryFinished(
  target: CollectionEntryTarget,
  inputs: EntryCompletionInputs,
): boolean {
  if (target.kind === "work-chapter") {
    // RECORD-ONLY — the anti-fabrication rule (issue #246 AC). The work's
    // saved position is never consulted for a chapter target.
    return inputs.completionByKey.get(completionTargetKey(target))?.finished ?? false;
  }
  if (target.kind === "book") {
    const chapterIds = inputs.chapterArticleIdsOf(target.bookId);
    if (chapterIds.length === 0) return false;
    const record = inputs.completionByKey.get(completionTargetKey(target));
    // The newest underlying chapter signal (location save or chapter-level
    // record) arbitrates against the book-level correction.
    let newestSignal: string | undefined;
    for (const id of chapterIds) {
      newestSignal = newerSignal(inputs.latestLocationByArticleId.get(id)?.savedAt, newestSignal);
      newestSignal = newerSignal(
        inputs.completionByKey.get(completionTargetKey({ kind: "article", articleId: id }))
          ?.updatedAt,
        newestSignal,
      );
    }
    if (record !== undefined && recordSupersedes(record, newestSignal)) {
      return record.finished;
    }
    return chapterIds.every((id) => articleFinished(id, inputs));
  }
  // "article" and "book-chapter": the same whole-article truth.
  return articleFinished(target.articleId, inputs);
}

/** Finished entries over total entries (issue #246 AC — the ONLY collection
 * progress metric: never length-, time-, or page-weighted). */
export function collectionProgress(
  entries: readonly { target: CollectionEntryTarget }[],
  inputs: EntryCompletionInputs,
): { finished: number; total: number } {
  let finished = 0;
  for (const entry of entries) {
    if (entryFinished(entry.target, inputs)) finished += 1;
  }
  return { finished, total: entries.length };
}

/**
 * chapterCompletedByMove — the ONE destination a forward reading move
 * credits: the FIRST chapter end the move crossed (lowest crossed end).
 * Only forward moves complete (a backward move re-enters, it never un-reads
 * — corrections own un-finishing). Only `kind: "chapter"` destinations are
 * targets; generated part ids are unrepresentable here by construction.
 *
 * Why ONE per move (issue #246 AC — no fabricated coverage): a single move
 * that SPANS several chapter ends (an instant End-key scroll, a voice skip
 * across two unheard chapters, a degenerate multi-chapter page) is a leap,
 * not a traversal — the AC's "visiting/jumping to a later chapter does not
 * prove skipped chapters were read". Crediting only the chapter the reader
 * was IN (its end is the first crossed) keeps every other chapter honestly
 * unfinished; a genuine traversal STREAM accumulates credits across its
 * many small moves. Under-completion is correctable (explicit reader
 * correction); fabrication is not.
 */
export function chapterCompletedByMove(
  prevOffset: number,
  nextOffset: number,
  destinations: readonly StructureDestination[],
): string | null {
  if (nextOffset <= prevOffset) return null;
  let firstId: string | null = null;
  let firstEnd = Number.POSITIVE_INFINITY;
  for (const destination of destinations) {
    if (destination.kind !== "chapter") continue;
    if (destination.endOffset > prevOffset && destination.endOffset <= nextOffset) {
      if (destination.endOffset < firstEnd) {
        firstEnd = destination.endOffset;
        firstId = destination.id;
      }
    }
  }
  return firstId;
}
