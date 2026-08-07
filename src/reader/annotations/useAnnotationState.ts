// src/reader/annotations/useAnnotationState.ts
// Phase 5 Plan 05-02 — annotation state seam (ANNO-01/05/06, STATE-03).
//
// Owns the resolved-highlight state for one article: eager batch-resolve on
// open (loadHighlights → resolveQuoteSelector → ResolvedHighlight[]), create
// (capture→derive→save→prepend), delete (cascade-delete transaction), and a
// note-update STUB (Plan 05-03 fills the debounced save).
//
// Mirrors two codebase disciplines:
//   - SettingsContext.tsx / useScrollSave.ts: the cancelled-flag load pattern
//     (a slow load cannot overwrite a fast in-flight create) + debounced save
//     + dual-event flush + classifyStorageError routing.
//   - The Plan 05-01 anchor engine: captureSelection → TextPositionSelector,
//     deriveQuoteSelector → TextQuoteSelector, resolveQuoteSelector tri-state,
//     rangesOverlap disjoint check, saveHighlight/deleteHighlight persistence.
//
// REUSE-DO-NOT-FORK (D-05 contract): every offset round-trips through
// normalizeText.ts's D-05 substrate. We never fork normalization, never
// persist DOM Range/XPath/page-number/pixel anchors (STACK.md FORBIDS them).
//
// STATE-05 routing: persistence failures NEVER throw to the reader — they
// classify via classifyStorageError and route to the EXISTING StorageBanner
// via the onStorageError callback. Reading continues with in-memory state
// (D2-13 — fixtures are bundled JSON; the article is always readable).
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { HighlightRecord, NoteRecord } from "../../content/schema";
import {
  deriveQuoteSelector,
  resolveQuoteSelector,
} from "../../content/normalizeText";
import type { TextPositionSelector } from "../../content/normalizeText";
import {
  loadHighlights,
  saveHighlight,
  deleteHighlight as deleteHighlightFromStore,
} from "../../persistence/highlightsStore";
import { loadNote } from "../../persistence/notesStore";
import { classifyStorageError } from "../../persistence/errors";

/** D5-02 tri-state — drives Plan 05-04 ambiguous/orphan surfacing. */
export type HighlightStatus = "confident" | "ambiguous" | "orphan";

/**
 * A highlight resolved against the current revision's normalized text.
 * - status drives the renderer (D5-04) + drawer flagging (Plan 05-04).
 * - resolvedPosition is the re-anchored position (confident) or the stored
 *   hint (ambiguous/orphan — best-effort vicinity rendering, never silent
 *   re-attach per ANNO-07).
 * - note is the attached NoteRecord (null for a bare highlight).
 */
export interface ResolvedHighlight {
  record: HighlightRecord;
  status: HighlightStatus;
  resolvedPosition: TextPositionSelector | null;
  note: NoteRecord | null;
}

export type AnnotationStorageState =
  | "ok"
  | "unavailable"
  | "corrupt"
  | "unupgradeable";

export interface UseAnnotationStateCallbacks {
  /**
   * Polite announce for consequential annotation events (D5-12, A11Y-08).
   * The caller (ArticleView) routes this to its `.status` live region.
   * Concise copy: "Highlight saved." / "Highlight deleted."
   */
  onStatusAnnounce?: (message: string) => void;
  /**
   * Storage-error classification callback (STATE-05). The caller routes the
   * reason to the EXISTING StorageBanner — no new surface. Reading continues
   * with in-memory state (D2-13).
   */
  onStorageError?: (reason: AnnotationStorageState) => void;
}

export interface UseAnnotationStateResult {
  highlights: ResolvedHighlight[];
  /**
   * Create a highlight from an already-captured D-05 position. Derives the
   * TextQuoteSelector (D5-03 dual-selector persistence), persists via
   * saveHighlight, and optimistically prepends to in-memory state.
   * Returns the new highlight id (or null on failure).
   */
  createHighlight: (position: TextPositionSelector) => Promise<string | null>;
  /**
   * Delete a highlight + cascade-delete its note atomically (D5-12). The
   * deleteHighlight store seam owns the Dexie transaction (Pitfall 10).
   */
  deleteHighlight: (id: string) => Promise<void>;
  /**
   * STUB (Plan 05-03 fills the debounced save): updates in-memory note state
   * only so the provider contract is stable. The NotePopover (Plan 05-03)
   * will wire saveNote through this signature.
   */
  updateNote: (id: string, text: string) => void;
  storageState: AnnotationStorageState;
}

/**
 * Eager batch-resolve highlights on article open + provide CRUD.
 *
 * RESEARCH.md Open Question #1: eager batch-resolve is recommended —
 * resolveQuoteSelector is a pure function; same-revision path is sub-ms.
 * Ambiguous/orphan states are genuinely reachable cross-revision (D5-01).
 */
