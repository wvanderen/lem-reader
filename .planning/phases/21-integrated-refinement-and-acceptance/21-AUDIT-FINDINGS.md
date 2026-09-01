# Phase 21 Audit Findings — POLISH-11 (Impeccable-informed audit)

**Audited:** 2026-09-01 (post 21-01/21-02/21-03 — the corrected state, per D21-09)
**Method:** the `impeccable` skill's `audit` reference (5 dimensions × 0–4, P0–P3 severity), product register (`reference/product.md`), executed over every D21-08 surface: Library (views, filters, Add dialog), Highlights, Reader (scrolling + paginated, TOC, annotations chrome), Settings/dialogs, and error/refusal states — with the three corrections themselves (truthful measure 21-01, re-anchored tag menu 21-02, Highlights glyph + conformance 21-03) audited as surfaces.
**Evidence base:** full `src/app.css` read (4007 lines) + component semantics greps; programmatic WCAG contrast computation over every token pair × three themes; anti-pattern greps (gradients, shadows, radii, eyebrows, z-index, literals); production build measurement (`npm run build`); the phase's fresh green 3-engine e2e runs (21-01 typography-live-apply 21/21 + pagination 237/237; 21-02 tag-menu geometry 24/24; 21-03 review-panel 99/99 + edge collateral 69/69).

---

## Anti-Patterns Verdict — does this look AI-generated?

**Verdict: No.** This reads as a committed, internally-consistent design language, not generated filler. Specifics:

