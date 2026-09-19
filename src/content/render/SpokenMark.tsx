// src/content/render/SpokenMark.tsx
// Issue #42 — the ONE rendering anatomy of the synthetic spoken-word marker,
// shared by both render twins (InlineRenderer's prose path and
// BlockRenderer's code-block path): a purely visual, ARIA-HIDDEN,
// non-focusable <mark>. No tabIndex, no label, no DOM id, no
// data-highlight-id — per-word updates never enter the accessibility tree,
// never receive focus, and can never trigger the annotation popover or the
// drawer jump targets. Distinct class → distinct calm styling
// (app.css mark.spoken-word: shape-distinct from annotation fills,
// layout-neutral, animation-free).
export function SpokenMark({ children }: { children: React.ReactNode }) {
  return (
    <mark className="spoken-word" aria-hidden="true">
      {children}
    </mark>
  );
}