export function useAnnotationState(
  article: CanonicalArticle,
  callbacks: UseAnnotationStateCallbacks,
): UseAnnotationStateResult {
  const [highlights, setHighlights] = useState<ResolvedHighlight[]>([]);
  const [storageState, setStorageState] = useState<AnnotationStorageState>("ok");

  // Ref-stable callbacks so the load effect doesn't re-run on callback identity
  // drift (mirrors SettingsContext.tsx L67-68 pendingRef pattern).
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Eager batch-resolve on article open (cancelled-flag pattern — mirrors
  // SettingsContext.tsx L81-105 + ArticleView.tsx L455-484 load effects). A
  // slow loadHighlights cannot overwrite a fast in-flight create: if the
  // article swaps before the load resolves, `cancelled` gates the setState.
  useEffect(() => {
    let cancelled = false;
    setHighlights([]); // reset on article change
    setStorageState("ok");
    loadHighlights(article.id)
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setStorageState(result.reason);
          callbacksRef.current.onStorageError?.(result.reason);
          return;
        }
        // Eager batch-resolve each record (D5-02 tri-state).
        const resolved: ResolvedHighlight[] = [];
        for (const record of result.highlights) {
          const resolution = resolveQuoteSelector(
            article,
            record.quote,
            record.position,
          );
          let status: HighlightStatus;
          let resolvedPosition: TextPositionSelector | null;
          if (resolution === "ambiguous") {
            status = "ambiguous";
            // Best-effort vicinity at the stored hint (D5-04).
            resolvedPosition = record.position;
          } else if (resolution === "orphan") {
            status = "orphan";
            resolvedPosition = record.position;
          } else {
            status = "confident";
            resolvedPosition = resolution;
          }
          // Load the attached note (1:1 via highlightId). A note load failure
          // is non-critical — treat as "no note" so the highlight still renders.
          let note: NoteRecord | null = null;
          try {
            note = await loadNote(record.id);
          } catch {
            // Fall through with note = null.
          }
          resolved.push({ record, status, resolvedPosition, note });
        }
        if (!cancelled) {
          setHighlights(resolved);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        // loadHighlights never throws (it classifies internally), but defend
        // against any unexpected path — reading continues with no highlights.
        const reason = classifyStorageError(e);
        setStorageState(reason);
        callbacksRef.current.onStorageError?.(reason);
      });
    return () => {
      cancelled = true;
    };
  }, [article]);

  const createHighlight = useCallback(
    async (position: TextPositionSelector): Promise<string | null> => {
      // crypto.randomUUID() per RESEARCH.md Open Question #2 (no collision
      // with fn-N footnote ids which match /^fn-\d+$/).
      const id = crypto.randomUUID();
      // D5-03 dual-selector persistence: position is the O(1) primary anchor;
      // quote is the recovery substrate for cross-revision re-anchoring.
      const quote = deriveQuoteSelector(article, position);
      const record: HighlightRecord = {
        schemaVersion: 1,
        id,
        articleId: article.id,
        revision: article.revision,
        position,
        quote,
        createdAt: new Date().toISOString(),
      };
      // Optimistic prepend — same-revision capture is always "confident".
      const resolved: ResolvedHighlight = {
        record,
        status: "confident",
        resolvedPosition: position,
        note: null,
      };
      setHighlights((prev) => [resolved, ...prev]);
      try {
        await saveHighlight(record);
        callbacksRef.current.onStatusAnnounce?.("Highlight saved.");
        return id;
      } catch (e) {
        // STATE-05: classify + route to StorageBanner. The in-memory highlight
        // stays (D2-13 — reading continues; the highlight will persist when
        // storage recovers or the reader re-creates it).
        const reason = classifyStorageError(e);
        setStorageState(reason);
        callbacksRef.current.onStorageError?.(reason);
        return id;
      }
    },
    [article],
  );

  const deleteHighlight = useCallback(async (id: string): Promise<void> => {
    // Optimistic remove from in-memory state.
    setHighlights((prev) => prev.filter((h) => h.record.id !== id));
    try {
      await deleteHighlightFromStore(id);
      callbacksRef.current.onStatusAnnounce?.("Highlight deleted.");
    } catch (e) {
      const reason = classifyStorageError(e);
      setStorageState(reason);
      callbacksRef.current.onStorageError?.(reason);
    }
  }, []);

  // STUB (Plan 05-03 fills the debounced save): updates in-memory note state
  // only. Empty text = no note (D5-10 empty-text policy enforced upstream).
  const updateNote = useCallback((id: string, text: string): void => {
    setHighlights((prev) =>
      prev.map((h) => {
        if (h.record.id !== id) return h;
        const note: NoteRecord | null =
          text.length > 0
            ? {
                schemaVersion: 1,
                id: h.note?.id ?? crypto.randomUUID(),
                highlightId: id,
                text,
                updatedAt: new Date().toISOString(),
              }
            : null;
        return { ...h, note };
      }),
    );
  }, []);

  return {
    highlights,
    createHighlight,
    deleteHighlight,
    updateNote,
    storageState,
  };
}
