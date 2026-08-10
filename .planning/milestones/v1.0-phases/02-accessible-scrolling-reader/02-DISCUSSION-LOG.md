# Phase 2: Accessible Scrolling Reader - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 2-accessible-scrolling-reader
**Areas discussed:** Settings UI surface, Typography control model, Location restore + progress UX

---

## Settings UI surface

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-over panel | Gear opens a side panel/dialog over the article; focus traps inside, restores to gear on close. Keeps article uncluttered (READ-04), most keyboard/SR predictable (A11Y-01/02). | ✓ |
| Separate #/settings route | Hash router adds #/settings. Full-page screen. Cleanest focus story, but leaves the article entirely — can't preview typography live. | |
| In-page disclosure | Collapsible `<details>` above the article body. Cheapest (native), but pushes article down and competes with content when open. | |
| Slim toolbar | Persistent thin toolbar with key controls always visible. Fastest, but risks violating READ-04 "controls don't permanently compete." | |

| Option | Description | Selected |
|--------|-------------|----------|
| Slim top header, both views | Calm persistent top bar (logo/title + gear) across FixtureList and ArticleView. Stable gear home + predictable focus. Must stay quiet for READ-04. | ✓ |
| Top header, article only | Gear appears only in ArticleView. Fewer surfaces, but settings route-gated and home view has no entry. | |
| Floating gear button | Fixed-position gear overlay. No header needed, but risks competing with content + touch target issues. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live, as you adjust | Each control applies instantly to article behind panel (CSS custom properties); persist debounced. Best for "does this feel calm?" | ✓ |
| Apply on close | Changes stage in panel, apply on dismiss. Simpler focus, but can't preview combinations. | |
| Live + explicit Save | Live preview + Save commits (Cancel reverts). More control, adds revert path + STATE-02 complexity. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, reset to warm-paper | Single Reset restores D-07 warm-paper defaults (serif, default size/spacing, sepia/light, 64ch measure). STATE-02 default = D-07 baseline. | ✓ |
| No reset, just controls | Each control own value; adjust manually. Simpler, but no way back to baseline. | |
| Reset per-group | Separate reset for typography vs theme. Granular, more controls + STATE-02 per-group defaults. | |

**User's choice:** Slide-over panel; slim top header across both views; live-apply (debounced persist); single Reset to warm-paper.
**Notes:** First persistent chrome in the app (Phase 1 had none). Panel mechanism (native `<dialog>` vs custom `aria-modal` region) deferred to planner.

---

## Typography control model

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: presets + tweaks | Named presets (e.g. Compact/Comfortable/Spacious) set correlated knobs + individual fine-tune for size & measure. Calm defaults, then control. Maps to STATE-02 (preset id + overrides). | ✓ |
| Individual sliders only | Each of 5 knobs its own control. Max control, but fiddly + works against calm; more STATE-02 + a11y labeling. | |
| Presets only | 2-3 whole-typography presets. Simplest + calmest, but may undersell READ-02's enumerated knobs. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Serif + Sans + Dyslexic-opt | Warm-paper serif (default) + system sans + dyslexia-friendly option. Accessibility-first audience benefit. ⚠ Dyslexic font: true web font (document.fonts.ready concerns) vs system-stack approximation — research flag. | ✓ |
| Serif + Sans (2) | Warm-paper serif + one system sans. Minimal, calm, font-load-safe. Smallest set satisfying READ-02. | |
| Serif + Sans + Mono-prose | + monospace-for-prose option. Useful for technical fixture, but unusual for long-form body. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stepped (discrete steps) | Size & measure as discrete steps (e.g. 16/18/20/22/24px; ~52/58/64/72ch). Predictable, keyboard-friendly, easy to label + persist. | ✓ |
| Continuous sliders | Size & measure as range sliders. Finest control, but noisier for keyboard/SR + harder to label. | |
| Size stepped, measure continuous | Size predictable (primary a11y lever); measure a comfort tweak. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Preset-internal only | Line-height + letter/word-spacing set by presets, not individually adjustable. Keeps panel calm; still "adjustable" per READ-02. | ✓ |
| One 'airiness' slider | Single correlated slider for line-height + spacing. One extra knob, still calm. | |
| Separate controls each | Line-height, letter-spacing, word-spacing each own stepped control. Max fidelity, crowded panel + STATE-02 bloat. | |

