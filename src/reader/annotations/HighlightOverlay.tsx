// src/reader/annotations/HighlightOverlay.tsx
// Phase 5 Plan 05-02 — React context provider distributing resolved
// highlights + CRUD handlers (ANNO-01/05/06, STATE-03).
//
// Mirrors src/settings/SettingsContext.tsx structure (the codebase's first and
// only React context provider): createContext<Value | null>(null), a
// useHighlightOverlay() hook that throws if used outside the provider, and a
// useMemo'd value for referential stability.
//
// The provider holds the ResolvedHighlight[] state (delegated to
// useAnnotationState) + the openPopoverFor coordination state (Plan 05-03's
// NotePopover + this plan's SelectionToolbar share one source of truth). The
// createHighlightFromSelection entry point runs captureSelection (Plan 05-01)
// and returns the CaptureResult enriched with the D5-13 overlap check so the
// toolbar can show the right invalid hint WITHOUT creating a record for
// invalid selections.
//
// PARENT ACCESS (apiRef bridge): ArticleView mounts this provider around the
// article body but ALSO needs to call createHighlightFromSelection from its
// H/N keydown handler (which lives in ArticleView's own effect, not in a
// provider child). Splitting the 833-line ArticleView would be high-risk;
// instead the provider accepts an optional `apiRef` and populates
// `apiRef.current` synchronously during render so the parent reads the latest
// API without a context round-trip. This is the same "latest-value ref"
// pattern ArticleView already uses internally (L307-308
// handleToggleModeRef).
//
// D5-07 (link-inside-highlight): the renderer reuses sliceRunsForHighlights
// (Plan 05-01) so a link split by a highlight boundary stays active — this
// layer does NOT touch rendering (Task 2 threads highlights into
// BlockRenderer/InlineRenderer).
//
// STATE-05 routing: the provider never throws to the reader — onStorageError
// routes to the EXISTING StorageBanner (no new surface) and reading continues
// with in-memory state (D2-13).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ReactNode } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { HighlightColor, HighlightSlot } from "../../content/schema";
import { defaultHighlightSlots } from "../../content/schema";
import type { TextPositionSelector } from "../../content/normalizeText";
import { captureSelection } from "../../annotations/capture";
import type { CaptureResult } from "../../annotations/capture";
import { rangesOverlap } from "../../annotations/overlap";
// Issue #195 — the slot→creation-payload type threaded from the creation
// routes (ordinary routes pass the explicit default slot; a slot activation
// passes that slot).
import type { HighlightSlotPreset } from "../../annotations/highlightSlots";
// Issue #196 — the active-theme base pair the custom-color tints derive
// against (host-fed; see HighlightOverlayValue.bases).
import type { HighlightTintBases } from "../../settings/highlightTint";
import { useAnnotationState } from "./useAnnotationState";
import type {
  AnnotationStorageState,
  NoteDraft,
  NoteSavePhase,
  ResolvedHighlight,
  UseAnnotationStateCallbacks,
} from "./useAnnotationState";

/**
 * The enriched capture result the SelectionToolbar consumes. Extends
 * CaptureResult (Plan 05-01) with the D5-13 overlap reason — the toolbar shows
 * "This overlaps an existing highlight." instead of the two action buttons when
 * the selection intersects a persisted range.
 */
export type ToolbarCaptureResult = CaptureResult | { ok: false; reason: "overlap" };

/**
 * Result of creating a highlight from a selection. Carries the new id on
 * success (so the N shortcut can set openPopoverFor(newId)) and the typed
 * invalid reason on failure (so the toolbar shows the right hint).
 *
 * Phase 19: kept aligned with CaptureResult's reason union in ONE commit
 * with capture.ts (the D5-06 multi-block literal retired; the span-era
 * "boundary-ineligible" + defensive "empty-span" added).
 */
export type CreateFromSelectionResult =
  | {
      ok: true;
      highlightId: string;
      position: TextPositionSelector;
      /**
       * Issue #195 — the validated capture the creation actually used, so
       * the toolbar's Undo flip re-displays the REAL capture result (never
       * a reconstruction). Consumers that don't need it ignore the field.
       */
      capture: ToolbarCaptureResult & { ok: true };
    }
  | {
      ok: false;
      reason:
        | "empty"
        | "ineligible"
        | "measurement-body"
        | "boundary-ineligible"
        | "empty-span"
        | "overlap";
    };

