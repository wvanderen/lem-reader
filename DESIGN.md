---
name: Lem Reader
description: A calm, booklike reader styled as library wayfinding — signage owns the chrome so the page can recede.
colors:
  gallery-paper: "#f7f7f5"
  mat-board: "#eceded"
  graphite-ink: "#1c1f1d"
  pencil-gray: "#525a54"
  bottle-green: "#22604a"
  bottle-green-deep: "#17452f"
  brass: "#8a6a24"
  brass-lit: "#c9a24e"
  enamel-board: "#1d3128"
  board-white: "#f2f4f1"
  board-soft: "#b9c6bd"
  lit-board: "#2c4a3b"
  manila: "#f0e8d5"
  manila-deep: "#e5dbc2"
  night-wall: "#141a17"
  night-raised: "#1d2521"
  highlight-tint: "#eee1b4"
  destructive-brick: "#a63d32"
typography:
  body:
    fontFamily: '"Literata", "Source Serif 4", Georgia, Charter, "Times New Roman", serif'
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"PT Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.05em"
  panelTitle:
    fontFamily: '"PT Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "20px"
    fontWeight: 700
  code:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: "14px"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.bottle-green}"
    textColor: "{colors.board-white}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.mat-board}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.mat-board}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
  classification-band:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.board-white}"
    height: "48px"
---

# Design System: Lem Reader

## Overview

**Creative North Star: "The Reading Room Wayfinder"**

Lem Reader is the library's wayfinding made software: enamel signage that names where you are and never moves. The system's one inversion is its identity — chrome steps **forward** graphically (a deep enamel band, white spaced caps, brass rules) so the article panel can be the brightest, quietest surface on screen. Uniform-whisper chrome is the refused default: when every element recedes equally, nothing orients the reader.

The reading voice is deliberately separate from the signage voice. Literata — a face designed for long-form ebook reading — carries hours of prose on cool paper; PT Sans — a public-wayfinding humanist sans — labels the chrome in spaced caps. The two never swap jobs.

**Key Characteristics:**
- Enamel bottle-green boards with white spaced caps own all chrome
- Brass (never gray) edges every board and quotation
- The current location is the *lit* board — brighter fill, brass underline
- Layout geometry is pinned: 48px band, centered 64ch measure, no shadows outside dialogs
- Three scenes, not three color schemes: Daylight (default), Warm paper (manila), Night (lit signage on dark walls) — plus hand-authored specialty rooms (ADR 0006/0007)

## Colors

A restrained paper world with one committed chrome color: neutral gallery paper and graphite-green ink carry the content; enamel green owns the chrome; brass is the metal that marks what is lit.

