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
// Issue #177 exception: a FAILED NOTE WRITE additionally flips the
// noteSavePhase register to "error" (and re-arms the draft) so the open
// note editor can keep itself on screen with the honest-failure line + a
// Retry control — the same keep-open-and-retry contract the modal delete
// confirm has had since issue #174.
//
// Issue #178 — note-write recovery: every pending edit write-throughs a
// recovery draft to the noteDrafts store (keyed by the highlightId — the
// recovery scope is exactly the original highlight), so a tab closed
// mid-edit does not depend on the dual-event flush landing. A landed save
// clears the draft (identity-gated: a late older success never clears a
// newer draft); a failed save retains it (Retry keeps the net up); a
// confirmed highlight deletion cascade-deletes it inside the
// deleteHighlight transaction. restoreNoteDraft hands the draft back to the
// next editor open — or retires it as stale (whitespace-only, equal to the
// landed note, or older than a newer landed write) so recovery never
// resurrects retired writing and never attaches a draft to another
// highlight.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import type {
  HighlightColor,
  HighlightRecord,
  NoteDraftRecord,
  NoteRecord,
} from "../../content/schema";
import { deriveQuoteSelector, resolveQuoteSelector } from "../../content/normalizeText";
import type { TextPositionSelector } from "../../content/normalizeText";
import {
  loadHighlights,
  saveHighlight,
  deleteHighlight as deleteHighlightFromStore,
} from "../../persistence/highlightsStore";
import { loadNote, saveNote, deleteNote } from "../../persistence/notesStore";
// Issue #178 — the note-write recovery draft seam. The draft is the
// write-through mirror of the in-memory pending note edit: persisted on
// every edit, cleared on a landed save, retained across failed saves, and
// restored (or retired as stale) on the next open — so an interrupted tab
// never depends on the browser unload event for recovery.
import { loadNoteDraft, saveNoteDraft, deleteNoteDraft } from "../../persistence/noteDraftsStore";
// Issue #177 — the ONE "does this commentary carry written content?"
// predicate. The note-save policy (persistence + the optimistic draft) uses
// it so empty AND whitespace-only commentary are consistently "no note".
import { hasNoteContent } from "../../annotations/noteText";
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
 * Issue #177 — the note editor's save-state register (see
 * UseAnnotationStateResult.noteSavePhase). "error" keeps the editor open
 * with the honest-failure line + Retry; "saved" always reflects a write
 * that landed.
 */
