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
import type { HighlightColor, HighlightRecord, NoteRecord } from "../../content/schema";
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
import {
  loadNote,
  saveNote,
  deleteNote,
} from "../../persistence/notesStore";
// Issue #116 — the ONE tag-write seam (mirrors TagEntry's setArticleTags
// write-through; already in the reader graph via src/reader/TagEntry.tsx).
import { setHighlightTags } from "../../ingestion/library/tagsStore";
// Issue #118 — the named-color write seam (the setHighlightTags twin, minus
// the casing routing: the color vocabulary is the closed schema enum).
import { setHighlightColor } from "../../persistence/highlightsStore";
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
   * Update the note attached to a highlight. The in-memory state updates
   * optimistically; the persistence write is DEBOUNCED (~800ms, mirroring
   * SettingsContext D2-03) so rapid typing doesn't hammer IndexedDB. Empty
   * text = no NoteRecord (the debounce flush deletes the persisted row).
   */
  updateNote: (id: string, text: string) => void;
  /**
   * Flush any pending debounced note write immediately (D2-03). Called by
   * the NotePopover on Done/Escape (and by the dual-event flush listeners
   * on visibilitychange-hidden + pagehide) so no edit is lost.
   */
  flushNoteSave: () => void;
  /**
   * Replace the tag array on a highlight (issue #116). The in-memory record
   * updates optimistically; the persistence write is commit-per-change (tag
   * picks are discrete events — the TagEntry discipline, no debounce) and
   * runs through the ONE tagsStore seam so the existing library vocabulary's
   * stored casing wins (the routed casings are mirrored back into the
   * record once the write lands). Never touches article or book rows. The
   * attached note needs no update — it shares the highlight's tags by
   * construction.
   *
   * Failure contract (STATE-05 + the host's local surface): the optimistic
   * edit ROLLS BACK to the persisted value, the error is classified and
   * routed to onStorageError (StorageBanner) AND rethrown so the TagEntry
   * host's StatusRegion can show its inline "Couldn't save tag." copy
   * inside the modal popover — the banner alone would sit behind the dialog
   * backdrop while the reader is mid-edit.
   */
  updateHighlightTags: (id: string, tags: string[]) => Promise<void>;
  /**
   * Set the named color on a highlight (issue #118). In-memory state updates
   * optimistically; the persistence write is commit-per-change (a color pick
   * is a discrete event — the TagEntry discipline, no debounce) through the
   * ONE highlightsStore seam. Color never gates editability or anchoring —
   * it stays settable on ambiguous/orphaned highlights exactly like tags.
   *
   * Failure contract (the shared commitHighlightEdit contract): the
   * optimistic color ROLLS BACK to the persisted value (the mark + the
   * picker's checked radio re-match the row the disk kept), the error is
   * classified and routed to onStorageError (StorageBanner) AND rethrown so
   * the picker host's StatusRegion can show its inline "Couldn't save
   * color." copy inside the modal popover.
   */
  updateHighlightColor: (id: string, color: HighlightColor) => Promise<void>;
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

  // Ref mirror of the committed state so a commit can capture the pre-edit
  // field value for its failure rollback (no impure reads inside setState
  // updaters).
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  // Only the latest edit per {field, highlight} may mirror or roll back —
  // a superseded in-flight write must not clobber a newer pick.
  const latestRecordEdits = useRef(new Map<string, symbol>());

  // Ref-stable callbacks so the load effect doesn't re-run on callback identity
  // drift (mirrors SettingsContext.tsx L67-68 pendingRef pattern).
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // ── Debounced note save (D2-03 pattern, mirrors SettingsContext L113-165) ──
  // pendingNoteRef stashes the {id, text} of the in-flight note edit so the
  // dual-event flush + Done/Escape flush can persist the latest value without
  // waiting for the debounce window. Only ONE note can be edited at a time
  // (only one popover is open), so a single pendingRef is sufficient.
  const NOTE_SAVE_DEBOUNCE_MS = 800;
  const noteSaveTimer = useRef<number | null>(null);
  const pendingNoteRef = useRef<{ id: string; text: string } | null>(null);

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
        // Issue #116 — new records carry the field (empty) so a row is
        // byte-stable across export → import: the exporter's Zod self-check
        // hydrates the additive field to [] on every parsed record, and the
        // re-imported row must deep-equal the local one (the portability
        // spine's raw-row equality check). Consumers still read `tags ?? []`
        // for pre-#116 rows, which omit the key.
        tags: [],
        // Issue #118 — new records carry the DEFAULT color explicitly so a
        // row is byte-stable across export → import (the same discipline as
        // tags above: the exporter's Zod self-check hydrates the additive
        // field on every parsed record). Consumers read `color ?? "default"`
        // for pre-#118 rows, which omit the key.
        color: "default",
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

  // Debounced note save (D5-10, D2-03 pattern). The in-memory state updates
  // optimistically (so the <mark>.has-note modifier + drawer note text reflect
  // immediately); the persistence write is debounced ~800ms so rapid typing
  // doesn't hammer IndexedDB. Empty text = no NoteRecord (the flush deletes
  // the persisted row). Mirrors SettingsContext.tsx scheduleSave/flushSave
  // verbatim, swapping settingsStore.saveSettings → notesStore.saveNote/deleteNote.
  const commitNoteSave = useCallback(
    async (id: string, text: string): Promise<void> => {
      try {
        if (text.length > 0) {
          // Upsert: reuse the existing note id if present, else generate one.
          // The in-memory state already carries the up-to-date note (updateNote
          // set it optimistically); we read it here so we persist the right id.
          setHighlights((prev) => {
            const h = prev.find((x) => x.record.id === id);
            if (h?.note) {
              void saveNote(h.note);
            }
            return prev; // no state change — just reading
          });
          callbacksRef.current.onStatusAnnounce?.("Note saved.");
        } else {
          // D5-10 empty-text policy: empty note = no NoteRecord. Delete the
          // persisted row if one exists.
          await deleteNote(id);
        }
      } catch (e) {
        const reason = classifyStorageError(e);
        setStorageState(reason);
        callbacksRef.current.onStorageError?.(reason);
      }
    },
    [],
  );

  const scheduleNoteSave = useCallback(
    (id: string, text: string): void => {
      pendingNoteRef.current = { id, text };
      if (noteSaveTimer.current !== null) {
        window.clearTimeout(noteSaveTimer.current);
      }
      noteSaveTimer.current = window.setTimeout(() => {
        noteSaveTimer.current = null;
        const pending = pendingNoteRef.current;
        if (!pending) return;
        pendingNoteRef.current = null;
        void commitNoteSave(pending.id, pending.text);
      }, NOTE_SAVE_DEBOUNCE_MS);
    },
    [commitNoteSave],
  );

  /** Flush the pending note write immediately (D2-03 — Done/Escape/dual-event). */
  const flushNoteSave = useCallback((): void => {
    if (noteSaveTimer.current !== null) {
      window.clearTimeout(noteSaveTimer.current);
      noteSaveTimer.current = null;
    }
    const pending = pendingNoteRef.current;
    if (!pending) return;
    pendingNoteRef.current = null;
    void commitNoteSave(pending.id, pending.text);
  }, [commitNoteSave]);

  // Dual-event flush (Pitfall 4 — bfcache-safe, mirrors SettingsContext L154-165).
  // visibilitychange-hidden + pagehide guarantee the final pending value persists
  // even if the reader tabs away mid-debounce. The deprecated bfcache-breaking
  // session-end events are FORBIDDEN per Plan 05-02's useAnnotationState header.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNoteSave();
    };
    const onPageHide = () => flushNoteSave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushNoteSave]);

  // Cleanup the pending note debounce timer on article swap/unmount so it
  // cannot fire after the hook's state is gone (mirrors SettingsContext L169-177).
  useEffect(() => {
    return () => {
      if (noteSaveTimer.current !== null) {
        window.clearTimeout(noteSaveTimer.current);
        noteSaveTimer.current = null;
      }
      pendingNoteRef.current = null;
    };
  }, [article]);

  const updateNote = useCallback(
    (id: string, text: string): void => {
      // Optimistic in-memory update so the <mark>.has-note modifier + drawer
      // note text reflect immediately (no debounce on the visible state).
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
      // Schedule the debounced persistence write.
      scheduleNoteSave(id, text);
    },
    [scheduleNoteSave],
  );

  /**
   * ONE commit-per-change record-edit contract (issues #116 tags + #118
   * color — previously two verbatim copies of this shape). An edit symbol
   * keyed `${field}:${id}` gates every post-write state touch so only the
   * latest edit per field wins. The optimistic field edit mirrors
   * immediately; then:
   *   - success + `mirror`: the seam's authoritative value mirrors back,
   *     gated on still-latest (tags: the routed stored casings);
   *   - failure (still-latest-gated): the optimistic edit ROLLS BACK to the
   *     captured pre-edit value so the record re-matches the persisted row —
   *     the visible mark + picker never keep a value the disk refused —
   *     then the error is classified + routed to StorageBanner (STATE-05)
   *     and RETHROWN so the host's inline StatusRegion fires inside the
   *     modal popover.
   */
  const commitHighlightEdit = useCallback(
    async <T,>(args: {
      key: string;
      applyOptimistic: (prev: ResolvedHighlight[]) => ResolvedHighlight[];
      seam: () => Promise<T>;
      mirror?: (routed: T) => void;
      rollback: () => void;
    }): Promise<void> => {
      const edit = Symbol();
      latestRecordEdits.current.set(args.key, edit);
      setHighlights(args.applyOptimistic);
      try {
        const routed = await args.seam();
        if (args.mirror && latestRecordEdits.current.get(args.key) === edit) {
          args.mirror(routed);
        }
      } catch (e) {
        if (latestRecordEdits.current.get(args.key) === edit) {
          args.rollback();
        }
        const reason = classifyStorageError(e);
        setStorageState(reason);
        callbacksRef.current.onStorageError?.(reason);
        throw e;
      } finally {
        if (latestRecordEdits.current.get(args.key) === edit) {
          latestRecordEdits.current.delete(args.key);
        }
      }
    },
    [],
  );

  // Issue #116 — commit-per-change highlight-tag write (the TagEntry
  // discipline: optimistic mirror + fire-and-forget seam write) through the
  // shared contract above. See the interface doc for the failure contract.
  const updateHighlightTags = useCallback(
    async (id: string, tags: string[]): Promise<void> => {
      const previous =
        highlightsRef.current.find((h) => h.record.id === id)?.record.tags ??
        [];
      await commitHighlightEdit({
        key: `tags:${id}`,
        applyOptimistic: (prev) =>
          prev.map((h) =>
            h.record.id === id ? { ...h, record: { ...h.record, tags } } : h,
          ),
        // setHighlightTags normalizes + routes to the persisted casing
        // (tagsStore.ts) before touching the highlight row only; the routed
        // array mirrors the exact written casings back into the record.
        seam: () => setHighlightTags(id, tags),
        mirror: (routed) =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id
                ? { ...h, record: { ...h.record, tags: routed } }
                : h,
            ),
          ),
        rollback: () =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id
                ? { ...h, record: { ...h.record, tags: previous } }
                : h,
            ),
          ),
      });
    },
    [commitHighlightEdit],
  );

  // Issue #118 — commit-per-change highlight-color write through the shared
  // contract above (the updateHighlightTags twin). See the interface doc for
  // the failure contract — the rollback is what keeps the rendered mark + the
  // picker's checked radio matched to the persisted row after a failed write.
  const updateHighlightColor = useCallback(
    async (id: string, color: HighlightColor): Promise<void> => {
      const previous =
        highlightsRef.current.find((h) => h.record.id === id)?.record.color ??
        "default";
      await commitHighlightEdit({
        key: `color:${id}`,
        // Optimistic in-memory record update so the picker's selection + the
        // rendered <mark> modifier reflect immediately.
        applyOptimistic: (prev) =>
          prev.map((h) =>
            h.record.id === id ? { ...h, record: { ...h.record, color } } : h,
          ),
        seam: () => setHighlightColor(id, color),
        rollback: () =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id
                ? { ...h, record: { ...h.record, color: previous } }
                : h,
            ),
          ),
      });
    },
    [commitHighlightEdit],
  );

  return {
    highlights,
    createHighlight,
    deleteHighlight,
    updateNote,
    flushNoteSave,
    updateHighlightTags,
    updateHighlightColor,
    storageState,
  };
}
