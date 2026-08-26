// src/reader/Header.tsx
// The app's persistent chrome (D2-02, READ-04). Slim (~48px) quiet top bar
// across ALL three destinations (Library, Highlights, Reader — D15-02)
// hosting the brand link + the shell destination nav (inline-start —
// D15-01), the article-scoped triggers + reading-mode toggle (inline-start
// of the gear — D4-09/D15-15), and the settings gear (inline-end).
// The wordmark is an <a href="#/"> brand link (Plan 15-02 / D15-05: brand
// always points to #/, the All view — same target as the cold fallback and
// BackToLibrary's fallback; one predictable home, no view-tracking href).
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
// Header geometry (READ-04 / D15-01): adding controls does NOT grow the
// header. The article-scoped triggers + toggle + gear share a
// .header-controls inline-flex group on the inline-end; the brand link +
// shell nav share a .header-start group inline-start. The row stays 48px —
// at ≤639px the wordmark visually collapses (the .visually-hidden clip —
// D15-17) while staying keyboard/SR-reachable, so destination links + the
// 44px icon buttons fit one row.
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
  /**
   * Plan 13-10 (G5): whether the tag popover is open. Drives the
   * tags-trigger's aria-expanded (the annotations-trigger discipline).
   */
  tagsOpen: boolean;
  /**
   * Plan 13-10 (G5): invoked when the reader clicks the tags-trigger. The
   * caller (App) owns the tag-popover open state (the drawerOpen pattern).
   */
  onToggleTags: () => void;
  /**
   * Plan 15-02 (D15-01/D15-02): the active destination, derived in App from
   * the view (list → "library", review → "highlights", article → "reader").
   * Drives the shell-nav aria-current discipline (D15-09): the Library link
   * carries aria-current="page" iff destination === "library", the
   * Highlights link iff destination === "highlights", and the brand link
   * NEVER carries it.
   */
  destination: "library" | "highlights" | "reader";
}

export function Header({
  onOpenSettings,
  settingsOpen,
  onToggleMode,
  articleMounted,
  annotationCount,
  drawerOpen,
  onToggleAnnotations,
  tagsOpen,
  onToggleTags,
  destination,
}: HeaderProps) {
  // Header is a useSettings consumer so the toggle's aria-pressed + glyph
  // reflect the LIVE preference without App prop-drilling. App stays unchanged.
  const { settings } = useSettings();
  return (
    <header className="app-header">
      {/*
        Plan 15-02 (D15-01): the brand link + the shell destination nav share
        ONE .header-start group — the single inline-start child of .app-header
        — so justify-content: space-between keeps the group left and
        .header-controls right with zero change to the 48px row.
      */}
      <div className="header-start">
        {/*
          D15-05: the wordmark is the brand link. href is the FIXED literal
          "#/" (never view-tracking) — activation lands the All view, the
          same target as the cold fallback and BackToLibrary's fallback.
          Accessible name is the text "Lem Reader" — NO aria-label, no
          "home" suffix (D15-10). The brand NEVER carries aria-current
          (D15-09); its semantic role is app-home, distinct from the Library
          destination link even though the href matches.
        */}
        <a className="app-wordmark" href="#/">
          Lem Reader
        </a>
        {/*
          Plan 15-02 (D15-02/D15-08): the persistent shell destination nav —
          present and identical on Library, Highlights, AND Reader (one
          shell, one rule). Exactly TWO text links (no Add destination —
          D15-08; no icon-only links at any width — D15-17). Plain <a href>
          links with NO onClick interception: activation assigns the hash,
          pushing a history entry (the desired Back semantics for
          destination navigation — D14-14), and modified clicks
          (middle/cmd/ctrl/shift/alt) fall through to native browser
          behavior. hrefs are fixed literals (same-origin by construction —
          T-14-04/T-15-04).
          Landmark label "Primary" is distinct from "Library views"
          (view-switcher) and "Book chapters" (chapter nav) so all three
          nav landmarks stay distinguishable in the a11y tree.
        */}
        <nav className="shell-nav" aria-label="Primary">
          <a
            href="#/"
            aria-current={destination === "library" ? "page" : undefined}
          >
            Library
          </a>
          <a
            href="#/highlights"
            aria-current={destination === "highlights" ? "page" : undefined}
          >
            Highlights
          </a>
        </nav>
      </div>
      {/*
        The inline-end controls share a .header-controls group so they sit
        adjacent (toggle inline-start of gear). justify-content:
        space-between on .app-header puts .header-start left + the group
        right; the group's inline-flex keeps the controls touching with a
        calm --space-sm gap.
      */}
      <div className="header-controls">
        {/*
          Plan 13-10 (G5 — the recorded user-direction change): tags-trigger
          button, inline-START of the annotations trigger so the group reads
          [tags] [annotations] [mode] [gear] — the tag affordance lives beside
          the reader controls, never inline under the article title. Mirrors
          the annotations-trigger geometry exactly: 44×44 hit area,
          transparent bg, --ink-soft default, --accent ONLY when
          [aria-expanded="true"]. Hidden when no article is mounted (same
          gating as the annotations trigger — tags are article-scoped).
        */}
        {articleMounted && (
          <button
            type="button"
            className="tags-trigger"
            onClick={onToggleTags}
            aria-label="Article tags"
            aria-haspopup="dialog"
            aria-expanded={tagsOpen}
          >
            <TagIcon aria-hidden="true" />
          </button>
        )}
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
        {/*
          Plan 15-02 (D15-15): ModeToggle joins the tags/annotations triggers
          behind the articleMounted gate — "pages vs scrolling" only means
          something with an article mounted. The Reader header reads
          [tags][annotations][mode][gear]; Library/Highlights read shell nav
          + gear only. The gear below stays UNGATED (D15-16: the settings
          panel is THE global-prefs mechanism, reachable on every surface).
          Article-scoped triggers stay in the shell header, NOT content
          headers (D15-18).
        */}
        {articleMounted && (
          <ModeToggle mode={settings.readingMode} onToggle={onToggleMode} />
        )}
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

/**
 * Plan 13-10 (G5) — tag-label glyph for the tags-trigger button. A quiet
 * inline-SVG icon (the classic tag silhouette with its pin dot); aria-hidden
 * because aria-label carries the accessible name. Mirrors the GearIcon /
 * HighlighterIcon anatomy exactly (same box, stroke, caps, joins).
 */
function TagIcon({ ariaHidden }: { ariaHidden?: "true" }) {
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
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
