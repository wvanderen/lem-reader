# Compact selection toolbar

Status: design confirmed by the reader; implemented, with targeted verification recorded below.

## Intent and scope

Refresh the selection toolbar into a compact, calm, theme-aware surface. Borrow the economy of an icon-and-swatch action bar without copying its literal black appearance or sacrificing accessible operation.

This is a presentation and interaction refresh, not a change to the annotation model. Highlight slots remain five configurable save presets, not fixed semantic categories. Slot activation copies its configured payload into a new highlight; it does not establish a live slot relationship.

Related decisions: [custom highlight tints](../adr/0008-custom-highlight-tints.md), [armed-hold creation and Escape grace](../adr/0009-armed-hold-creation-and-escape-grace.md), including amendments. This confirmed refresh supersedes ADR 0009's November 2 presentation requirement for a persistent visible lead label and per-pill tooltips: the group retains its accessible save-action name, and the shared on-demand label carries the save verb and slot name. Preserve the ADRs' creation, keyboard, and undo contracts. The touch label-inspection hold below is distinct from digit-held pointer-sweep creation.

## Controls and layout

- Present five tinted highlight-slot controls with visible identifiers **1–5**, followed by a recognizable note icon for **Highlight + note**.
- Do not add Copy, a separate default-save button, or a confirmation step.
- Activating a slot immediately saves and dismisses the toolbar. The note action retains its existing creation-and-open-editor behavior.
- Do not give slots selected/saved styling. The explicit default slot has no special checkmark; identify its default status in its on-demand label.
- Prefer one row when space permits. When it cannot fit, use a deliberate fallback with the five slots grouped together and the note action below. Do not use arbitrary action wrapping, horizontal scrolling, or a hidden overflow menu. At enlarged scales where the slot group itself cannot fit on one line, use orderly reflow rather than shrinking or clipping targets.
- Preserve the existing 44px minimum button height, usable touch targets, and visible focus. The visible swatch may be smaller than its hit target.
- Ensure numbers remain readable with custom colors and every supported theme. Color alone never identifies a slot; different slots may share a color.
- Retain the reader's theme-aware styling and reduced-motion behavior; introduce no toolbar animations.

## On-demand labels

- Hover, keyboard focus, or touch hold reveals one shared label area beneath the controls.
- Slot labels expose the full action, number, and custom name, for example, “Save as 4: Key Quotation.” Include default-slot status when applicable.
- Label the note control “Highlight + note.”
- Full custom names, including 40-character unbroken names, must remain available without truncation. Allow label wrapping.
- Showing a label must not move the controls or cover their targets. Keep the label associated with the active control without making pointer interaction unstable.
- Preserve full accessible slot names (“Slot N: name”) and accessible action descriptions. Keep the toolbar and slot-group accessible names.

## Touch inspection

- Ordinary tap continues to save immediately; do not require two taps for normal activation.
- Press-and-hold reveals the slot name without saving. Releasing that inspection hold must not create a highlight or synthesize a save through a subsequent click event. A subsequent intentional tap may save.
- Provide an accessible interaction description explaining “Tap to save; hold to show name.”
- Hold is an optional inspection route, not a requirement for saving, adding a note, or obtaining accessible names. Keyboard focus reveals labels; assistive technology receives full names.
- Do not interfere with native text selection, touch selection handles, or ordinary selection-to-copy behavior.

## Placement and preserved behavior

- Keep the toolbar and its revealed label within the visible viewport, including when placement flips below a selection near an edge.
- Remeasure when relevant dimensions change, including label visibility/content, slot configuration, viewport changes, and enlarged UI. Showing a label must not shift the controls; placement must account for label space.
- Preserve both paginated and scrolling modes, native selection capture/restoration, and existing invalid-selection explanations.
- Preserve direct Tab access, native button navigation and activation, dismissal on leaving the toolbar, and the absence of a focus trap.
- Preserve Enter/H default-slot creation, N note creation, digit-tap slot creation, digit-held pointer-sweep creation, Escape layering, undo grace, and announcements. Do not hijack editable fields, links, or native focused-control activation.
- Ordinary selection remains side-effect free. The toolbar appears after pointer release, not during a sweep.

## Acceptance criteria

1. At ordinary sizes, all six controls appear in a compact single row with no persistent slot-name text.
2. At a 320px viewport and at enlarged UI scales, every action remains visible or directly reachable through orderly reflow, without horizontal document overflow, clipping, or reduced target sizes.
3. Long names, including maximum-length unbroken names, are fully readable on demand. Revealing them does not move or obscure controls.
4. Slots remain distinguishable when colors match, and numbers remain readable across custom colors and supported themes.
5. Mouse hover, keyboard focus, and touch hold expose the intended label; assistive technology retains full names without requiring a gesture.
6. A touch tap saves exactly once. An inspection hold and its release save nothing; a later tap works normally. Native selection handles remain usable.
7. Toolbar and label stay within the visible viewport near all edges, including below-selection placement and after size changes.
8. Existing creation, keyboard, selection preservation, dismissal, invalid-selection, announcement, and undo contracts remain intact in both reading modes.

Use targeted unit coverage for interaction/state contracts and Playwright for layout, touch, focus, and native-selection behavior. Follow repository test discipline; comprehensive cross-engine verification belongs to the existing CI gate.

## Implementation verification

- TypeScript and targeted ESLint checks pass.
- 98 targeted unit tests pass across the toolbar component and selection controller, including hold suppression, ordinary tap, cancellation, and timer cleanup when selection disappears.
- 19 targeted Playwright checks pass across Chromium and Firefox: slot creation/settings, keyboard focus paths, both reading modes, 320px long-name reflow, and narrow/short viewport resizing.
- Native held-touch injection passes on Chromium. That CDP-specific test is intentionally skipped on Firefox; shared interaction state is also covered by unit tests.
- Host WebKit is launch-blocked by missing system libraries. WebKit/container and comprehensive CI verification remain outstanding; these targeted runs are not a substitute for the reference gate.

## Non-goals

No new annotation semantics, slot storage changes, historical-highlight migration, new Copy action, default-slot persistence changes, or redesign of the annotation panel. No ADR or glossary change is required for this reversible presentation decision.