export type NoteSavePhase = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Issue #177 — a note edit awaiting persistence: the owning highlight's id
 * plus the draft text. The ONE draft shape that travels through the
 * debounce slot (pendingNoteRef), the in-flight map, and every flush seam —
 * the {id, text} pairing is the cross-highlight guard's substance (a retry
 * re-attempts THIS pairing or nothing). Issue #178: the same shape is what
 * restoreNoteDraft resolves with when a persisted recovery draft (keyed by
 * the same id — never another highlight's) is handed back to a fresh
 * editor session.
 */
export interface NoteDraft {
  id: string;
  text: string;
}

/**
 * Issue #178 — the staleness key between a recovery draft and a landed
 * note: `landedWriteIsNewer(noteUpdatedAt, draftUpdatedAt)` is true when a
 * landed write happened AFTER the draft was written (recovery must then
 * retire the draft rather than resurrect older writing). Both sides are
 * Zod-parsed `z.string().datetime()` values — UTC ISO-8601 with the same
 * shape (toISOString output), so the lexical comparison IS the chronological
 * one; the predicate names that invariant instead of scattering raw string
 * comparisons.
 */
function landedWriteIsNewer(noteUpdatedAt: string, draftUpdatedAt: string): boolean {
  return noteUpdatedAt > draftUpdatedAt;
}

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

export type AnnotationStorageState = "ok" | "unavailable" | "corrupt" | "unupgradeable";

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
   *
   * Failure contract (issue #174 — a failed deletion must report without
   * silently losing content): the optimistic in-memory removal ROLLS BACK
   * (the mark + drawer entry re-match the persisted row), the error is
   * classified and routed to onStorageError (StorageBanner), and the error
   * RETHROWS so a modal host (NotePopover) can keep itself open with its
   * inline honest-failure line — the banner alone sits behind the dialog
   * backdrop while the reader is mid-delete. Fire-and-forget callers
   * (SelectionToolbar undo) must attach a no-op catch.
   */
  deleteHighlight: (id: string) => Promise<void>;
  /**
   * Update the note attached to a highlight. The in-memory state updates
   * optimistically; the persistence write is DEBOUNCED (~800ms, mirroring
   * SettingsContext D2-03) so rapid typing doesn't hammer IndexedDB. Empty
   * OR whitespace-only text = no NoteRecord (issue #177 — the shared
   * hasNoteContent semantics; the flush deletes the persisted row).
   */
  updateNote: (id: string, text: string) => void;
  /**
   * Flush any pending debounced note write immediately (D2-03), without
   * waiting for the outcome (fire-and-forget). The safety net for paths
   * that cannot await: the dual-event flush (visibilitychange-hidden +
   * pagehide) and the NotePopover close listener.
   */
  flushNoteSave: () => void;
  /**
   * Issue #177 — the ONE awaitable note-save seam ("waits for successful
   * saving"). Resolves every unresolved write for `id`: an in-flight commit
   * is awaited; a pending debounced draft is flushed immediately; on failure
   * the pending draft is RE-ARMED so a retry re-attempts the same write.
   *
   * The guard contract: a draft keyed to a DIFFERENT highlight is never
   * written by this call (retries cannot save a draft to another highlight —
   * the method returns true: THIS highlight has nothing unresolved). Only
   * one note editor exists at a time, so the guard is defensive, but it
   * makes cross-highlight writes impossible by construction.
   *
   * Resolves false when the write failed (the editor host then stays open
   * with the honest-failure line + Retry); true when every write for `id`
   * landed (or there was nothing to save). NotePopover's Done / Escape /
   * outside-click dismissal and its Retry await this seam — the editor only
   * closes on true.
   */
  ensureNoteSaved: (id: string) => Promise<boolean>;
  /**
   * Issue #178 — restore the persisted recovery draft for `id`, if one is
   * waiting. Resolves the draft ({id, text} keyed to exactly the requested
   * highlight — never another one) for the editor host to apply via
   * updateNote (seeding the textarea + marking the session "Recovered
   * draft"); resolves null when there is nothing to recover. A resolvable
   * draft becomes the pending note edit through the normal updateNote path
   * (the debounced save re-arms, so a recovered draft lands on Done or the
   * next debounce-fire).
   *
   * Stale-draft retirement (resolves null AND deletes the row): the draft
   * carries no written content (whitespace-only — the shared note
   * semantics); its text already equals the landed note (the interrupted
   * save actually completed — nothing to recover, and never a re-attach of
   * what persisted); a NEWER landed note write exists (draft.updatedAt
   * older than note.updatedAt — e.g. the note was edited and saved from the
   * cross-library review panel meanwhile; recovery must not resurrect
   * older writing over newer); or the row is keyed to another highlight
   * (defence in depth — the keyed read makes this unreachable). The landed
   * note's freshness reads the in-memory mirror when the highlight is
   * loaded, else the store directly (a fast editor open can outrun the
   * eager load). Storage failures degrade to null — recovery is a
   * best-effort net and never blocks opening the editor.
   */
  restoreNoteDraft: (id: string) => Promise<NoteDraft | null>;
  /**
   * Issue #177 — the note editor's save-state register, driven by the
   * writes this hook owns: "idle" (nothing attempted), "pending" (a
   * debounced draft is scheduled), "saving" (a write is in flight),
   * "saved" (the latest write landed), "error" (the latest write failed —
   * the editor shows the honest-failure line + Retry). One register for the
   * whole hook: only one note editor can be open at a time.
   */
  noteSavePhase: NoteSavePhase;
  /** Reset the save-state register to "idle" (the fresh-editor-open reset). */
  resetNoteSaveState: () => void;
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
  // dual-event flush + the dismissal flush can persist the latest value without
  // waiting for the debounce window. Only ONE note can be edited at a time
  // (only one popover is open), so a single pendingRef is sufficient.
  //
  // Issue #177 — the save-state register + the in-flight map:
  //   - noteSavePhase drives the editor's saved/error surface (a failed write
  //     keeps the editor open with the honest-failure line + Retry).
  //   - inFlightNoteSaves tracks the promise of each running commit so
  //     ensureNoteSaved can AWAIT an in-flight write instead of racing it
  //     (a dismissal during a debounce-fire waits for the write; a failed
  //     write is observed, never silently dropped).
  const NOTE_SAVE_DEBOUNCE_MS = 800;
  const noteSaveTimer = useRef<number | null>(null);
  const pendingNoteRef = useRef<NoteDraft | null>(null);
  // Identity distinguishes the latest edit from older queued/running writes.
  const latestNoteDrafts = useRef(new Map<string, NoteDraft>());
  // Each entry tracks the queue's tail, including every earlier write.
  // The latest failed draft is re-armed before this promise settles.
  const inFlightNoteSaves = useRef(new Map<string, { text: string; write: Promise<boolean> }>());
  const [noteSavePhase, setNoteSavePhase] = useState<NoteSavePhase>("idle");

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
          const resolution = resolveQuoteSelector(article, record.quote, record.position);
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

  // Issue #174 — the deleteHighlight failure contract: a rejected write must
  // never leave the reader's content silently gone. The optimistic removal
  // captures the removed entry + its index first; on failure the entry is
  // RE-INSERTED at that index (the drawer order re-matches the persisted
  // rows), the error is classified + routed to StorageBanner (STATE-05), and
  // the error RETHROWS so the modal host (NotePopover) can keep itself open
  // with its inline failure line instead of closing as if the delete landed.
  const deleteHighlight = useCallback(async (id: string): Promise<void> => {
    const previous = highlightsRef.current;
    const index = previous.findIndex((h) => h.record.id === id);
    const removed = index >= 0 ? previous[index] : undefined;
    // Optimistic remove from in-memory state.
    setHighlights((prev) => prev.filter((h) => h.record.id !== id));
    try {
      await deleteHighlightFromStore(id);
      callbacksRef.current.onStatusAnnounce?.("Highlight deleted.");
    } catch (e) {
      if (removed !== undefined) {
        setHighlights((prev) => {
          // A rollback is only meaningful while the entry is still absent
          // (a superseding create may already have re-populated the list).
          if (prev.some((h) => h.record.id === id)) return prev;
          const next = prev.slice();
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
      }
      const reason = classifyStorageError(e);
      setStorageState(reason);
      callbacksRef.current.onStorageError?.(reason);
      throw e;
    }
  }, []);

  /**
   * Issue #178 — the ONE best-effort draft discard behind every cleanup
   * path (the landed save's identity-gated retire, the whitespace mirror,
   * and restore's stale retirement): a failed delete costs nothing the
   * reader wrote — a leftover row is retired as stale at the next restore.
   */
  const retireNoteDraft = useCallback((id: string): void => {
    void deleteNoteDraft(id).catch(() => {
      /* best-effort — a stale draft is discarded at the next restore */
    });
  }, []);

  /**
   * Issue #178 — the write-through recovery draft. Every pending edit
   * mirrors to the noteDrafts store IMMEDIATELY (no debounce — recovery
   * must not depend on the debounce firing or on the dual-event flush
   * landing before a tab dies). One row per highlight (the primary key is
   * the highlightId), so consecutive edits replace the row in place.
   *
   * Best-effort by contract: a failed draft write is swallowed (no
   * StorageBanner routing, no register flip) — the net must never disturb
   * the reading surface, and the note save itself still reports honestly
   * through the register when it fails. Clearing text to whitespace
   * DELETES the draft: the draft must always mirror the reader's current
   * intent, so an interrupted clear can never resurrect earlier writing.
   */
  const persistNoteDraft = useCallback(
    (id: string, text: string): void => {
      if (!hasNoteContent(text)) {
        retireNoteDraft(id);
        return;
      }
      void saveNoteDraft({
        schemaVersion: 1,
        highlightId: id,
        text,
        updatedAt: new Date().toISOString(),
      }).catch(() => {
        /* best-effort — recovery is a net, never a surface */
      });
    },
    [retireNoteDraft],
  );

  // Debounced note save (D5-10, D2-03 pattern). The in-memory state updates
  // optimistically (so the <mark>.has-note modifier + drawer note text reflect
  // immediately); the persistence write is debounced ~800ms so rapid typing
  // doesn't hammer IndexedDB. Empty OR whitespace-only text = no NoteRecord
  // (the flush deletes the persisted row — issue #177, the shared
  // hasNoteContent semantics). Mirrors SettingsContext.tsx
  // scheduleSave/flushSave, swapping settingsStore.saveSettings →
  // notesStore.saveNote/deleteNote.
  //
  // Issue #177 — the write RESOLVES to a boolean (the honest-commit
  // discipline, ReviewNoteDialog's twin): the latest draft's success
  // announces "Note saved." and flips the register to "saved"; failure
  // routes to StorageBanner (STATE-05), and the latest draft's failure
  // flips the register to "error" so the open
  // editor keeps the draft on screen with the failure line + Retry. The
  // NoteRecord is built HERE from the ref mirror (never inside a setState
  // updater — an updater side-effect can be skipped on unmount, which
  // mattered once the [article]-swap cleanup flush below started relying
  // on this path), reusing the optimistic note's id so the row key is
  // stable across the draft → persisted round-trip.
  const commitNoteSave = useCallback(
    async (draft: NoteDraft): Promise<boolean> => {
      const { id, text } = draft;
      if (latestNoteDrafts.current.get(id) === draft) setNoteSavePhase("saving");
      try {
        if (hasNoteContent(text)) {
          // Upsert: reuse the optimistic draft's note id if present (updateNote
          // minted it), else generate one.
          const existingId = highlightsRef.current.find((h) => h.record.id === id)?.note?.id;
          await saveNote({
            schemaVersion: 1,
            id: existingId ?? crypto.randomUUID(),
            highlightId: id,
            text,
            updatedAt: new Date().toISOString(),
          });
        } else {
          // D5-10 empty/whitespace-only policy: no written content = no
          // NoteRecord. Delete the persisted row if one exists.
          await deleteNote(id);
        }
        if (latestNoteDrafts.current.get(id) === draft) {
          callbacksRef.current.onStatusAnnounce?.("Note saved.");
          setNoteSavePhase("saved");
          // Issue #178 — the landed write retires the recovery draft, gated
          // on the SAME latest-draft identity as the announce: a late
          // completion of an OLDER save must not clear a NEWER pending
          // draft (the newer draft's own success clears it when it lands).
          retireNoteDraft(id);
        }
        return true;
      } catch (e) {
        const reason = classifyStorageError(e);
        setStorageState(reason);
        callbacksRef.current.onStorageError?.(reason);
        if (latestNoteDrafts.current.get(id) === draft) setNoteSavePhase("error");
        return false;
      }
    },
    [retireNoteDraft],
  );

  /**
   * Issue #177 — start ONE note write for `pending` and track it in the
   * in-flight map (keyed by highlight id, carrying the exact payload). The
   * shared bookkeeping behind every write path: the debounce fire, the
   * fire-and-forget flush, and ensureNoteSaved's awaited step.
   *
   * On failure the failed payload is RE-ARMED as the pending draft (unless a
   * NEWER draft superseded it meanwhile) so the open editor's Retry can
   * re-attempt it — the ReviewNoteDialog committedRef re-arm discipline,
   * applied to the fire-and-forget paths too (a debounce-fire failure during
   * typing must leave the reader able to retry).
   */
  const startNoteWrite = useCallback(
    (pending: NoteDraft): Promise<boolean> => {
      // All callers (including debounce and lifecycle flushes) join the same
      // per-highlight queue. A later edit cannot finish before an older write.
      const previous = inFlightNoteSaves.current.get(pending.id)?.write;
      const write = (async () => {
        if (previous) await previous;
        const ok = await commitNoteSave(pending);
        if (
          !ok &&
          latestNoteDrafts.current.get(pending.id) === pending &&
          pendingNoteRef.current === null
        ) {
          pendingNoteRef.current = pending;
        }
        return ok;
      })().finally(() => {
        // An older completion must not remove a newer queued write.
        if (inFlightNoteSaves.current.get(pending.id)?.write === write) {
          inFlightNoteSaves.current.delete(pending.id);
        }
      });
      inFlightNoteSaves.current.set(pending.id, { text: pending.text, write });
      return write;
    },
    [commitNoteSave],
  );

  const scheduleNoteSave = useCallback(
    (id: string, text: string): void => {
      const draft: NoteDraft = { id, text };
      latestNoteDrafts.current.set(id, draft);
      pendingNoteRef.current = draft;
      setNoteSavePhase("pending");
      if (noteSaveTimer.current !== null) {
        window.clearTimeout(noteSaveTimer.current);
      }
      noteSaveTimer.current = window.setTimeout(() => {
        noteSaveTimer.current = null;
        const pending = pendingNoteRef.current;
        if (!pending) return;
        pendingNoteRef.current = null;
        startNoteWrite(pending);
      }, NOTE_SAVE_DEBOUNCE_MS);
    },
    [startNoteWrite],
  );

  /** Fire-and-forget flush of the pending note write (D2-03 — the dual-event
   *  flush + the editor's close-event safety net). Failure still surfaces
   *  through the register AND re-arms the draft: an open editor shows the
   *  error line + a working Retry. */
  const flushNoteSave = useCallback((): void => {
    if (noteSaveTimer.current !== null) {
      window.clearTimeout(noteSaveTimer.current);
      noteSaveTimer.current = null;
    }
    const pending = pendingNoteRef.current;
    if (!pending) return;
    pendingNoteRef.current = null;
    startNoteWrite(pending);
  }, [startNoteWrite]);

  /**
   * Issue #177 — the ONE awaitable note-save seam. Every dismissal path
   * (Done, Escape, outside click) and the Retry control await this; the
   * editor closes only on `true`. The loop settles the highlight's write
   * pipeline completely: an in-flight commit is awaited first (a dismissal
   * during a debounce-fire never races it), then a pending draft is flushed
   * — repeating while newer edits arrived mid-write so the LATEST text is
   * always what lands.
   *
   * Failure re-arms the failed payload as the pending draft (see
   * startNoteWrite) and resolves false; a NEWER draft typed during the
   * failing write supersedes the re-arm (the reader's latest words are what
   * a retry saves). The cross-highlight guard makes "a retry saved my draft
   * to the wrong highlight" impossible by construction: only drafts keyed
   * to `id` are ever written here.
   */
  const ensureNoteSaved = useCallback(
    async (id: string): Promise<boolean> => {
      for (;;) {
        const inFlight = inFlightNoteSaves.current.get(id);
        if (inFlight) {
          const ok = await inFlight.write;
          if (!ok) {
            // startNoteWrite re-armed the failed payload (unless a newer
            // draft superseded it) — either way the retry state is honest.
            return false;
          }
          continue;
        }
        const pending = pendingNoteRef.current;
        if (pending && pending.id !== id) {
          // Nothing unresolved for THIS highlight. Another highlight's live
          // draft is left COMPLETELY untouched — its debounce timer keeps
          // running, so its own flush still lands it (a foreign draft is
          // never cancelled, consumed, or written by this call).
          return true;
        }
        if (noteSaveTimer.current !== null) {
          window.clearTimeout(noteSaveTimer.current);
          noteSaveTimer.current = null;
        }
        if (!pending) {
          // Nothing unresolved for THIS highlight.
          return true;
        }
        pendingNoteRef.current = null;
        const ok = await startNoteWrite(pending);
        if (!ok) {
          // startNoteWrite re-armed the failed draft: the next Retry
          // re-attempts THE SAME {id, text} — never a different highlight's.
          return false;
        }
      }
    },
    [startNoteWrite],
  );

  const resetNoteSaveState = useCallback((): void => {
    setNoteSavePhase("idle");
  }, []);

  /**
   * Issue #178 — restore (or retire) the persisted recovery draft for `id`.
   * See the UseAnnotationStateResult doc for the full contract. Keyed reads
   * make cross-highlight attachment impossible by construction: a draft is
   * only ever loaded, applied, or deleted by ITS OWN highlight id. The
   * staleness gates resolve BEFORE any state changes, so a retired draft
   * can never resurrect retired writing over a newer landed note.
   */
  const restoreNoteDraft = useCallback(
    async (id: string): Promise<NoteDraft | null> => {
      let draft: NoteDraftRecord | null = null;
      try {
        draft = await loadNoteDraft(id);
      } catch {
        // Recovery is a best-effort net — a storage failure means no draft,
        // never a broken editor open.
        return null;
      }
      if (!draft) return null;
      if (draft.highlightId !== id) {
        // Defence in depth: a row whose highlightId FIELD disagrees with the
        // key it was read from is corrupt — it can never attach to THIS
        // highlight, so retire the row exactly where it was read (the keyed
        // read makes this branch unreachable in practice).
        retireNoteDraft(id);
        return null;
      }
      const text = draft.text;
      if (!hasNoteContent(text)) {
        // Whitespace-only: nothing recoverable (the shared note semantics) —
        // discard rather than restore invisible content.
        retireNoteDraft(id);
        return null;
      }
      // The landed note's freshness: the in-memory mirror when the highlight
      // is loaded, else a direct store read (a fast editor open can outrun
      // the eager load — staleness must not depend on load order).
      let resolvedNote = highlightsRef.current.find((h) => h.record.id === id)?.note ?? null;
      if (resolvedNote === null && !highlightsRef.current.some((h) => h.record.id === id)) {
        try {
          resolvedNote = await loadNote(id);
        } catch {
          // No readable note — treat as "no landed write" (the draft is
          // newer than nothing).
          resolvedNote = null;
        }
      }
      if (resolvedNote) {
        if (landedWriteIsNewer(resolvedNote.updatedAt, draft.updatedAt)) {
          // A NEWER landed write exists (e.g. the note was edited and saved
          // from the cross-library review panel meanwhile) — the draft is
          // stale; recovery must not resurrect older writing over newer.
          retireNoteDraft(id);
          return null;
        }
        if (resolvedNote.text === text) {
          // The interrupted save actually landed (the tab died between the
          // note put and the draft cleanup) — a stale duplicate; discard it
          // silently. Never re-attach what already persisted.
          retireNoteDraft(id);
          return null;
        }
      }
      return { id, text };
    },
    [retireNoteDraft],
  );

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

  // Issue #177 — on article swap/unmount, FLUSH the pending note draft
  // instead of dropping it. The debounce's timer cannot fire after the
  // hook's state is gone (the original reason for this cleanup, mirrored
  // from SettingsContext L169-177) — but a merely-SCHEDULED save must not
  // be lost when the reader navigates (the useScrollSave.saveLocationNow
  // lesson: unmount cleanup cancels pending debounces). The flush is
  // fire-and-forget: the async write survives the unmount (it only touches
  // IndexedDB + refs), so a chapter swap or Back-to-library still lands the
  // draft. A FAILED flush at this boundary routes through the register +
  // StorageBanner; the retry surface is the recovery ticket's scope
  // (browser-level interruption), in-app paths keep the editor open.
  useEffect(() => {
    return () => {
      if (noteSaveTimer.current !== null) {
        window.clearTimeout(noteSaveTimer.current);
        noteSaveTimer.current = null;
      }
      const pending = pendingNoteRef.current;
      pendingNoteRef.current = null;
      if (pending) {
        // Teardown must join the queue too: an older running write cannot
        // overwrite this final draft. Recovery after unmount remains separate.
        void startNoteWrite(pending);
      }
    };
  }, [article, startNoteWrite]);

  const updateNote = useCallback(
    (id: string, text: string): void => {
      // Optimistic in-memory update so the <mark>.has-note modifier + drawer
      // note text reflect immediately (no debounce on the visible state).
      // Issue #177 — empty OR whitespace-only commentary is no note (the
      // ONE shared hasNoteContent predicate, consistent with the drawer /
      // controls / review gates).
      setHighlights((prev) =>
        prev.map((h) => {
          if (h.record.id !== id) return h;
          const note: NoteRecord | null = hasNoteContent(text)
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
      // Schedule the debounced persistence write. Issue #178 — the
      // write-through recovery draft mirrors the edit immediately (no
      // debounce), so a tab closed mid-debounce still has its writing on
      // disk; the landed save's identity-gated cleanup retires the row.
      scheduleNoteSave(id, text);
      persistNoteDraft(id, text);
    },
    [scheduleNoteSave, persistNoteDraft],
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
    async <T>(args: {
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
      const previous = highlightsRef.current.find((h) => h.record.id === id)?.record.tags ?? [];
      await commitHighlightEdit({
        key: `tags:${id}`,
        applyOptimistic: (prev) =>
          prev.map((h) => (h.record.id === id ? { ...h, record: { ...h.record, tags } } : h)),
        // setHighlightTags normalizes + routes to the persisted casing
        // (tagsStore.ts) before touching the highlight row only; the routed
        // array mirrors the exact written casings back into the record.
        seam: () => setHighlightTags(id, tags),
        mirror: (routed) =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id ? { ...h, record: { ...h.record, tags: routed } } : h,
            ),
          ),
        rollback: () =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id ? { ...h, record: { ...h.record, tags: previous } } : h,
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
        highlightsRef.current.find((h) => h.record.id === id)?.record.color ?? "default";
      await commitHighlightEdit({
        key: `color:${id}`,
        // Optimistic in-memory record update so the picker's selection + the
        // rendered <mark> modifier reflect immediately.
        applyOptimistic: (prev) =>
          prev.map((h) => (h.record.id === id ? { ...h, record: { ...h.record, color } } : h)),
        seam: () => setHighlightColor(id, color),
        rollback: () =>
          setHighlights((prev) =>
            prev.map((h) =>
              h.record.id === id ? { ...h, record: { ...h.record, color: previous } } : h,
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
    ensureNoteSaved,
    restoreNoteDraft,
    noteSavePhase,
    resetNoteSaveState,
    updateHighlightTags,
    updateHighlightColor,
    storageState,
  };
}
