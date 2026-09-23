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
import { GearIcon, HighlighterIcon, TagIcon, ContentsIcon } from "../ui/icons";

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
   * Phase 18 Plan 18-02 (D18-02): whether the TOC panel is open. Drives the
   * toc-trigger's aria-expanded (the tags-trigger discipline — but with NO
   * popup-hint attribute: the TOC panel is a non-modal popover, not a
   * dialog, and must never claim dialog semantics; Pitfall 3).
   */
  tocOpen: boolean;
  /**
   * Phase 18 Plan 18-02 (D18-02): invoked when the reader clicks the
   * toc-trigger. The caller (App) owns the TOC open state (the tagsOpen
   * pattern); ArticleView's toggle-event seam routes every close path back
   * through onCloseToc.
   */
  onToggleToc: () => void;
  /**
   * Plan 15-02 (D15-01/D15-02): the active destination, derived in App from
   * the view (list → "library", review → "highlights", article → "reader").
   * Drives the shell-nav aria-current discipline (D15-09): the Library link
   * carries aria-current="page" iff destination === "library", the
   * Highlights link iff destination === "highlights", and the brand link
   * NEVER carries it. Phase 18 also renders it as the data-destination
   * styling hook on .app-header (the ≤420px staged Reader collapse).
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
  tocOpen,
  onToggleToc,
  destination,
}: HeaderProps) {
  // Header is a useSettings consumer so the toggle's aria-pressed + glyph
  // reflect the LIVE preference without App prop-drilling. App stays unchanged.
  const { settings } = useSettings();
  return (
    <header className="app-header" data-destination={destination}>
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
          <span className="app-logo" aria-hidden="true" />
          <span className="visually-hidden">Lem Reader</span>
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
          Phase 18 Plan 18-02 (D18-02 — the 5th article-scoped trigger): the
          contents trigger, FIRST in the group so Reader reads
          [contents][tags][annotations][mode][gear]. Mirrors the tags-trigger
          anatomy exactly (44×44 quiet geometry, --ink-soft rest, --accent on
          hover and only when open) — but carries NO popup-hint attribute:
          the TOC panel is a non-modal popover, never a dialog (Pitfall 3 —
          the NotePopover VoiceOver blocker history). Gated by the same
          articleMounted condition as the tags trigger (the TOC is
          article-scoped; it never plays peekaboo — headingless articles
          open it too, D18-13).
        */}
        {articleMounted && (
          <button
            type="button"
            className="btn btn-icon toc-trigger"
            onClick={onToggleToc}
            aria-label="Table of contents"
            aria-expanded={tocOpen}
          >
            <ContentsIcon />
          </button>
        )}
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
            className="btn btn-icon tags-trigger"
            onClick={onToggleTags}
            aria-label="Article tags"
            aria-haspopup="dialog"
            aria-expanded={tagsOpen}
          >
            <TagIcon />
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
            className="btn btn-icon annotations-trigger"
            onClick={onToggleAnnotations}
            aria-label={
              annotationCount > 0
                ? `Highlights and notes, ${new Intl.NumberFormat(navigator.language).format(annotationCount)}`
                : "Highlights and notes"
            }
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <HighlighterIcon />
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
          [contents][tags][annotations][mode][gear]; Library/Highlights read shell nav
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
          className="btn btn-icon gear-button"
          onClick={onOpenSettings}
          aria-label="Reading settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
