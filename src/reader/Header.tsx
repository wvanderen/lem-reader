// src/reader/Header.tsx
// The app's first persistent chrome (D2-02, READ-04). Slim (~48px) quiet top
// bar across BOTH existing views (FixtureList, ArticleView) hosting a wordmark
// (inline-start), the reading-mode toggle (inline-start of the gear — D4-09),
// and the settings gear (inline-end). NOT a <nav> — there are two controls.
// The wordmark is a <span>, NOT a link (UI-SPEC line 306: there is no global
// Home route; the fixture list lives at #/).
//
// Phase 4 Plan 04-04 (D4-09): Header is now a useSettings() CONSUMER — it
// reads settings.readingMode directly (no prop-drilling through App). The
// toggle's onToggle routes the D4-10 anchor capture: the caller (App) passes
// an onToggleMode that ArticleView intercepts synchronously before the
// render swap so the passage anchor is captured BEFORE the mode change
// commits (Pitfall 7). Header itself stays presentational — it just reads
// the mode for aria-pressed + the glyph and forwards the click.
//
// Quiet-chrome rule (D2-02, READ-04): no accent fill, no toolbar styling, no
// shadow. The gear is `--ink-soft` when closed and `--accent` only when
// [aria-expanded="true"] (UI-SPEC §Color accent-reserved list). The mode
// toggle is `--ink-soft` default and `--accent` ONLY when aria-pressed="true"
// (paginated active) — mirrors the gear's open/closed discipline. Copy is
// verbatim UI-SPEC §Copywriting.
//
// Header geometry (READ-04): adding the toggle does NOT grow the header. The
// toggle + gear share a .header-controls inline-flex group on the inline-end
// so the wordmark stays inline-start and the row stays 48px.
//
// Mirrors src/a11y/SkipLink.tsx minimal-component discipline (single
// responsibility, verbatim UI-SPEC microcopy, class hook matches CSS).

import { useSettings } from "../settings/SettingsContext";
import { ModeToggle } from "./ModeToggle";

interface HeaderProps {
  onOpenSettings: () => void;
  settingsOpen: boolean;
  /**
   * D4-09/D4-10: invoked when the reader clicks the mode toggle. The caller
   * (App) wires this to ArticleView's anchor-capturing handler so the
   * passage is preserved across the mode swap. When no article is mounted
   * (fixture list) the caller falls back to a plain SettingsContext.update().
   */
  onToggleMode: () => void;
  /**
   * Phase 5 Plan 05-03 (D5-09): true when an article is mounted so the
   * annotations-trigger appears only on the article view (hidden on the
   * fixture list where there are no highlights).
   */
  articleMounted: boolean;
  /**
   * Phase 5 Plan 05-03 (D5-09): the count of highlights for the current
   * article (resolved + unresolved). Shown as a superscript badge when >0
   * and included in the aria-label.
   */
  annotationCount: number;
  /**
   * Phase 5 Plan 05-03 (D5-09): whether the annotations drawer is open.
   * Drives the trigger's aria-expanded.
   */
  drawerOpen: boolean;
  /**
   * Phase 5 Plan 05-03 (D5-09): invoked when the reader clicks the
   * annotations-trigger. The caller (App) owns the drawer-open state.
   */
  onToggleAnnotations: () => void;
}

export function Header({
  onOpenSettings,
  settingsOpen,
  onToggleMode,
  articleMounted,
  annotationCount,
  drawerOpen,
  onToggleAnnotations,
}: HeaderProps) {
  // Header is a useSettings consumer so the toggle's aria-pressed + glyph
  // reflect the LIVE preference without App prop-drilling. App stays unchanged.
  const { settings } = useSettings();
  return (
    <header className="app-header">
      <span className="app-wordmark">Lem Reader</span>
      {/*
        The two inline-end controls share a .header-controls group so they sit
        adjacent (toggle inline-start of gear) and the wordmark stays inline-
        start. justify-content: space-between on .app-header puts the wordmark
        left + the group right; the group's inline-flex keeps the two controls
        touching with a calm --space-sm gap.
      */}
      <div className="header-controls">
        {/*
          Phase 5 Plan 05-03 (D5-09): annotations-trigger button inline-start of
          ModeToggle so the group reads [annotations] [mode] [gear] = [content]
          [view] [settings] — grouped by scope. Mirrors the gear-button geometry
          exactly: 44×44 hit area, transparent bg, --ink-soft default, --accent
          ONLY when [aria-expanded="true"]. Hidden when no article is mounted.
        */}
        {articleMounted && (
          <button
            type="button"
            className="annotations-trigger"
            onClick={onToggleAnnotations}
            aria-label={
              annotationCount > 0
                ? `Highlights and notes, ${new Intl.NumberFormat(navigator.language).format(annotationCount)}`
                : "Highlights and notes"
            }
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <HighlighterIcon aria-hidden="true" />
            {annotationCount > 0 && (
              <span className="annotations-trigger-badge" aria-hidden="true">
                {new Intl.NumberFormat(navigator.language).format(annotationCount)}
              </span>
            )}
          </button>
        )}
        <ModeToggle mode={settings.readingMode} onToggle={onToggleMode} />
        <button
          type="button"
          className="gear-button"
          onClick={onOpenSettings}
          aria-label="Reading settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          {/* Inline-SVG gear glyph — aria-hidden because aria-label carries the
              accessible name. Visible state change (closed vs open glyph) is the
              secondary cue beyond aria-expanded (forced-colors safety — UI-SPEC
              §Color contrast contract line 290). */}
          <GearIcon aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function GearIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Phase 5 Plan 05-03 — highlighter glyph for the annotations-trigger button.
 * A quiet inline-SVG marker icon; aria-hidden because aria-label carries the
 * accessible name. Mirrors the gear-button glyph discipline.
 */
function HighlighterIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M9 11l-6 6v3h3l6-6" />
      <path d="M12 8l4 4" />
      <path d="M17 3l4 4-9 9-4-4 9-9z" />
    </svg>
  );
}
