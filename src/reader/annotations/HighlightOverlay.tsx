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
import type { TextPositionSelector } from "../../content/normalizeText";
import { captureSelection } from "../../annotations/capture";
import type { CaptureResult } from "../../annotations/capture";
import { rangesOverlap } from "../../annotations/overlap";
import { useAnnotationState } from "./useAnnotationState";
import type {
  AnnotationStorageState,
  ResolvedHighlight,
  UseAnnotationStateCallbacks,
} from "./useAnnotationState";

/**
 * The enriched capture result the SelectionToolbar consumes. Extends
 * CaptureResult (Plan 05-01) with the D5-13 overlap reason — the toolbar shows
 * "This overlaps an existing highlight." instead of the two action buttons when
 * the selection intersects a persisted range.
 */
export type ToolbarCaptureResult =
  | CaptureResult
  | { ok: false; reason: "overlap" };

/**
 * Result of creating a highlight from a selection. Carries the new id on
 * success (so the N shortcut can set openPopoverFor(newId)) and the typed
 * invalid reason on failure (so the toolbar shows the right hint).
 */
export type CreateFromSelectionResult =
  | {
      ok: true;
      highlightId: string;
      position: TextPositionSelector;
    }
  | {
      ok: false;
      reason:
        | "empty"
        | "multi-block"
        | "ineligible"
        | "measurement-body"
        | "overlap";
    };

export interface HighlightOverlayValue {
  /** Resolved highlights for the current article (D5-02 tri-state per record). */
  highlights: ResolvedHighlight[];
  /**
   * Capture the current selection + optionally create a highlight. Returns
   * the capture result WITHOUT creating a record for invalid selections
   * (multi-block / overlap / empty / ineligible / measurement-body) so the
   * toolbar can show the right hint.
   */
  createHighlightFromSelection: (
    readingRoot: HTMLElement,
  ) => Promise<CreateFromSelectionResult>;
  /**
   * Check the current selection validity (capture + D5-13 overlap check)
   * WITHOUT creating a highlight. Used by the SelectionToolbar's
   * selectionchange-driven display path so it can show buttons vs. invalid
   * hints on every selection change without persisting anything.
   */
  captureCurrentSelection: (readingRoot: HTMLElement) => ToolbarCaptureResult;
  /** Delete a highlight + cascade-delete its note (D5-12). */
  deleteHighlight: (id: string) => Promise<void>;
  /**
   * Update the note attached to a highlight. In-memory state updates
   * optimistically; persistence is DEBOUNCED (D2-03 pattern). Empty text =
   * no NoteRecord.
   */
  updateNote: (id: string, text: string) => void;
  /**
   * Flush any pending debounced note write immediately (D2-03). Called by
   * NotePopover on Done/Escape so no edit is lost.
   */
  flushNoteSave: () => void;
  /**
   * The highlight id whose NotePopover is open, or null. Owned here so the
   * SelectionToolbar + NotePopover coordinate through one source of truth.
   */
  openPopoverFor: string | null;
  setOpenPopoverFor: (id: string | null) => void;
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

const HighlightOverlayContext = createContext<HighlightOverlayValue | null>(
  null,
);

export function HighlightOverlayProvider({
  article,
  children,
  onStatusAnnounce,
  onStorageError,
  apiRef,
}: HighlightOverlayProviderProps) {
  const state = useAnnotationState(article, {
    onStatusAnnounce,
    onStorageError,
  });

  // openPopoverFor is owned HERE (not in useAnnotationState) because it's UI
  // coordination state, not persistence state. The SelectionToolbar (Task 2)
  // and NotePopover (Plan 05-03) both read/set through this one source.
  const [openPopoverFor, setOpenPopoverFor] = useState<string | null>(null);

  // Latest-highlights ref so the captureCurrentSelection closure reads the
  // freshest resolved set without re-creating on every state change (mirrors
  // ArticleView L307-308 handleToggleModeRef).
  const highlightsRef = useRef(state.highlights);
  highlightsRef.current = state.highlights;

  /**
   * Capture + D5-13 overlap check WITHOUT creating a highlight. Used by the
   * SelectionToolbar's selectionchange-driven display path so it can show
   * buttons vs. invalid hints on every selection change without persisting.
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
      if (overlapsExisting) {
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
    ): Promise<CreateFromSelectionResult> => {
      const capture = captureCurrentSelection(readingRoot);
      if (!capture.ok) {
        return { ok: false, reason: capture.reason };
      }
      const id = await state.createHighlight(capture.position);
      if (id === null) {
        // Persistence failed + was routed to StorageBanner; no highlight created.
        return { ok: false, reason: "ineligible" };
      }
      return { ok: true, highlightId: id, position: capture.position };
    },
    // article is captured transitively via captureCurrentSelection (which
    // depends on article). state provides createHighlight.
    [state, captureCurrentSelection],
  );

  const value = useMemo<HighlightOverlayValue>(
    () => ({
      highlights: state.highlights,
      createHighlightFromSelection,
      captureCurrentSelection,
      deleteHighlight: state.deleteHighlight,
      updateNote: state.updateNote,
      flushNoteSave: state.flushNoteSave,
      openPopoverFor,
      setOpenPopoverFor,
      storageState: state.storageState,
    }),
    [state, createHighlightFromSelection, captureCurrentSelection, openPopoverFor],
  );

  // Parent bridge: populate apiRef synchronously during render so the parent's
  // event handlers read the latest API via apiRef.current (mutable ref — safe
  // to assign during render; this is the "latest value" escape hatch React
  // docs sanction for parent-child imperative communication).
  if (apiRef) {
    apiRef.current = value;
  }

  return (
    <HighlightOverlayContext.Provider value={value}>
      {children}
    </HighlightOverlayContext.Provider>
  );
}

/**
 * Consume the highlight overlay context. Throws if used outside the provider
 * (mirrors SettingsContext.tsx L215-220 useSettings() guard).
 */
export function useHighlightOverlay(): HighlightOverlayValue {
  const ctx = useContext(HighlightOverlayContext);
  if (!ctx) {
    throw new Error(
      "useHighlightOverlay must be used inside <HighlightOverlayProvider>",
    );
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
