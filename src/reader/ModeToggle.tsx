// src/reader/ModeToggle.tsx
// D4-09 (PAGE-01, A11Y-01/02/07, READ-04): the quiet reading-mode toggle that
// lives in the slim header, inline-start of the gear. Clicking it (or pressing
// the M shortcut — registered in PageTurnControls) flips `readingMode` via the
// parent's onToggle, which routes through SettingsContext.update() (live-apply
// + debounced persist — D2-03).
//
// The toggle is a `<button type="button" class="mode-toggle" aria-pressed>`
// with an inline-SVG glyph that swaps between a paginated icon (single page)
// and a scrolling icon (continuous flow). The glyph change is the SECONDARY
// cue beyond aria-pressed — it must be perceivable in forced-colors (no
// color-alone meaning — UI-SPEC §Color contrast contract).
//
// Quiet-chrome rule (D4-09 + READ-04): --ink-soft default; --accent ONLY when
// aria-pressed="true" (paginated active) — mirrors the gear-button open/closed
// discipline. No accent fill, no toolbar styling, no shadow. Min 44×44px hit
// area (A11Y-07).
//
// Live announce (A11Y-08): a visually-hidden polite live region announces
// "Switched to paginated reading." / "Switched to scrolling reading." on mode
// change. Mirrors SectionAnnouncer's timerRef-debounce pattern so rapid
// toggles do not flood the live region.
//
// Presentational + minimal — ModeToggle does NOT read useSettings() itself;
// the parent (Header) owns the live-apply path so the D4-10 mode-switch anchor
// capture (ArticleView) can intercept the toggle synchronously BEFORE the
// render swap (Pitfall 7).

import { useEffect, useRef, useState } from "react";
import { PaginatedIcon, ScrollingIcon } from "../ui/icons";

export type ReadingMode = "paginated" | "scrolling";

interface ModeToggleProps {
  /** Current reading mode — drives aria-pressed + the glyph + the announce copy. */
  mode: ReadingMode;
  /** Invoked on click. The parent routes this through SettingsContext.update(). */
  onToggle: () => void;
}

/**
 * ModeToggle — header reading-mode switch. The announce fires on mode CHANGE
 * (detected via a prevMode ref) so it covers BOTH the click path AND the M
 * keyboard shortcut (which flips the same preference via a different route).
 */
export function ModeToggle({ mode, onToggle }: ModeToggleProps): React.ReactElement {
  const isPaginated = mode === "paginated";
  const [announce, setAnnounce] = useState("");
  const prevModeRef = useRef<ReadingMode>(mode);
  const timerRef = useRef<number | null>(null);

  // Announce on mode change. Covers click + M shortcut (both flip the same
  // preference → this component re-renders with the new `mode` prop). The
  // timerRef debounce mirrors SectionAnnouncer L69-78 so rapid toggles
  // reflect the FINAL mode, not every intermediate.
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      // UI-SPEC §Copywriting: concise, names the new mode, never the offset math.
      setAnnounce(
        mode === "paginated"
          ? "Switched to paginated reading."
          : "Switched to scrolling reading.",
      );
    }, 0);
  }, [mode]);

  // Cleanup the debounce timer on unmount so it cannot fire after the toggle
  // is gone (no setState-after-unmount warning).
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="mode-toggle"
        aria-pressed={isPaginated}
        aria-label={`Reading mode: ${mode}`}
        onClick={onToggle}
      >
        {/*
          Visible glyph state (forced-colors safety — UI-SPEC §Interaction 15):
          swaps between a single-page icon (paginated) and a continuous-scroll
          icon (scrolling). aria-hidden because aria-label carries the name.
          viewBox 0 0 24 24 + stroke currentColor mirrors the gear/chevron
          glyph discipline so the three header icons read as one family.
        */}
        {isPaginated ? <PaginatedIcon aria-hidden="true" /> : <ScrollingIcon aria-hidden="true" />}
      </button>
      {/* Polite live region — mirrors SectionAnnouncer's role="status" pattern. */}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announce}
      </div>
    </>
  );
}

// ── Inline mode glyphs ──────────────────────────────────────────────────────
// Mirrors Header.tsx GearIcon + PaginatedSurface.tsx ChevronIcon discipline:
// inline SVG, viewBox 0 0 24 24, stroke currentColor, focusable="false" so the
// glyph never enters the focus order. aria-hidden because the button's
// aria-label carries the accessible name.