/**
 * Issue #175 — an activation request for the lightweight highlight controls.
 * `rect` is the anchor mark's viewport rect captured at activation time (the
 * controls position from it once, like the selection toolbar's saved rect —
 * no live re-tracking); `focus` distinguishes the keyboard activation path
 * (Enter/Space on a focused <mark> moves focus INTO the controls) from the
 * pointer path (click leaves focus where the browser put it — the mark).
 */
export interface ControlsRequest {
  id: string;
  /** The anchor mark's viewport rect captured at activation time. */
  rect: DOMRect;
  focus: boolean;
}

export interface HighlightOverlayValue {
  /** The canonical article the overlay resolves highlights against (issue
   *  #194 — the Copy action's verified paragraph-break derivation). */
  article: CanonicalArticle;
  /** Resolved highlights for the current article (D5-02 tri-state per record). */
  highlights: ResolvedHighlight[];
  /**
   * Issue #195 — the settings' five numbered highlight slots (the shipped
   * set when no settings are wired). The annotation panel's "Apply slot"
   * section reads them from THIS context, so the panel needs no settings
   * dependency — the host (ArticleView) feeds its settings record in.
   */
  highlightSlots: HighlightSlot[];
  /**
   * Issue #196 — the ACTIVE theme's surface + ink pair (HighlightTintBases),
   * fed by the host (ArticleView) from its settings record; the render-side
   * mapping sites (BlockRenderer + PaginatedSurface) derive each custom
   * color's readable tint against it (the ONE readableHighlightTint seam —
   * preview = render by construction). Undefined when the host wires no
   * settings (provider-less tests): custom snapshots keep their named/
   * Default fallback rendering.
   */
  bases?: HighlightTintBases;
  /**
   * Capture the current selection + optionally create a highlight. Returns
   * the capture result WITHOUT creating a record for invalid selections
   * (overlap / empty / empty-span / ineligible / boundary-ineligible /
   * measurement-body) so the toolbar can show the right hint.
   * Issue #195: `preset` carries the creating slot's color + tags — every
   * route passes its slot's payload (the explicit default slot for ordinary
   * creation), so creation copies color + tags onto the record in ONE path.
   */
  createHighlightFromSelection: (
    readingRoot: HTMLElement,
    preset?: HighlightSlotPreset,
  ) => Promise<CreateFromSelectionResult>;
  /**
   * Check the current selection validity (capture + D5-13 overlap check)
   * WITHOUT creating a highlight. Used by the SelectionToolbar's
   * selectionchange-driven display path so it can show buttons vs. invalid
   * hints on every selection change without persisting anything.
   */
  captureCurrentSelection: (readingRoot: HTMLElement) => ToolbarCaptureResult;
  /**
   * Delete a highlight + cascade-delete its note (D5-12). Issue #174 failure
   * contract: on a failed write the in-memory removal rolls back, the error
   * routes to StorageBanner, and the error RETHROWS — modal hosts keep
   * themselves open with an inline failure line; fire-and-forget callers
   * attach a no-op catch.
   */
  deleteHighlight: (id: string) => Promise<void>;
  /**
   * Update the note attached to a highlight. In-memory state updates
   * optimistically; persistence is DEBOUNCED (D2-03 pattern). Empty or
   * whitespace-only text = no NoteRecord (issue #177 — the shared
   * hasNoteContent semantics).
   */
  updateNote: (id: string, text: string) => void;
  /**
   * Fire-and-forget flush of any pending debounced note write (D2-03) —
   * the dual-event flush + the editor's close-event safety net.
   */
  flushNoteSave: () => void;
  /**
   * Issue #177 — the awaitable note-save seam. Done / Escape / outside-click
   * dismissal and Retry await this; the editor closes only on `true`. Never
   * writes a draft keyed to a different highlight than `id` (the cross-
   * highlight retry guard). See useAnnotationState for the full contract.
   */
  ensureNoteSaved: (id: string) => Promise<boolean>;
  /**
   * Issue #178 — restore the persisted recovery draft for `id` (the
   * highlight's own — never another's), or null when there is nothing to
   * recover (no draft, whitespace-only, equal to the landed note, or older
   * than a newer landed write). The editor host applies a resolved draft
   * via updateNote and marks the session "Recovered draft". See
   * useAnnotationState for the full contract.
   */
  restoreNoteDraft: (id: string) => Promise<NoteDraft | null>;
  /**
   * Issue #177 — the note editor's save-state register ("idle" | "pending" |
   * "saving" | "saved" | "error"). "error" keeps the editor open with the
   * honest-failure line + Retry; "saved" only ever reflects a landed write.
   */
  noteSavePhase: NoteSavePhase;
  /** Reset the save-state register to "idle" (the fresh-editor-open reset). */
  resetNoteSaveState: () => void;
  /**
   * Replace the tag array on a highlight (issue #116). In-memory state
   * updates optimistically; the write runs through the ONE tagsStore seam
   * (existing library vocabulary, highlight row only). The attached note
   * shares the highlight's tags — no separate note tag set.
   */
  updateHighlightTags: (id: string, tags: string[]) => Promise<void>;
  /**
   * Set the color state on a highlight (issue #118; issue #196 adds the
   * optional custom snapshot — pass `customColor` to snapshot one, omit it
   * to clear: a named pick removes the override). In-memory state updates
   * optimistically; the write runs through the ONE highlightsStore seam.
   * Color never gates editability or anchoring — it stays settable on
   * ambiguous/orphaned highlights exactly like tags.
   */
  updateHighlightColor: (id: string, color: HighlightColor, customColor?: string) => Promise<void>;
  /**
   * Issue #195 — the ONE slot-application seam for an existing highlight
   * (color + additive tags, one write order, one compensating rollback).
   * Both apply surfaces (toolbar saved-state tap, panel "Apply slot") call
   * this — see useAnnotationState for the full contract.
   */
  applyHighlightSlot: (id: string, slot: HighlightSlot) => Promise<void>;
  /** Explicit note-entry request (N, selection actions, or drawer Edit note).
   * Opens the unified annotation panel with focus in the note. */
  openPopoverFor: string | null;
  setOpenPopoverFor: (id: string | null) => void;
  /** Passage activation request for the unified annotation panel. Existing
   * notes appear immediately; initial focus stays in the controls. */
  controlsFor: ControlsRequest | null;
  setControlsFor: (request: ControlsRequest | null) => void;
  /**
   * Issue #175 — the highlight whose two-step delete confirm is open in the
   * editor dialog, or null. The confirm step is reachable ONLY from
   * HighlightControls' Delete (and the drawer's Delete) for highlights with
   * a nonempty note — the no-note delete runs immediately at the call site.
   */
  confirmDeleteFor: string | null;
  setConfirmDeleteFor: (id: string | null) => void;
  /** Storage health (STATE-05) — routes to the existing StorageBanner. */
  storageState: AnnotationStorageState;
}