### Primary
- **Bottle Green** (#22604a): links, interactive text, focus-adjacent accents, and — as the solid fill behind board-white caps — the primary button. Deep enough for 4.5:1 on every paper surface.
- **Enamel Board** (#1d3128): the classification band and all board chrome. Flat on purpose — enamel signage *is* flat painted metal; no texture, no gradient.

### Secondary
- **Brass** (#8a6a24 on paper, #c9a24e lit on boards): rules and edges only — the band's lit bottom edge, dialog top rules, quotation rules, focus rings. Brass marks what is metal; it is never body text.
- **Lit Board** (#2c4a3b): the current location's board fill, always paired with the brass underline. The one "you are here" signal.

### Neutral
- **Gallery Paper** (#f7f7f5): the default article ground — neutral-cool, deliberately *not* cream.
- **Mat Board** (#eceded): raised cards, quiet buttons, inputs, dialogs.
- **Graphite Green** (#1c1f1d): body ink. **Pencil Gray** (#525a54): secondary text, placeholders, meta.
- **Board White** (#f2f4f1) / **Board Soft** (#b9c6bd): text on enamel — caps labels and secondary labels on the band.
- **Manila** (#f0e8d5) / **Night Wall** (#141a17): the Warm paper and Night scene grounds.

### Named Rules
**The Brightest Panel Rule.** The article surface is always the highest-luminance reading field on screen. Chrome may be graphic; the page stays quiet. If a decoration competes with the measure, the decoration loses.

**The Brass Rule.** Gray is for text, never for edges that matter. Rules that carry meaning — band edge, dialog top, quotation mark, focus — are brass. Hairlines between peers stay neutral (#d5d8d2).

**The One Lit Board Rule.** Exactly one navigation location is lit at a time. Lit = brighter green fill + board-white caps + 2px brass underline, driven by `aria-current`, never by color alone.

## Typography

**Display/Label Font:** PT Sans (self-hosted, with system sans fallback) — the wayfinding voice
**Body Font:** Literata variable (self-hosted, with Georgia fallback) — the reading voice
**Code Font:** system ui-monospace stack

**Character:** A public-signage sans against a book serif. The sans speaks only in spaced caps at 13px/700 for controls and labels; the serif never transforms. Chrome talks, prose reads — a label in caps is an instruction, a sentence in Literata is the product.

### Hierarchy
- **Panel Title** (PT Sans 700, 20px, 1.3): dialog and panel headings — chrome voice, sentence case.
- **Article H1** (Literata 600, 32px, 1.2) / **H2–H4** (Literata 600, 22px, 1.3): the article's own hierarchy, in the reading voice.
- **Body** (Literata 400, reader-sized 16–24px, 1.4–1.8, 64ch default measure): the product's core surface.
- **Label** (PT Sans 700, 13px, +0.05em tracking, UPPERCASE): buttons, band nav, skip link, back links — the signage register. DOM text is never uppercased by content, only by CSS.
- **Meta** (PT Sans 400, 14px, 1.45): bylines, captions register, helper text.

### Named Rules
**The Two Voices Rule.** Prose is always Literata and never uppercase. Labels are always PT Sans caps. A UI string that mixes the voices (serif button, caps paragraph) is a bug.

## Layout

A single calm column system, pinned by contract. The 48px classification band spans full width, edged by a 1px brass-lit rule; geometry is load-bearing (paginated page budgets, progress-hairline and panel offsets all compute from `48px + 2px`) and must never change height. Content sits in a centered measure (default 64ch, reader-adjustable 40–88ch) on the paper ground. Spacing rides a 4px scale (4/8/16/24/32/48/64); every interactive target keeps a 44px minimum hit area. Responsive: single column throughout; below 640px the wordmark collapses out of flow and the reader stages the primary nav out with it — the phone reader band carries reading tools only (keyboard reachability preserved) — furniture is removed, type is never shrunk.

## Elevation & Depth

Flat by conviction, with exactly one earned shadow. Depth is conveyed by material and light, not by drop shadows: the enamel band is *in front* because it is graphic and dark; the paper is *behind* because it is luminous. Dialogs — the only true top-layer surfaces — carry the single elevation token (`0 1px 2px rgba(16,24,20,.07), 0 8px 24px rgba(16,24,20,.12)`) plus a 2px brass top rule and a deep green scrim. No other shadow exists in the system.

### Named Rules
**The One Elevation Rule.** If it is not a native `<dialog>`, it is flat. Cards, popovers, and sheets use raised surface color + hairlines, never shadows.

## Shapes

Painted-panel radii on a tight ladder: 4px for small surface blocks, 8px for controls, 12px for cards and pickers, 16px for dialogs, 999px reserved for pill chips. Nav boards use the 8px control radius — painted metal panels, not sharp print rectangles, not fully rounded lozenges. Inline markers (highlight marks, the restoration bar) stay at 2px. Borders are 1px hairlines between peers; the exceptions are semantic: the 2px brass band edge, the 2px brass dialog top, the 2px brass quotation rule, and the 2px lit-board underline.

## Components

### Buttons
The signage register: PT Sans 700 caps, +0.05em tracking, 13px, 44px min height, 8px radius.
- **Primary:** solid Bottle Green fill, Board White caps — the enamel board you press. Hover lights a brass edge; active mixes 12% brass into the fill.
- **Quiet:** Mat Board fill, 1px hairline, ink caps. Hover lights a brass edge and shifts text to Bottle Green.
- **Icon:** the 44px transparent square on the band (Board Soft glyph, Board White on hover, Brass when expanded); on paper it takes the Mat Board fill.
- **Destructive:** brick red (#a63d32) text on a 10% red tint; border appears on hover. Calm, never shouting.
- **Busy:** keeps its label and width; a prepended spinner rotates under the positive reduced-motion gate.

### Classification Band (Navigation)
The 48px enamel board: brand mark and destination links as shelf boards. Links render in Board Soft caps on transparent boards; hover brightens to Board White; the current destination sits on the Lit Board with the brass underline (`aria-current`). Band icon triggers follow the icon-button board treatment. Below 640px the wordmark clips out of flow and the reader band stages its nav links out with it — on phones the reader band carries the reading tools alone (wayfinding stays one tap away via Back to library) — all while staying keyboard-reachable with visible focus.

### Cards / Containers
Mat Board fill, 1px hairline, 12px radius, flat. Status cards, disclosure blocks, and library rows share this anatomy; spacing does the separating, never internal rule lines.

### Inputs / Fields
Mat Board-on-paper fill (surface inside dialogs), 1px hairline, 8px radius, 44px min height, PT Sans 14–16px, accent caret. Placeholders render at Pencil Gray, never UA-faded. Focus takes the global 2px brass ring. Selection paints the classification tint (`--highlight`) under the theme's ink.

### Highlight Marks (signature)
The annotation system speaks in classification tints: a default brass-paper tint plus yellow/green/blue/pink shelf-label fills, each carrying theme ink at ≥4.5:1 (test-enforced). State is shape-cued beyond color: solid fill, dotted underline for note-bearing, dashed outline for unresolved. The spoken-word marker is a separate tan fill with a solid accent underline — position, not annotation.

Completing a valid primary pointer selection saves a highlight and places “Highlighted”, “Undo”, and “Add note” feedback beside the selected passage. While that feedback is available, Undo or Escape removes the new highlight; Add note opens its note editor. Keyboard selections retain the explicit Highlight and Highlight + note actions, accessible through the toolbar or the H and N shortcuts.

### Custom Themes (the reader-built room)
The two custom slots (Custom light / Custom dark) let the reader repaint the room without losing the wayfinding grammar. The builder groups nine rows: the five surface seeds (Surface, Raised surface, Text, Accent, Hairline) and — under a "Reading room" group — the four chrome tokens (Band, Band text, Lit board, Brass). An untouched chrome row shows its DERIVED value; editing a row simply stores it ("Reset to base colors" returns everything to derived). The accent is the room's hue anchor: the band and lit board take the accent's hue at the register's enamel lightness, the brass is the accent-hue metal, and the band text stays the near-white signage register.

**The Two Registers Rule.** Derivation follows the surface's light/dark disposition, never the slot's name: a light-disposition surface builds Daylight's register (dark enamel band, deep quiet metal), a dark one builds Night's (darker band, bright lit metal). The same accent on the two slots yields two different rooms — on purpose.

**The Custom Contrast Contract.** The derived/stored chrome is held to the same audit as the presets, test-enforced: band text ≥ 4.5:1 on the band, on the lit board, and on the solid fill; secondary band text ≥ 4.5:1 on the band; brass ≥ 3:1 on both paper surfaces; lit brass ≥ 3:1 on the band. The live readout reports every policed pair; "Fix contrast" nudges only a failing pair's own stored token Derived board text and lit brass adapt to their grounds. Arbitrary paper colors can make simultaneous brass contrast impossible; the readout keeps reporting any remaining failure.

### Specialty Themes (the flag rooms, ADR 0006/0007)
Hand-authored presets fly their identity on the chrome: **Trans pride** (light — porcelain-blue paper, deep trans-blue enamel band, pink metal), **Bi pride** (dark — aubergine walls, magenta accent, lavender metal), and **In Defense of Marxism** in two registers (light — the pamphlet room: warm newsprint paper, deep oxblood-red enamel band, crimson links, red-brown metal; night — dark grey walls, banner-red enamel band, red links, lit-red metal). The Wayfinding grammar holds intact; ONE gradient material — the **soft wash** (`--flag-wash`, a real blend of the flag's hues; in the Marxism room, the single-hue banner blend) — paints exactly two moments: the dynamic progress hairline (whose `scaleX` compression would fragment hard stripes) and the lit current-location underline. Hard-stop flag geometry is refused: it read as chunky confetti chips at board scale and aliasing fragments under compression. The band's bottom edge stays the **basic lit metal** — a flag line there sat 1px above the wash and read as a clashing double-flag. The hooks default to the solid materials in `:root`, so every other preset and both custom rooms stay flat. The flag is identity, never meaning: the solid mark stays painted beneath the underline's `border-image`, forced colors strip it, and the article measure is never repainted. All rooms pass the full preset contrast audit (test-enforced in `prideThemes.test.ts`).

### Dialogs
Raised paper card, 16px radius, 2px brass top rule, the one elevation token, deep-green scrim (`rgba(16,24,20,.55)`). Native `<dialog>` top-layer only.

## Do's and Don'ts

### Do:
- **Do** keep chrome in the signage voice: PT Sans caps, enamel fills, brass edges.
- **Do** reserve brass for rules, focus, and lit states — and gray for hairlines between peers.
- **Do** theme every browser surface from the palette: selection tint, caret, focus ring are tokens, not defaults.
- **Do** keep the 48px band, 44px targets, and the 4px spacing scale exact — they are load-bearing contracts.
- **Do** express state beyond color: weight, underline, shape, and `aria-current`/`aria-expanded` carry what brass and green suggest.

### Don't:
- **Don't** warm the default paper. Gallery Paper is neutral-cool; cream/beige is the retired default (ADR 0005), and warmth lives only in the explicit Warm paper theme.
- **Don't** add shadows outside native dialogs, or gradients/glass anywhere — enamel is flat. The single exception is the specialty rooms' ribbon hooks (ADR 0006/0007); never extend gradients past them.
- **Don't** let the signage voice leak into prose: no caps, no PT Sans inside the article measure.
- **Don't** light two boards at once, and never convey current/hover state by color alone.
- **Don't** shrink type to fit narrow screens — remove furniture instead (the staged-collapse discipline).
