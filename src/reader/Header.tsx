// src/reader/Header.tsx
// The app's first persistent chrome (D2-02, READ-04). Slim (~48px) quiet top
// bar across BOTH existing views (FixtureList, ArticleView) hosting only a
// wordmark (inline-start) and the settings gear (inline-end). NOT a <nav> —
// there is a single control. The wordmark is a <span>, NOT a link (UI-SPEC
// line 306: there is no global Home route; the fixture list lives at #/).
//
// Quiet-chrome rule (D2-02, READ-04): no accent fill, no toolbar styling, no
// shadow. The gear is `--ink-soft` when closed and `--accent` only when
// [aria-expanded="true"] (UI-SPEC §Color accent-reserved list). Copy is
// verbatim UI-SPEC §Copywriting.
//
// Mirrors src/a11y/SkipLink.tsx minimal-component discipline (single
// responsibility, verbatim UI-SPEC microcopy, class hook matches CSS).
interface HeaderProps {
  onOpenSettings: () => void;
  settingsOpen: boolean;
}

export function Header({ onOpenSettings, settingsOpen }: HeaderProps) {
  return (
    <header className="app-header">
      <span className="app-wordmark">Lem Reader</span>
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