export interface HighlightOverlayProviderProps {
  article: CanonicalArticle;
  children: ReactNode;
  /** Polite announce for consequential events (D5-12, A11Y-08). */
  onStatusAnnounce?: UseAnnotationStateCallbacks["onStatusAnnounce"];
  /** Storage-error classification (STATE-05) — routes to StorageBanner. */
  onStorageError?: UseAnnotationStateCallbacks["onStorageError"];
  /**
   * Issue #195 — edit notification for the creation-Undo register (see
   * UseAnnotationStateCallbacks). Fired when a highlight edit targets a
   * highlight (note/tags/color/deletion); the host retires the toolbar's
   * Undo offer for that highlight.
   */
  onHighlightEdited?: UseAnnotationStateCallbacks["onHighlightEdited"];
  /**
   * Issue #195 — the settings' five numbered highlight slots, fed by the
   * host (ArticleView) from its settings record. Defaults to the shipped
   * set so tests and callers without settings keep the pre-slot behavior.
   */
  highlightSlots?: HighlightSlot[];
  /**
   * Issue #196 — the ACTIVE theme's surface + ink pair (the
   * HighlightTintBases the custom-color tints derive against), fed by the
   * host from its settings record. Undefined (tests/callers without
   * settings) keeps the named/Default fallback rendering.
   */
  highlightBases?: HighlightTintBases;
  /**
   * Optional parent-owned ref the provider populates with its API value so
   * the PARENT (ArticleView) can call createHighlightFromSelection from its
   * own keydown handler without consuming the context (a parent cannot
   * useContext its own child's provider). The provider writes
   * `apiRef.current = value` synchronously during render; the parent reads
   * `apiRef.current` inside its event handlers (refs are mutable so this is
   * always the latest API). See header comment "PARENT ACCESS".
   */
  apiRef?: MutableRefObject<HighlightOverlayValue | null>;
}

/**
 * Issue #190 — the ONE overlap-refusal copy, shared by the two sanctioned
 * surfaces (the SelectionToolbar hint + the create-path status-region
 * announcement; CONTRIBUTING's two-surface rule — promote to a component or
 * shared module only if a third surface appears). The e2e anchor
 * (/overlaps an existing highlight/i) pins both.
 */
