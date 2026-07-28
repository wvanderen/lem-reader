// src/a11y/SkipLink.tsx
// First focusable element in DOM order (UI-SPEC §Component Inventory + §Interaction 1).
// The copy is the verbatim UI-SPEC §Copywriting microcopy. The .skip-link class
// is styled in app.css to be visually hidden until focused.
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to article
    </a>
  );
}