- **Zero gradients** (no gradient text, no stripe backgrounds), **zero `box-shadow`** anywhere (the ghost-card border+shadow pairing is structurally impossible), **no glassmorphism**, **no hero-metric templates**, **no uppercase tracked eyebrows**, **no numbered section scaffolding**, **no sketchy SVG**. Radii sit at 4px (cards) / 8px (dialogs) — far under the over-rounding tell; the single `999px` is the badge pill (a sanctioned tags/buttons shape).
- **The warm-paper surface was examined against the cream-band tell and cleared on identity grounds:** `--surface #fbf8f3` sits in the warm-neutral band the skill warns about for *new* projects, but this is the shipped D-07 identity of a deliberately booklike reader (PRODUCT.md: "Calm, booklike"), carried coherently through three themes with a serif reading surface and quiet chrome. Per the skill's own setup rule, committed brand identity wins over re-derivation; register is `product`, where familiarity and consistency are the bar — and the vocabulary IS consistent (one quiet-button grammar, one destructive grammar, one icon anatomy).
- **Product slop test (would a user fluent in the category's best tools trust it?):** native controls throughout — real `<input type="search">` + `role="search"`, native `<dialog>`/`showModal` for all six modals (each with own hooks), Popover API for both popover kinds, `fieldset`/`legend` pickers, 23 `role="status"` live regions, 6 `alertdialog` confirms with non-destructive default focus. No invented affordances, no custom scrollbars, no display fonts in labels. Trust answer: yes.
- Closest-to-a-tell item, cleared: the blockquote `border-left: 2px solid var(--hairline)` — the centuries-old editorial quotation rule, rendered in neutral hairline chrome (not a colored accent stripe on a card/callout). Kept.

**Score: 4/4** — distinctive within its register, intentional, no tells.

## Dimension Scores

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3/4 | Placeholder text renders below AA on sepia/light (F-1, P1); decorative hairlines below the 3:1 non-text bar (F-2, P2). All token text pairs pass (16/16 × 3 themes). |
| 2 | Performance | 3/4 | Lean authored CSS (49 kB / 6.9 kB gzip), zero web fonts, motion budget = 2 gated transitions, CI perf + repagination budgets; single 782 kB JS chunk trips the 500 kB warning (F-5, P3). |
| 3 | Theming | 3/4 | Complete three-theme token system with verified re-theming and forced-colors mapping; minor literals/drift (F-3, F-4 — P3). |
| 4 | Responsive | 4/4 | 240px popover viewport-keep, 320px reflow, 400% zoom, 44px touch targets, staged ≤639/≤420px collapses — all e2e-proven on chromium/firefox/webkit. |
| 5 | Anti-Patterns | 4/4 | No tells; committed warm-paper identity (see verdict). |
| | **Total** | **17/20** | **Good — address weak dimensions** (band per the audit reference) |

### Accessibility (3/4)

Programmatic contrast audit over every consumed token pair in **sepia, light, and dark** (WCAG 2.1 relative luminance): body ink 14.3–16.9:1; meta `--ink-soft` 6.4–8.1:1; links/accent 6.2–8.3:1; destructive text 5.5–6.8:1; destructive hover fill 6.1–7.3:1; ink-on-highlight 6.9–14.3:1; focus ring ≥ 3:1 everywhere; accent/destructive borders ≥ 3:1 everywhere. **16/16 pairs × 3 themes PASS.** Keyboard: skip link, global `:focus-visible` ring (2px, 8:1), Esc + focus-restore as the universal top-layer escape, engine-divergence honestly asserted (D18-04). Semantics: one h1 per page, landmarks, `role=search`, tri-state shapes distinguishable by shape alone (forced-colors safe). Gap: placeholder rendering (F-1) and strict 1.4.11 hairline boundaries (F-2).

### Performance (3/4)

Zero web fonts (`document.fonts.ready` resolves immediately); authored CSS 49.42 kB raw / 6.92 kB gzip; exactly two transitions in the whole stylesheet (book-disclose, restoration-marker fade) — both `prefers-reduced-motion`-gated with instant fallbacks; scroll-driven progress hairline is an inline-style write with no transition (tracks like a native scrollbar); user-approved CI repagination budget (`npm run perf`) holds. Build: 782.05 kB min / 204.22 kB gzip in ONE chunk — above Vite's 500 kB warning (F-5). Import-graph leakage check clean: DOMPurify/jsdom/unpdf/fflate all absent from the client bundle; the mass is React + Dexie + Zod + app code. No layout-thrash patterns found (rAF-throttled scroll, ResizeObserver-coalesced re-measure, engine skips stale commits).

### Theming (3/4)

Every surface consumes `var(--…)` tokens; three themes verified (applyTheme writes `data-theme` + custom properties; e2e-verified live re-theming); forced-colors mode maps marks/badges/links/marker to system colors with shape-distinct fallbacks. Residual literals: 8 × `rgba(31, 27, 22, …)` dialog backdrops (F-4) and the `.page-indicator` font shorthand hard-coding the system stack instead of `var(--font-ui)` (F-3) — both zero-visual-delta conformance nits.

### Responsive (4/4)

The re-anchored tag popover stays fully in-viewport at 240px via native flip fallbacks (21-02 geometry spec, 3 engines); reflow holds at 320 CSS px with no content/function loss (D6-09 invariant); 400% zoom keeps function with the new 40ch floor (21-01); touch targets 44px everywhere including icon buttons; the ≤639px wordmark clip and ≤420px Reader nav clip stay in the a11y tree and tab order with a `:focus-visible` un-clip restore. No fixed-width overflow traps found.

---

## Findings (P0–P3) and Remediation Status

**Severity mapping (D21-10):** **P0 → blocker** (fix immediately) · **P1 → major** (WCAG AA violation — **fix in-phase**) · **P2 → minor** (annoyance, workaround exists — log to `deferred-items.md`) · **P3 → polish** (nice-to-fix — log). Blocker/major rows must show `fixed`; minor rows `logged-minor`.

| ID | Sev | Dimension | Location | Impact | Standard | Recommendation | Status |
|----|-----|-----------|----------|--------|----------|----------------|--------|
| F-1 | **P1** | Accessibility | UA-default `::placeholder` rendering, all text inputs; acute on `.library-search input` (placeholder = the only VISIBLE label; SR label is visually-hidden) | Placeholder text renders at UA-default ink@~54%: **3.66:1 sepia / 3.74:1 light** — low-vision readers cannot read the search field's purpose at AA (dark passes at 4.95:1) | WCAG 1.4.3 (4.5:1) | `::placeholder { color: var(--ink-soft); opacity: 1 }` — token-only, passes at **7.02 / 7.26 / 8.06:1** across the three themes; zero semantic/geometry/motion impact | **fixed in-phase** (Task 2 — src/app.css `::placeholder` rule) |
| F-2 | P2 | Accessibility | `--hairline` chrome across themes: card borders 1.27–1.43:1, input boundary borders ~1.3:1 vs page | Decorative card/boundary hairlines sit below the 3:1 non-text bar under a strict reading; mitigations: load-bearing boundaries all pass (focus ring ~8:1, accent/destructive borders 5.5–7.7:1), forced-colors mode restores CanvasText boundaries, inputs carry label/placeholder text and 44px shapes | WCAG 1.4.11 (strict reading; decorative-element exception arguably applies) | Future token pass: deepen `--hairline` per-theme toward ≥3:1 where boundaries are load-bearing (inputs), or scope an input-border token; token VALUES are byte-stable this phase (UI-SPEC §6) | **logged-minor** |
| F-3 | P3 | Theming | `.page-indicator` (app.css L1324) — `font: 400 14px/1.45 system-ui, -apple-system, sans-serif` | Token drift: the shorthand bypasses `var(--font-ui)`; rendering identical in practice (both resolve system-ui first) | Project token-conformance bar (POLISH-07) | Rewrite as `font: 400 14px/1.45 var(--font-ui)` | **logged-minor** |
| F-4 | P3 | Theming | 8 × `rgba(31, 27, 22, 0.4/0.5)` dialog/panel backdrops | Hard-coded ink-equivalent literals instead of token-derived values; scrims are deliberately theme-independent, visual result correct | Project token-conformance bar | Express as `color-mix(in srgb, var(--ink) 50%, transparent)` (the `.progress-hairline` precedent) in a future pass | **logged-minor** |
| F-5 | P3 | Performance | Vite build output — single JS chunk | 782.05 kB min / 204.22 kB gzip in one chunk; Vite warns >500 kB; no route/code splitting (2 routes, local-first app; leakage check clean) | Perf hygiene (no WCAG violation) | Consider manualChunks or dynamic import for the ingestion settings cluster in a future phase | **logged-minor** |

**Counts:** P0: 0 · P1: 1 (**fixed in-phase** — Task 2) · P2: 1 · P3: 3 (all logged to `deferred-items.md`). **Zero blocker/major rows remain open (D21-10).**

## Patterns & Systemic Issues

None adverse. The systemic observations are positive: one quiet-button grammar shared by ~20 controls; one destructive grammar (border-only `--destructive`, hover fill, non-destructive default focus) across all 6 confirms; one icon anatomy (20×20 currentColor stroke SVGs) for every glyph including the new 21-03 jump glyph.

## Positive Findings

- Programmatic proof that **every consumed token text pair passes AA in all three themes** — including the pairs the skill names as most-common failures (meta gray on tinted near-white: 6.4–8.1:1).
- Zero web fonts; two motion properties in the entire stylesheet, both reduced-motion-gated with instant fallbacks; global defensive reduced-motion + forced-colors gates at the top of app.css.
- Native-semantics discipline: Popover API (`auto` + `manual`) and native `<dialog>` everywhere; no custom modals, no div-buttons, no aria-label-only icon buttons without names.
- The 21-02 CSS-anchor-positioning correction is the codebase's first anchored element and ships with zero JS listeners and a 5-cell × 3-engine geometry proof.
- Known-debt ledger discipline holds: the audit inherited the Phase 15 zipSlip lint debt (D21-15 fixes it later this phase in 21-05/21-06) and the Phase 20 WebKit Blob boundary (D21-11 documented skips) — neither re-opened here.

## Remediation Gate (hard constraint — D21-08 / RESEARCH Pitfall 6)

Every remediation from this audit **preserves native semantics** (no role, aria, or DOM-structure changes) and **never weakens reduced-motion, forced-colors, zoom, or screen-reader behavior**: remediation is geometry/style/token/doc work only; any diff touching roles/semantics/motion properties is a DEFECT and must be redesigned or surfaced for human decision. After remediation: full unit suite + `a11y.spec.ts` + `forced-colors.spec.ts` + `reduced-motion.spec.ts` re-run green (strengthen-only — no assertion removed), and `node scripts/check-no-danger.js` exits clean (no dangerous HTML introduced).

**Remediation record (Task 2):** the single P0/P1 finding (F-1) was fixed by one additive color-only rule (`::placeholder { color: var(--ink-soft); opacity: 1 }`, citation-commented) — the remediation diff touches no role, no aria, no DOM structure, and no motion property; no assertion was removed; all four gate suites re-ran green (results in 21-04-SUMMARY.md). The four P2/P3 findings are ledgered in `deferred-items.md`.

## Recommended Actions (outside this phase's scope)

1. **[P2] token pass** — `--hairline` boundary contrast (F-2), ideally together with F-3/F-4 conformance nits, in a future dedicated polish phase (token values are frozen this phase by UI-SPEC §6).
2. **[P3] `$impeccable optimize`** — single-chunk build splitting (F-5) once a third destination or heavier settings cluster justifies it.
3. Re-run this audit's contrast script after any future token evolution — it is deterministic and theme-complete.
