// src/reader/StorageBanner.tsx
// Dismissible storage-failure status banner (D2-13, UI-SPEC §Interaction 13 +
// §Copywriting lines 325–327 + §Component Inventory line 465). Surfaces
// `storageState === "unavailable"` so the reader knows their changes won't
// be kept this session — reading continues uninterrupted with in-memory
// defaults (D2-13 — non-blocking).
//
// Mirrors the `.status` card pattern from src/routes/ArticleView.tsx lines
// 52–64 (role="status" + aria-live="polite" + .status card styling). NON-
// modal: this banner does NOT trap focus and does NOT block reading. The
// dismiss × button records a session-scoped "don't show again" flag in
// App.tsx (D2-13). Copy is verbatim UI-SPEC §Copywriting lines 325–327 —
// never leaks jargon like "database" / "IndexedDB" / "corrupt" (T-02-07).
interface StorageBannerProps {
  /** Invoked when the reader dismisses the banner (× button). */
  onDismiss: () => void;
}

export function StorageBanner({ onDismiss }: StorageBannerProps) {
  return (
    <div
      className="status storage-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="storage-banner-main">
        <h2>Your reading settings can&apos;t be saved right now.</h2>
        <p>
          Local storage is unavailable, so changes won&apos;t be kept after you
          close this tab. You can keep reading.
        </p>
      </div>
      <button
        type="button"
        className="storage-banner-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        {/* aria-label carries the accessible name; the × glyph is decorative. */}
        <DismissIcon aria-hidden="true" />
      </button>
    </div>
  );
}

function DismissIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