export const OVERLAP_REFUSAL_COPY = "This overlaps an existing highlight.";

/** A captured range awaiting its first optimistic state render. */
interface PendingCreate {
  article: CanonicalArticle;
  position: TextPositionSelector;
}

const HighlightOverlayContext = createContext<HighlightOverlayValue | null>(null);

export function HighlightOverlayProvider({
  article,
  children,
  onStatusAnnounce,
  onStorageError,
  onHighlightEdited,
  highlightSlots,
  highlightBases,
  apiRef,
}: HighlightOverlayProviderProps) {
  const state = useAnnotationState(article, {
    onStatusAnnounce,
    onStorageError,
    onHighlightEdited,
  });

  // openPopoverFor is owned HERE (not in useAnnotationState) because it's UI
  // coordination state, not persistence state. The SelectionToolbar (Task 2)
  // and NotePopover (Plan 05-03) both read/set through this one source.
  const [openPopoverFor, setOpenPopoverFor] = useState<string | null>(null);
  // Entry requests belong to one annotation session.
  // Closing that session clears all three coordination fields together.
  const [controlsFor, setControlsFor] = useState<ControlsRequest | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);
  // Issue #195 — the slot configuration the annotation panel reads through
  // this context (shipped fallback when the host wires no settings).
  const resolvedSlots = highlightSlots ?? defaultHighlightSlots();

  // Latest-highlights ref so the captureCurrentSelection closure reads the
  // freshest resolved set without re-creating on every state change (mirrors
  // ArticleView L307-308 handleToggleModeRef).
  const highlightsRef = useRef(state.highlights);
  highlightsRef.current = state.highlights;

  // Issue #190 — the in-flight creation register (see PendingCreate). Every
  // overlap check consults it; pruning happens at render (below).
  const pendingCreatesRef = useRef<PendingCreate[]>([]);

  // Latest announce callback for the create-path refusal announcement (the
  // same latest-callback-ref discipline useAnnotationState uses for its
  // callbacks; the prop identity can drift per render).
  const onStatusAnnounceRef = useRef(onStatusAnnounce);
  onStatusAnnounceRef.current = onStatusAnnounce;

  // Once rendered state covers a pending range, the normal overlap check
  // owns it. Do not wait for persistence to return its id: the optimistic
  // highlight can be deleted before that save finishes.
  if (pendingCreatesRef.current.length > 0) {
    pendingCreatesRef.current = pendingCreatesRef.current.filter(
      (p) =>
        p.article === article &&
        !state.highlights.some(
          (h) =>
            h.resolvedPosition?.start === p.position.start &&
            h.resolvedPosition.end === p.position.end,
        ),
    );
  }

  /**
   * Capture + D5-13 overlap check WITHOUT creating a highlight. Used by the
   * SelectionToolbar's selectionchange-driven display path so it can show
   * buttons vs. invalid hints on every selection change without persisting.
   * Issue #190: the check covers committed highlights AND in-flight
   * creations, so a rapid repeated attempt is refused in the window before
   * the first attempt's prepend commits.
   */
  const captureCurrentSelection = useCallback(
    (readingRoot: HTMLElement): ToolbarCaptureResult => {
      const capture = captureSelection(article, readingRoot);
      if (!capture.ok) return capture;
      // D5-13 disjoint-range check: reject overlap with ANY existing highlight.
      const overlapsExisting = highlightsRef.current.some((h) => {
        const pos = h.resolvedPosition;
        if (!pos) return false; // ambiguous/orphan — no confident range
        return rangesOverlap(capture.position, pos);
      });
      // Issue #190 — the same refusal against creations still in flight
      // (registered synchronously; their optimistic state may not have
      // committed yet).
      const overlapsPending = pendingCreatesRef.current.some((p) =>
        rangesOverlap(capture.position, p.position),
      );
      if (overlapsExisting || overlapsPending) {
        return { ok: false, reason: "overlap" };
      }
      return capture;
    },
    // article is captured in the closure (used by captureSelection). The
    // callback must be recreated when the article changes so the capture
    // runs against the right article's block structure.
    [article],
  );

  const createHighlightFromSelection = useCallback(
    async (
      readingRoot: HTMLElement,
      preset?: HighlightSlotPreset,
    ): Promise<CreateFromSelectionResult> => {
      const capture = captureCurrentSelection(readingRoot);
      if (!capture.ok) {
        if (capture.reason === "overlap") {
          // Issue #190 — the refusal must be EXPLAINED on every creation
          // route, including the ones with no mounted toolbar at refusal
          // time (a rapid repeated shortcut fires after the toolbar
          // cleared). Same concise copy as the SelectionToolbar hint (the
          // shared OVERLAP_REFUSAL_COPY above — one string, two surfaces per
          // the CONTRIBUTING two-surface rule), via the existing status-
          // region convention (D5-12).
          onStatusAnnounceRef.current?.(OVERLAP_REFUSAL_COPY);
        }
        return { ok: false, reason: capture.reason };
      }
      // Issue #190 — register the in-flight range SYNCHRONOUSLY, before the
      // first await, so no second attempt can slip through the commit
      // window. The next optimistic render transfers ownership to state;
      // a failed creation releases the entry immediately.
      const pending: PendingCreate = { article, position: capture.position };
      const releasePending = (): void => {
        pendingCreatesRef.current = pendingCreatesRef.current.filter((p) => p !== pending);
      };
      pendingCreatesRef.current.push(pending);
      try {
        // Issue #195 — the creating slot's color + tags ride the record; the
        // validated capture rides the RESULT (the toolbar's Undo flip).
        const id = await state.createHighlight(capture.position, preset);
        if (id === null) {
          // Contract-defensive: the current useAnnotationState honors D2-13
          // (a failed save keeps the in-memory highlight and still resolves
          // the id), so null is unreachable today. If the contract ever
          // tightens to "null = nothing exists", releasing here keeps the
          // guard honest — a later attempt must be judged on the real state.
          releasePending();
          return { ok: false, reason: "ineligible" };
        }
        return { ok: true, highlightId: id, position: capture.position, capture };
      } catch (e) {
        // No highlight was created (the throw precedes any state change) —
        // release the guard immediately.
        releasePending();
        throw e;
      }
    },
    // article is captured transitively via captureCurrentSelection (which
    // depends on article). state provides createHighlight.
    [article, state, captureCurrentSelection],
  );

  const value = useMemo<HighlightOverlayValue>(
    () => ({
      article,
      highlights: state.highlights,
      highlightSlots: resolvedSlots,
      bases: highlightBases,
      createHighlightFromSelection,
      captureCurrentSelection,
      deleteHighlight: state.deleteHighlight,
      updateNote: state.updateNote,
      flushNoteSave: state.flushNoteSave,
      ensureNoteSaved: state.ensureNoteSaved,
      restoreNoteDraft: state.restoreNoteDraft,
      noteSavePhase: state.noteSavePhase,
      resetNoteSaveState: state.resetNoteSaveState,
      updateHighlightTags: state.updateHighlightTags,
      updateHighlightColor: state.updateHighlightColor,
      applyHighlightSlot: state.applyHighlightSlot,
      openPopoverFor,
      setOpenPopoverFor,
      controlsFor,
      setControlsFor,
      confirmDeleteFor,
      setConfirmDeleteFor,
      storageState: state.storageState,
    }),
    [
      article,
      state,
      createHighlightFromSelection,
      captureCurrentSelection,
      resolvedSlots,
      highlightBases,
      openPopoverFor,
      controlsFor,
      confirmDeleteFor,
    ],
  );

  // Parent bridge: populate apiRef synchronously during render so the parent's
  // event handlers read the latest API via apiRef.current (mutable ref — safe
  // to assign during render; this is the "latest value" escape hatch React
  // docs sanction for parent-child imperative communication).
  if (apiRef) {
    apiRef.current = value;
  }

  return (
    <HighlightOverlayContext.Provider value={value}>{children}</HighlightOverlayContext.Provider>
  );
}

/**
 * Consume the highlight overlay context. Throws if used outside the provider
 * (mirrors SettingsContext.tsx L215-220 useSettings() guard).
 */
export function useHighlightOverlay(): HighlightOverlayValue {
  const ctx = useContext(HighlightOverlayContext);
  if (!ctx) {
    throw new Error("useHighlightOverlay must be used inside <HighlightOverlayProvider>");
  }
  return ctx;
}

/**
 * Safe context read — returns null outside the provider. Used by callers that
 * may render inside OR outside the provider (e.g. ArticleBody in the
 * measurement-body path renders without a provider ancestor).
 */
function useOptionalHighlightOverlay(): HighlightOverlayValue | null {
  return useContext(HighlightOverlayContext);
}

export { useOptionalHighlightOverlay };
