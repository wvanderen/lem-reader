// src/reader/useChapterCompletion.ts
// Issue #246 — the reader's ONE shared-completion seam. Loads the persisted
// completion records for the mounted work's chapter destinations (the TOC
// finished marks), records valid chapter-reading transitions (source
// "reading"), and reports transition-write failures honestly.
//
// The hook owns NO derivation: chapter-target completion is RECORD-ONLY
// (content/completion.ts — no fabricated coverage from saved positions),
// so the map here is exactly the records' truth for this article. Whole-
// article and book completion never pass through here — they keep the
// canonical-location contract (ADR 0001).
//
// Write discipline (issue #246 AC — stale callbacks and persistence):
//   - completeChapter is a no-op for destinations that do not belong to the
//     MOUNTED article (a stale callback from a swapped article can never
//     write), and once-per-mount per destination (a reader jiggling at a
//     chapter's end fires one write, not one per scroll event).
//   - A FAILED write clears the once-guard so a later genuine transition can
//     retry; the route owns the honest announcement (saveFailed).
//   - The write is fire-and-forget: reading NEVER blocks on completion
//     persistence (the D2-13 posture).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalArticle, WorkStructure } from "../content/schema";
import { completionTargetKey } from "../content/completion";
import { loadAllCompletions, recordCompletion } from "../persistence/completionsStore";

export interface ChapterCompletionState {
  /** destinationId → finished for the article's chapter destinations. */
  readonly finishedById: ReadonlyMap<string, boolean>;
  /** blockIndex → finished — the TOC finished-mark input (a chapter mark
   * rides its destination's start block, the same block the TOC entry
   * resolves). */
  readonly marksByBlockIndex: ReadonlyMap<number, boolean>;
  /** Record a chapter completion (source "reading") for the mounted work. */
  readonly completeChapter: (destinationId: string) => void;
  /** A transition write failed — the route announces honestly. */
  readonly saveFailed: boolean;
}

export function useChapterCompletion(
  article: CanonicalArticle | null,
  structure: WorkStructure | null,
): ChapterCompletionState {
  // The mounted work's chapter destinations (kind "chapter" only —
  // generated parts are not targets; the same filter the picker uses).
  // BOOK MEMBERS are gated out entirely (the resolveWorkChapterTarget
  // rule): an EPUB chapter's headings are its own sections, never
  // work-chapter targets — its completion is the whole-article location
  // contract, and no work-chapter record may ever be written for it.
  const isBookMember = article?.ingestionMeta?.bookId !== undefined;
  const articleId = isBookMember ? null : (article?.id ?? null);
  const chapters = useMemo(
    () =>
      !isBookMember && article !== null && structure !== null
        ? structure.destinations.filter((d) => d.kind === "chapter")
        : [],
    [isBookMember, article, structure],
  );

  // The persisted truth for THIS article's chapters, re-read per open (a
  // correction made in another surface must show on the next open — local-
  // first, no cross-tab live sync promised).
  const [finishedIds, setFinishedIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    if (articleId === null) {
      setFinishedIds(new Set());
      return;
    }
    loadAllCompletions()
      .then((records) => {
        if (cancelled) return;
        const byKey = new Map(records.map((r) => [r.targetKey, r]));
        const finished = new Set<string>();
        for (const chapter of chapters) {
          const key = completionTargetKey({
            kind: "work-chapter",
            articleId: articleId,
            destinationId: chapter.id,
          });
          if (byKey.get(key)?.finished === true) finished.add(chapter.id);
        }
        setFinishedIds(finished);
      })
      .catch(() => {
        if (!cancelled) setFinishedIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, chapters]);

  // Once-per-mount guard (scroll events at a chapter's end fire in
  // bursts — one write per destination per open). Cleared on write
  // failure so a later genuine transition can retry.
  const completedRef = useRef<Set<string>>(new Set());
  // The article-generation guard: a stale callback (a speech or layout
  // callback arriving around an article swap) writes nothing for a
  // departed work.
  const articleIdRef = useRef<string | null>(articleId);
  articleIdRef.current = articleId;

  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    setSaveFailed(false);
    completedRef.current = new Set();
  }, [articleId]);

  const completeChapter = useCallback(
    (destinationId: string) => {
      const currentArticleId = articleIdRef.current;
      if (currentArticleId === null) return;
      // The destination must belong to THIS article's structure — a stale
      // or foreign id never writes.
      const chapter = chapters.find((c) => c.id === destinationId);
      if (chapter === undefined) return;
      if (completedRef.current.has(destinationId)) return;
      if (finishedIds.has(destinationId)) {
        completedRef.current.add(destinationId);
        return;
      }
      completedRef.current.add(destinationId);
      recordCompletion(
        { kind: "work-chapter", articleId: currentArticleId, destinationId },
        true,
        "reading",
      )
        .then(() => {
          if (articleIdRef.current !== currentArticleId) return;
          setFinishedIds((prev) => {
            if (prev.has(destinationId)) return prev;
            const next = new Set(prev);
            next.add(destinationId);
            return next;
          });
        })
        .catch(() => {
          // Honest failure, non-blocking: clear the once-guard so a later
          // genuine transition can retry; the route announces the failure.
          if (articleIdRef.current === currentArticleId) {
            completedRef.current.delete(destinationId);
            setSaveFailed(true);
          }
        });
    },
    [chapters, finishedIds],
  );

  // The TOC mark input: chapter start block → finished.
  const marksByBlockIndex = useMemo(() => {
    const marks = new Map<number, boolean>();
    for (const chapter of chapters) {
      marks.set(chapter.startBlock, finishedIds.has(chapter.id));
    }
    return marks;
  }, [chapters, finishedIds]);

  return {
    finishedById: useMemo(() => {
      const map = new Map<string, boolean>();
      for (const chapter of chapters) {
        map.set(chapter.id, finishedIds.has(chapter.id));
      }
      return map;
    }, [chapters, finishedIds]),
    marksByBlockIndex,
    completeChapter,
    saveFailed,
  };
}
