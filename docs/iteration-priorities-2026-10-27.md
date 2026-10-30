# Iteration priorities — 2026-10-27

Shared understanding confirmed on 2026-10-28. This document records the agreed first-release scope and deferred backlog; implementation has not started.

## Settled

- Treat the feedback list as a backlog spanning releases; select a bounded release after dependencies are understood.
- Prioritize reliable reading: investigate overlapping highlights, heading rendering, and low-contrast controls. Faster annotation is the main feature investment.
- Highlight slots have customizable colors and tags, applied only to new highlights. See CONTEXT.md for the term.
- Bold, italic, and underline are personal passage annotations that can exist without background color. Article typography is a separate preference.
- Start with reader-triggered diagnostic exports for reproducing failures. Usage measurement needs a specific development question first.
- Provide accessible defaults and optional preferences, informed by Ree's feedback; extensive setup should not be necessary before reading.
- First release: reliability fixes, customizable highlight slots, and copy-to-clipboard. Text styling, article reflections, and expanded themes follow in later slices.
- Provide five customizable slots numbered 1–5. Each carries a color and zero or more tags; readers choose one as the default. Both color and tags are copied at creation; later slot edits leave existing highlights unchanged.
- Holding a number while selecting temporarily overrides the default slot. A visible slot picker supports keyboard-only and touch use.
- Text styles may coexist with highlights. Permit one background color per passage; explain and refuse conflicting color overlaps until an explicit replace/split interaction is designed.
- Diagnostic exports contain technical diagnostics by default. Including the current article requires an explicit option and a contents preview; exclude notes and tags by default.
- Ordinary text selection stays native. Number-held selection creates a highlight immediately; keyboard and touch users can select text and activate a slot. Creation offers Undo without opening the annotation panel.
- Applying a slot to an existing highlight changes its color and adds the slot's tags, preserving existing tags. Direct color editing changes only color.
- Refuse all overlapping highlight creation in the first release, including same-color overlaps, with an explanation. Adjacent highlights are allowed. Merging is deferred because notes and tags need explicit preservation rules.
- Copy copies only the highlighted passage as plain text, preserving paragraph breaks. Citations and annotation export are separate future actions.
- Include note editor size/font correction in the first release alongside overlap, heading, and contrast fixes. Defer the always-visible tag field pending small-screen layout review.
- Diagnostic export is a separately scoped follow-up; reproducing current bugs does not depend on building it.
- Each slot has an editable short name, color, and tags. The picker identifies slots by number and name rather than color alone.
- Making a slot the default is an explicit action. Applying a slot to a selection does not change the saved default.
- Notes use system sans-serif at the surrounding interface text size, independent of article typography and responsive to browser zoom. Dedicated note typography controls are deferred.
- Preserve existing broken or overlapping highlights; retain explicit edit/delete access in the highlights list. Repair only where the intended result can be established without guessing.
- Accept custom highlight colors, adjusting their rendered tint for readable article text in the active theme. Preview the actual rendering before saving; names and tags remain available independently of color.
- Finish the first-release specification in this interview. Preserve later requests as open follow-ups rather than implementation-ready designs.
- Initialize the five slots from the current five color choices, with no tags and the current Default choice selected. Preserve existing highlights. Persist slot preferences locally and include them in versioned export/import.
- Number-held creation requires the number to remain held when selection finishes. Releasing early or pressing Escape cancels creation while leaving native selection available. Disable number shortcuts in editable fields and during modified keyboard shortcuts.
- Creation Undo applies only to the newly created, untouched highlight. Editing retires that action; subsequent deletion is explicit through annotation controls.

## Completion evidence

- Targeted Chromium, Firefox, and WebKit checks cover selection, overlap rejection, heading hierarchy, and new controls, alongside keyboard, touch, zoom, and contrast checks.
- Track each reported bug separately. Mark it fixed only with a reproduction or demonstrated cause and a regression check; unverified reports remain open.
- Firefox heading and stuck-highlight reports still need reproduction. Suspected causes from initial code inspection are not confirmed diagnoses.

## Deferred backlog

- Personal bold, italic, and underline annotations, including passages without a background highlight; editing location and composition rules remain open.
- Article-level notes for overarching reflections, floated to the top; their relationship to tags, review, and export remains open.
- Unlimited named custom themes.
- Reading progress bar height, bottom placement, and custom gradients. Independent gradients would revisit ADR 0006's shared wash hooks.
- Always-visible tag input in the annotation panel's bottom bar, subject to small-screen review.
- Curated article font selection and article/global-header style customization beyond fixing rendering defects.
- Dedicated note typography controls.
- Reader-triggered diagnostic exports with technical data by default and optional article inclusion with a contents preview; no product usage measurement without a concrete development question.

## Confirmation

The reader confirmed the first-release scope on 2026-10-28. Deferred backlog design choices remain intentionally open.

Published specification: [Reliable annotations: customizable highlight slots, copying, and reading fixes — #189](https://github.com/wvanderen/lem-reader/issues/189), labeled `ready-for-agent`.
