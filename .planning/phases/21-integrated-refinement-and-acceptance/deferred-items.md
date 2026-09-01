# Phase 21 Deferred Items

Minor/cosmetic audit findings logged per D21-10 (the milestone closes
honestly with logged minors). Source: 21-AUDIT-FINDINGS.md (POLISH-11,
2026-09-01). Every P0/P1 finding was fixed in-phase; only P2/P3 land here.

## [P2] Hairline boundary contrast below the 3:1 non-text bar (audit F-2)

**Location:** `--hairline` chrome across all three themes (`src/app.css`
:root + `[data-theme]` blocks) — card borders 1.27–1.43:1, quiet input
boundary borders ~1.3:1 against their surfaces.
**Severity:** P2 (minor) under WCAG 1.4.11's strict reading; the
decorative-element exception arguably applies.
**One-line recommendation:** a future token pass deepens `--hairline`
per-theme toward ≥3:1 where boundaries are load-bearing (inputs), or
scopes an input-border token — token VALUES are byte-stable in Phase 21
(UI-SPEC §6), so this cannot be remediated in-phase.
**Mitigations in place:** load-bearing boundaries all pass ≥3:1 (focus
ring ~8:1, accent/destructive borders 5.5–7.7:1); forced-colors mode
restores CanvasText boundaries; inputs carry label/placeholder text and
44px shapes.

## [P3] `.page-indicator` font shorthand bypasses `var(--font-ui)` (audit F-3)

**Location:** `src/app.css` `.page-indicator` (font: 400 14px/1.45
system-ui, -apple-system, sans-serif).
**Severity:** P3 (polish) — token-conformance drift; rendering identical
in practice (both stacks resolve system-ui first).
**One-line recommendation:** rewrite as `font: 400 14px/1.45
var(--font-ui)` in a future pass.

## [P3] 8 × hardcoded `rgba(31, 27, 22, …)` dialog/panel backdrops (audit F-4)

**Location:** `::backdrop` of settings-panel, annotations-drawer (0.4)
and wipe-confirm / add-dialog / library-remove-confirm / edit-metadata /
import-preview / book-remove-confirm (0.5).
**Severity:** P3 (polish) — scrims are deliberately theme-independent and
visually correct; the literals pre-date Phase 21.
**One-line recommendation:** express as `color-mix(in srgb, var(--ink)
50%, transparent)` (the `.progress-hairline` precedent) in a future
conformance pass.

## [P3] Single 782 kB JS chunk trips Vite's 500 kB warning (audit F-5)

**Location:** production build output (782.05 kB min / 204.22 kB gzip,
one chunk).
**Severity:** P3 (polish) — no WCAG violation; local-first SPA with two
routes; import-graph leakage check clean (DOMPurify/jsdom/unpdf/fflate
all absent from the client bundle — the mass is React + Dexie + Zod +
app code).
**One-line recommendation:** consider manualChunks or a dynamic import
for the settings/ingestion cluster if a future phase grows the app.