**User's choice:** Hybrid presets + tweaks; Serif + Sans + Dyslexic-friendly; stepped size & measure; line-height/spacing preset-internal.
**Notes:** Dyslexic-friendly font delivery (web font vs system stack) is an explicit research flag for the researcher/planner — Phase 1 used system-only stacks deliberately.

---

## Location restore + progress UX

| Option | Description | Selected |
|--------|-------------|----------|
| Silent scroll + 'left off' banner | Scroll silently to saved offset, then small dismissible "You left off here · jump to current" affordance. Quiet + non-jarring; banner gives agency. | ✓ |
| Silent scroll only | Just scroll to offset on open. Simplest, but no signal restore happened; reader loses context if they scrolled since. | |
| Top + 'jump to' prompt | Open at top + "Jump to where you left off" button. Most explicit agency, but required interaction to resume. | |
| Silent scroll + SR-only announce | Scroll + aria-live announce, no visible banner. SR gets signal; sighted sees only scroll. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced scroll + flush on hide | Save 1–2s after scroll stops + flush on pagehide/visibilitychange-hidden. Balances accuracy vs write load; flush covers tab-close. | ✓ |
| Save on leave only | Save only on pagehide/visibilitychange. Minimal writes, but crash/forced close before event loses position. | |
| Fixed-interval save | Save every Ns while open. Predictable cadence, but writes during idle + may miss final position. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Thin scroll-progress hairline | Thin, low-contrast hairline at top of reading surface. Quiet, glanceable, no page-number identity. + SR live region for section changes (A11Y-08). | ✓ |
| Current-section header label | Header shows current section's heading name (running header). Structural, very booklike; needs heading-intersection tracking. | |
| Hairline + section label | Both. Most orientation, but risks crowding calm chrome (READ-04). | |
| SR-only, nothing visible | Only SR live region. Calmest visually, but sighted readers lose passive orientation. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful: read on + notice | Keep reading; dismissible .status banner (aria-live) says prefs/location won't save; in-memory fallback. Corrupt DB wiped on explicit user action. | ✓ |
| Blocking modal | Modal blocks until acknowledged. Explicit, but interrupts reading for a recoverable condition. | |
| Quiet/console only | Console + settings-panel indicator. Least intrusive, but risks violating STATE-05 "reader receives a recoverable error state." | |

**User's choice:** Silent scroll + "left off" banner; debounced scroll-save + flush on hide; thin scroll-progress hairline + SR section live region; STATE-05 graceful read-on + dismissible `.status` notice (non-blocking).
**Notes:** Substrate locked from Phase 1 (D-05 grapheme offsets, `[articleId+revision]` key). Fixtures are static so article reading never depends on Dexie — this is what makes graceful degradation safe.

---

## the agent's Discretion

- **Theme set (D2-09):** Light/Dark/Sepia with Sepia = D-07 warm-paper default. Confirmed consistent with Reset-to-warm-paper + READ-03 "limited set." Not separately discussed.
- **Panel mechanism** — native `<dialog>` vs custom `aria-modal` roving-focus region.
- **Dexie `version(2)` store shape** — settings record value-shape, articles-store role, v1→v2 migration specifics. `version(1)` MUST NOT be edited (Pitfall 9).
- **Settings application path** — React context → CSS custom properties vs `data-theme`/`data-prefs` attribute + token swap.
- **Exact preset names, step bounds, hairline placement/height, banner copy** — UI-SPEC copywriting contract.

## Deferred Ideas

None raised out of scope. Confirmed-later items: pagination/dual-mode (Phase 4), measurement/Pretext pipeline (Phase 3), highlights/notes (Phase 5), heading navigator + line-focus aid (v2).
