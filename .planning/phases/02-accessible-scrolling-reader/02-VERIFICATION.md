---
phase: 02-accessible-scrolling-reader
verified: 2026-08-04T17:09:20Z
status: human_needed
score: 17/17 truths verified (3 routed to human UAT — present + wired, behavior needs human eyes/ears)
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 17/17 truths verified (3 routed to human UAT)
  gaps_closed:
    - "Gap 1: progress hairline transform-origin (READ-05) — invalid `inline-start` keyword swapped to physical `left` in ProgressHairline.tsx + app.css; proven by new computed-style assertion"
    - "Gap 2: typography custom-property routing (READ-02) — applyTheme now writes `--font-size`/`--line-height`; body rule consumes all four typography knobs via var() with literal first-paint fallbacks; proven by new browser-level cascade spec"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Screen-reader heading-change announce quality"
    expected: "NVDA/VoiceOver announces the current section heading on scroll past h2/h3/h4 without flooding during fast scroll, across the fixture corpus"
    why_human: "axe cannot judge announce conciseness/flood; AT semantics need a human + screen reader (02-VALIDATION.md Manual-Only row 1)"
  - test: "Calm/quiet aesthetic of header + panel"
    expected: "Header reads as thin/low-contrast; gear does not permanently compete with article content; panel slides calmly without jarring motion"
    why_human: "'calm' is a design judgment, not automatable; visible aesthetic review required (02-VALIDATION.md Manual-Only row 2)"
  - test: "Focus visibly logical across navigation"
    expected: "Keyboard-traverse the full reader surface (gear → panel → all controls → Esc → article); confirm focus ring is visible and logical at every step"
    why_human: "Visible focus-ring predictability is partly visual; panel-keyboard.spec.ts proves focus moves to the right elements but cannot judge visibility quality (02-VALIDATION.md Manual-Only row 3)"
---

# Phase 02: Accessible Scrolling Reader — Verification Report

**Phase Goal:** Readers can comfortably read and resume an article in a calm scrolling interface adapted to their access and presentation preferences.
**Verified:** 2026-08-04T17:09:20Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plan 02-04 shipped 2 UAT-diagnosed code-level fixes)

## Re-verification Summary

A prior verification (2026-08-02T22:10:00Z) returned `human_needed` with 17/17 truths verified and 3 items routed to human UAT. A subsequent `/gsd-verify-work` pass (`02-UAT.md`) diagnosed **2 of the routed items as having concrete code-level root causes** (NOT purely-manual judgments) — those became Plan 02-04 (`gap_closure: true`). Both fixes shipped in 3 commits and are confirmed closed below; the 3 *genuinely* manual items (NVDA/VoiceOver announce quality, calm aesthetic, focus-ring visibility) remain end-of-phase human-checkpoint work and are NOT gaps.

| Gap | Req | Severity | Root cause (per 02-UAT.md) | Fix shipped | Status |
|-----|-----|----------|----------------------------|-------------|--------|
| 1 | READ-05 | minor | `transform-origin: inline-start` is not in the transform-origin grammar (no logical keywords); browsers fell back to `50% 50%` (center) | `left` keyword in `ProgressHairline.tsx:45` + `app.css:726`; new computed-style assertion in `progress.spec.ts:128-149` | ✓ CLOSED |
| 2 | READ-02 | major | `applyTheme` wrote bare `font-size`/`line-height` (overridden by body's hardcoded rule); `--letter-spacing`/`--word-spacing` were dead writes consumed by nothing | `applyTheme.ts` writes `--font-size`/`--line-height` custom props; SECOND body rule (`app.css:135-139`) consumes all four typography knobs via `var()` with literal first-paint fallbacks; new browser-level cascade spec `typography-live-apply.spec.ts` | ✓ CLOSED |

Both gaps verified by reading the actual source (not SUMMARY claims) AND by running the single named behavior-proof test for each (Step 7b). Full suite re-run confirms zero regression.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | Reader can read the complete semantic article in a quiet scrolling view and see unobtrusive structural progress without relying on permanent page numbers | ✓ VERIFIED | `src/routes/ArticleView.tsx:248-285` mounts `<article>` + `<ProgressHairline aria-hidden>` + `<SectionAnnouncer>`; no page-number text in DOM (proven by `tests/e2e/section-announce.spec.ts:129` READ-05 assertion); `tests/e2e/progress.spec.ts` (5 tests, chromium ✓ — **incl. new transform-origin left-edge assertion at line 128 closing Gap 1**); `tests/e2e/open-every-fixture.spec.ts` (6 fixtures render title + body, chromium ✓) |
| 2 | Reader can adjust typography, spacing, measure, and accessible light or dark theme, and those preferences persist across sessions | ✓ VERIFIED | `src/reader/SettingsPanel.tsx:110-264` exposes 5 fieldsets; `src/settings/applyTheme.ts:32-38` writes `--font-body` + `--font-size` + `--line-height` + `--letter-spacing` + `--word-spacing` + `--measure` custom properties (**Gap 2 fix**: previously wrote bare `font-size`/`line-height` that body overrode); `src/app.css:135-139` SECOND body rule consumes the four typography knobs via `var()` with literal first-paint fallbacks; `src/settings/SettingsContext.tsx:60-213` debounced save + dual-flush (`visibilitychange`+`pagehide`, lines 154-165); `tests/e2e/typography-live-apply.spec.ts:37` (**NEW** browser-level cascade proof — default 18px → slider 24 → body fontSize=24px → Spacious → wordSpacing nonzero → Compact → 0px); `tests/e2e/persistence.spec.ts:56` "settings survive reload" (chromium ✓); `tests/e2e/persistence.spec.ts:89` "flushes on visibilitychange-hidden" (chromium ✓) |
| 3 | Reader can operate reading and settings functions by keyboard, pointer, or touch with visible logical focus, concise status, no traps, and motion-safe behavior | ✓ VERIFIED | Native `<dialog>`/`showModal()` (SettingsPanel.tsx:50, WipeConfirm.tsx:53); manual `triggerRef.current?.focus()` restore (SettingsPanel.tsx:75, WipeConfirm.tsx:79); `tests/e2e/panel-keyboard.spec.ts:20` "traps on Tab, restores to gear on Escape" (chromium ✓); `tests/e2e/touch-targets.spec.ts:22+34` (44×44px, chromium ✓); `tests/e2e/reduced-motion.spec.ts:17+36+68` (chromium ✓) |
| 4 | Screen-reader, zoom/reflow, and forced-color users retain the article's semantic order, visible controls, and required functions without a duplicate active content tree | ✓ VERIFIED | `tests/e2e/a11y.spec.ts:71` "single-content-tree: exactly one .article-body with panel open" (chromium ✓); `tests/e2e/reflow.spec.ts:18+52` (320px reflow, chromium ✓); `tests/e2e/forced-colors.spec.ts:17+36+50+97` (chromium ✓). **Note:** 200% browser-zoom is treated as equivalent to 320 CSS-px reflow per UI-SPEC §Layout. |
| 5 | Reader returns to the same logical location on reopening and receives a recoverable error when versioned local data cannot be read, migrated, or saved | ✓ VERIFIED | `src/routes/ArticleView.tsx:124-170` loadLocation → findScrollTarget → silent scrollIntoView; `tests/e2e/persistence.spec.ts:206` "scrolling persists + reload restores" (chromium ✓); `tests/e2e/persistence.spec.ts:283` "locations isolated per article (D-06)" (chromium ✓); `tests/unit/storageFallback.test.ts` (14 cases, all 5 STATE-05 branches); `src/reader/WipeConfirm.tsx:91-102` Pitfall 8 — `db.delete()` ONLY in destructive onClick |

**Score:** 5/5 ROADMAP SC verified. All 17 mapped requirements have automated evidence (see Requirements Coverage below). Gap closure **strengthened** READ-02 (typography cascade) and READ-05 (hairline origin) with new browser-level proofs; no other truth regressed.

### Gap Closure Verification (Plan 02-04)

Plan 02-04 (`gap_closure: true`) shipped 2 surgical CSS/token-plumbing fixes after the prior `human_needed` verification. The 5 must-have truths from the plan's frontmatter are all VERIFIED — code present + behavior exercised:

| # | Plan 02-04 must-have truth | Status | Code evidence | Behavioral evidence |
|---|---|---|---|---|
| 1 | The progress hairline fill grows from the LEFT edge (not center) | ✓ VERIFIED | `ProgressHairline.tsx:45` inline `transformOrigin: "left"`; `app.css:726` `.progress-hairline-fill { transform-origin: left }` | `tests/e2e/progress.spec.ts:128` — computed `transformOrigin` first token resolves to `0px` (the `left` keyword computes to `0px 50%`) ✓ PASS |
| 2 | Changing Text size in Settings updates body computed font-size immediately | ✓ VERIFIED | `applyTheme.ts:33` writes `--font-size`; `app.css:136` body rule `font-size: var(--font-size, 18px)` | `tests/e2e/typography-live-apply.spec.ts:37` — slider 18→24 produces body `fontSize` = `"24px"` ✓ PASS |
| 3 | Changing Spacing updates body line-height AND letter/word-spacing immediately | ✓ VERIFIED | `applyTheme.ts:35-37` writes `--line-height` + `--letter-spacing` + `--word-spacing`; `app.css:137-139` body rule consumes them | `tests/e2e/typography-live-apply.spec.ts:37` — Spacious radio → body `wordSpacing` nonzero; Compact → `0px` ✓ PASS; `SettingsContext.test.tsx:143-148` asserts `--line-height="1.8"` + `--word-spacing="0.05em"` under spacious |
| 4 | First paint renders 18px / 1.6 / zero spacing before applyTheme (var() fallbacks) | ✓ VERIFIED | `app.css:136-139` literal fallbacks `var(--font-size, 18px)` / `var(--line-height, 1.6)` / `var(--letter-spacing, 0)` / `var(--word-spacing, 0)`; FIRST body rule + `:root` byte-unchanged (git-diff confirmed) | `tests/e2e/typography-live-apply.spec.ts:37` assertion (a) — default body `fontSize` is `"18px"` ✓ PASS |
| 5 | Font family, theme, reading width continue to live-apply (regression-preserved) | ✓ VERIFIED | `applyTheme.ts:32` (`--font-body`) + `:38` (`--measure`) unchanged; FIRST body rule (`app.css:67-72` `font-family: var(--font-body)`) byte-unchanged; `.article-body max-width: var(--measure)` unchanged | `SettingsContext.test.tsx:102-115` (font swap) + `:117-129` (theme) green; full chromium suite 46/46 ✓ |

**Git commit integrity** (commits exist with claimed hashes + scoped file lists):
- `1b39bb8` fix(02-04): progress hairline transform-origin — 3 files (ProgressHairline.tsx, app.css, progress.spec.ts)
- `9927a06` fix(02-04): route typography knobs through custom properties — 6 files (applyTheme.ts, app.css, 3 test sweeps, new typography-live-apply.spec.ts)
- `96d514c` docs(02-04): complete gap-closure plan

**Byte-unchanged regression check** (`git diff 491b6b7..96d514c -- src/app.css`):
- FIRST body rule (lines 67-72): byte-identical — still `font-family: var(--font-body)`
- `:root` block: byte-identical — no typography-knob additions (per plan: var() fallbacks handle first paint without redundant root declarations)
- `.progress-hairline` track rule: byte-identical
- `.progress-hairline-fill` rule: ONLY `transform-origin` declaration changed (`inline-start` → `left`); NO-transition comment + all other declarations preserved

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/content/schema.ts` (ReaderSettingsSchema + LocationRecordSchema) | Closed-set Zod schemas with schemaVersion=1 literal | ✓ VERIFIED | Lines 209-241; both schemas export + inferred types; `tests/unit/settingsSchema.test.ts` (203 lines) + `tests/unit/locationSchema.test.ts` (151 lines) — 46+30 accept/reject cases |
| `src/persistence/db.ts` | version(2) APPEND; version(1) byte-unchanged (Pitfall 9) | ✓ VERIFIED | `git show ba6f249:src/persistence/db.ts` vs current — version(1) block byte-identical; Table<> type annotations added on class (outside version blocks); version(2) APPEND only |
| `src/persistence/errors.ts` | Named-error classifier | ✓ VERIFIED | Exports `isUnupgradeable`/`isQuota`/`classifyStorageError`; UnknownError routes to unupgradeable FIRST (conservative) |
| `src/persistence/settingsStore.ts` | loadSettings/saveSettings + SettingsLoadResult, safeParse on read | ✓ VERIFIED | key="reader-prefs"; safeParse on read; 5 reason branches asserted in storageFallback.test.ts |
| `src/persistence/locationStore.ts` | loadLocation/saveLocation + LocationLoadResult, compound key | ✓ VERIFIED | Compound key queried as `[articleId, revision]` array; safeParse on read |
| `src/settings/applyTheme.ts` | Live-apply writer (data-theme + 6 custom properties) | ✓ VERIFIED | **Gap 2 fix applied.** Writes `dataset.theme` + `--font-body` + `--font-size` + `--line-height` + `--letter-spacing` + `--word-spacing` + `--measure` on documentElement. NO bare `font-size`/`line-height` writes remain (grep confirmed). Header rationale documents the cascade contract. |
| `src/settings/SettingsContext.tsx` | Provider with persistence + storageState + resetLocalData | ✓ VERIFIED | 221 lines; debounced save (400ms) + dual flush (visibilitychange-hidden + pagehide); storageState union; resetLocalData seam (NO db.delete — Pitfall 8) |
| `src/settings/{defaults,tokens}.ts` | DEFAULT_SETTINGS + token maps | ✓ VERIFIED | DEFAULT_SETTINGS = warm-paper baseline (serif/18/64/comfortable/sepia) |
| `src/reader/Header.tsx` | Quiet persistent chrome (wordmark + gear) | ✓ VERIFIED | `<header class=app-header>`; wordmark is `<span>` (not link); gear with aria-label/aria-haspopup/aria-expanded |
| `src/reader/SettingsPanel.tsx` | Native `<dialog>`/showModal with focus-restore | ✓ VERIFIED | 297 lines; showModal + manual triggerRef.current?.focus() in close listener (Pitfall 1); 5 fieldsets + Reset; explicit first-control focus for WebKit |
| `src/reader/WipeConfirm.tsx` | Focus-trapped alertdialog (Pitfall 8 — db.delete ONLY here) | ✓ VERIFIED | role="alertdialog" + aria-modal + aria-labelledby + aria-describedby; cancel carries [data-initial-focus]; `db.delete()` line 93 — sole executable call site in repo |
| `src/reader/StorageBanner.tsx` | Dismissible storage-failure .status card | ✓ VERIFIED | role="status" + aria-live="polite"; verbatim UI-SPEC copy; non-modal |
| `src/reader/restoreLocation.ts` | findScrollTarget (reuses normalizeText rules) | ✓ VERIFIED | Imports BLOCK_SEPARATOR + graphemeClusters + normalizeRunText from `../content/normalizeText` (D-05 contract — no parallel implementation); first/mid/overshoot/empty cases proven |
| `src/reader/useScrollSave.ts` | Debounced ~1200ms save + dual flush | ✓ VERIFIED | 215 lines; SAVE_DEBOUNCE_MS=1200; visibilitychange + pagehide listeners with cleanup; offset computation reuses normalizeElText |
| `src/reader/ProgressHairline.tsx` | 2px aria-hidden scaleX, NO transition | ✓ VERIFIED | **Gap 1 fix applied.** aria-hidden; inline `transform: scaleX()` + `transformOrigin: "left"` (was invalid `inline-start`); CSS rule at app.css:722-729 has NO transition/animation property; header rationale updated to document the grammar constraint |
| `src/reader/SectionAnnouncer.tsx` | IntersectionObserver + scroll fallback, polite announce | ✓ VERIFIED | role="status" + aria-live="polite"; IntersectionObserver + rAF-throttled scroll listener (dual trigger); 250ms debounce (Pitfall 6 anti-flood) |
| `src/reader/ResumeBanner.tsx` | Dismissible non-modal resume banner | ✓ VERIFIED | role="status" + aria-live="polite"; verbatim UI-SPEC §Copywriting lines 318-323 |
| `src/routes/ArticleView.tsx` | Wires restore + scrollSave + hairline + announcer + resume | ✓ VERIFIED | Lines 91 (useScrollSave), 124-170 (loadLocation→findScrollTarget→scrollIntoView), 176-188 (progress scroll listener), 195-207 (auto-dismiss), 210-227 (Resume/StartFromTop handlers), 252/257/260 (mount components) |
| `src/App.tsx` | Wraps in SettingsProvider; mounts Header + SettingsPanel + StorageRecoverySurfaces | ✓ VERIFIED | Lines 124-138; StorageRecoverySurfaces (43-98) routes storageState to StorageBanner/WipeConfirm |
| `src/app.css` | Theme token blocks + chrome + hairline + banner rules | ✓ VERIFIED | **Gap 1 + Gap 2 fixes applied.** `[data-theme="light"]`/`[data-theme="dark"]` blocks unchanged; `.progress-hairline-fill` rule uses `transform-origin: left` (was invalid `inline-start`); SECOND body rule (lines 135-139) consumes all four typography custom properties via `var()` with literal first-paint fallbacks; FIRST body rule + `:root` byte-unchanged; `.resume-banner`, `.storage-banner`, `.wipe-confirm` rules unchanged; `.article-body max-width: var(--measure)` unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/App.tsx` | `src/reader/Header.tsx` | gear onClick → setSettingsOpen(true) | ✓ WIRED | App.tsx:128 |
| `src/App.tsx` | `src/reader/SettingsPanel.tsx` | settingsOpen state → open prop | ✓ WIRED | App.tsx:131-134 |
| `src/App.tsx` | `src/reader/{StorageBanner,WipeConfirm}.tsx` | storageState routing | ✓ WIRED | App.tsx:43-98 (StorageRecoverySurfaces) |
| `src/reader/SettingsPanel.tsx` | `src/settings/SettingsContext.tsx` | useSettings().update() | ✓ WIRED | SettingsPanel.tsx:39, 83-88 |
| `src/settings/SettingsContext.tsx` | `src/settings/applyTheme.ts` | useEffect([settings]) → applyTheme | ✓ WIRED | SettingsContext.tsx:74-76 |
| `src/settings/applyTheme.ts` | `src/app.css` (body rule) | **Gap 2 cascade contract:** writes `--font-size`/`--line-height` on `<html>`; SECOND body rule consumes via `var()` with literal fallbacks | ✓ WIRED | applyTheme.ts:33,35 → app.css:136-139 (proven end-to-end by typography-live-apply.spec.ts) |
| `src/reader/ProgressHairline.tsx` | `src/app.css` (.progress-hairline-fill) | **Gap 1 origin contract:** inline `transformOrigin: "left"` matches CSS rule `transform-origin: left` (both physical keyword) | ✓ WIRED | ProgressHairline.tsx:45 → app.css:726 (proven by progress.spec.ts:128) |
| `src/settings/SettingsContext.tsx` | `src/persistence/settingsStore.ts` | loadSettings() on mount; debounced saveSettings() on change | ✓ WIRED | SettingsContext.tsx:81-105 (load), 113-129 (debounced save) |
| `src/routes/ArticleView.tsx` | `src/persistence/locationStore.ts` | loadLocation on ready | ✓ WIRED | ArticleView.tsx:127 |
| `src/routes/ArticleView.tsx` | `src/reader/restoreLocation.ts` | findScrollTarget | ✓ WIRED | ArticleView.tsx:147, 213 |
| `src/routes/ArticleView.tsx` | `src/reader/useScrollSave.ts` | useScrollSave(article, articleRef) | ✓ WIRED | ArticleView.tsx:91 |
| `src/routes/ArticleView.tsx` | `src/reader/{ProgressHairline,SectionAnnouncer,ResumeBanner}.tsx` | mounts all three | ✓ WIRED | ArticleView.tsx:252, 257, 260 |
| `src/reader/useScrollSave.ts` | `src/persistence/locationStore.ts` | debounced saveLocation + dual flush | ✓ WIRED | useScrollSave.ts:131, 162-168 |
| `src/reader/restoreLocation.ts` | `src/content/normalizeText.ts` | imports BLOCK_SEPARATOR + graphemeClusters + normalizeRunText (D-05) | ✓ WIRED | restoreLocation.ts:25 — exact contract |
| `src/reader/WipeConfirm.tsx` | `src/persistence/db.ts` | db.delete() + db.open() in destructive onClick (Pitfall 8) | ✓ WIRED | WipeConfirm.tsx:93-94 — sole executable call site |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `SettingsPanel` controls | `settings` (ReaderSettings) | SettingsContext state → Dexie-loaded + user-mutated | ✓ Real (Zod-validated) | ✓ FLOWING |
| `ArticleView` restore scroll | `loc.graphemeOffset` | Dexie → LocationRecordSchema.safeParse → findScrollTarget → scrollIntoView | ✓ Real (D-05 grapheme offset) | ✓ FLOWING |
| `ProgressHairline` fill | `progress` | window.scrollY / (scrollHeight - innerHeight) | ✓ Real (live scroll) | ✓ FLOWING |
| `SectionAnnouncer` text | `announce` | IntersectionObserver + scroll spy on rendered h2/h3/h4 | ✓ Real (DOM textContent) | ✓ FLOWING |
| `StorageRecoverySurfaces` | `storageState` | SettingsContext storageState (Dexie classify) | ✓ Real (5-branch classifier) | ✓ FLOWING |
| **Body typography (Gap 2 fix)** | `--font-size` / `--line-height` / `--letter-spacing` / `--word-spacing` | applyTheme writes on `<html>` from Zod-validated ReaderSettings; body rule consumes via `var()` | ✓ Real (SettingsPanel → applyTheme → body computed style) | ✓ FLOWING (proven by typography-live-apply.spec.ts — slider/radio changes reach body computed fontSize + wordSpacing) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit + component suite green | `npm run test:unit -- --run` | 242 passed (15 files), 0 failed | ✓ PASS |
| TypeScript clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| ESLint clean | `npm run lint` | exit 0 (no errors) | ✓ PASS |
| Playwright chromium suite green | `npx playwright test --project=chromium` | **46 passed**, 0 failed (7.4s) — **includes the 2 new gap-closure specs** | ✓ PASS |
| **Gap 1: hairline grows from left edge (behavior-dependent)** | `npx playwright test tests/e2e/progress.spec.ts:128 --project=chromium` | ✓ PASS — computed `transformOrigin` first token resolves to `0px` (left keyword computes to `0px 50%`), proving the origin sits on the left edge | ✓ PASS (behaviorally proven) |
| **Gap 2: typography cascade reaches body (behavior-dependent)** | `npx playwright test tests/e2e/typography-live-apply.spec.ts:37 --project=chromium` | ✓ PASS — default body `fontSize`=`18px`; after slider 18→24, `fontSize`=`24px`; Spacious → `wordSpacing` nonzero; Compact → `0px` | ✓ PASS (behaviorally proven) |
| Pitfall 1 focus-restore (behavior-dependent) | `npx playwright test panel-keyboard.spec.ts --project=chromium` | 2/2 pass (focus in dialog, restores to gear on Esc + × click) | ✓ PASS (behaviorally proven) |
| STATE-01 location restore (behavior-dependent) | `npx playwright test persistence.spec.ts -g "STATE-01" --project=chromium` | 3/3 pass (reload restores, flush works, D-06 isolation) | ✓ PASS (behaviorally proven) |
| db.delete isolation (Pitfall 8 — safety invariant) | `rg -n "db\.delete\(\)" src/` | 1 executable call site (WipeConfirm.tsx:93) + documentation matches | ✓ PASS |
| bfcache safety (Pitfall 4) | `rg -n "beforeunload\|addEventListener\(['\"]unload" src/` | 0 matches | ✓ PASS |
| `.progress-hairline-fill` no transition (UI-SPEC §Interaction 12) | inspect `src/app.css:722-729` | NO transition/animation property in the rule; NO-transition comment preserved through Gap 1 edit | ✓ PASS |
| **applyTheme writes custom properties only (Gap 2 — no bare property writes)** | `rg -n 'setProperty\("(font-size|line-height)"' src/settings/applyTheme.ts` | 0 matches (bare writes removed) | ✓ PASS |
| SectionAnnouncer live region polite (not assertive) | `rg -n "aria-live" src/reader/SectionAnnouncer.tsx` | line 119: `aria-live="polite"` | ✓ PASS |
| findScrollTarget reuses normalizeText | `rg "from \"\.\./content/normalizeText\"" src/reader/restoreLocation.ts` | line 25: imports BLOCK_SEPARATOR + graphemeClusters + normalizeRunText | ✓ PASS |
| Dexie version(1) byte-identical to pre-Phase-02 | `git show ba6f249:src/persistence/db.ts` vs current | version(1) constructor block identical (5 stores unchanged); only Table<> type annotations + interfaces + version(2) APPEND added | ✓ PASS |
| **FIRST body rule byte-unchanged through Gap 2 (regression)** | `git diff 491b6b7..96d514c -- src/app.css` | FIRST body rule (lines 67-72) + `:root` block byte-identical; only SECOND body rule + `.progress-hairline-fill transform-origin` changed | ✓ PASS |

### Probe Execution

N/A — Phase 2 has no `scripts/*/tests/probe-*.sh` probes. Validation is via the Vitest + Playwright matrix above.

### Requirements Coverage

| Req | Source Plan(s) | Description | Status | Code Evidence | Test Evidence |
|-----|---------------|-------------|--------|---------------|---------------|
| READ-01 | 02-01 | Clean semantic scrolling view | ✓ SATISFIED | `ArticleView.tsx:266-282` (article body single-mount); `app.css` `.article-body` | `tests/e2e/open-every-fixture.spec.ts` (6 fixtures × chromium ✓) |
| READ-02 | 02-01, **02-04** | Adjust font/size/spacing/measure | ✓ SATISFIED (**Gap 2 closed**) | `SettingsPanel.tsx:110-264` (5 fieldsets); `applyTheme.ts:32-38` writes 6 custom properties (no bare font-size/line-height); `app.css:135-139` body rule consumes var() | `tests/e2e/typography-live-apply.spec.ts:37` (**NEW** — body computed fontSize + wordSpacing track panel); `tests/component/SettingsContext.test.tsx` (live-apply on corrected `--font-size`/`--line-height` tokens); `tests/component/SettingsPanel.test.tsx`; `tests/unit/settingsSchema.test.ts` |
| READ-03 | 02-01 | Light/Dark theme set | ✓ SATISFIED | `SettingsPanel.tsx:232-264` (theme radios); `app.css` `[data-theme="light"]`/`[data-theme="dark"]` | `tests/component/SettingsContext.test.tsx` (data-theme write) |
| READ-04 | 02-01 | Calm interface, quiet secondary controls | ✓ SATISFIED (automated) — MANUAL-ONLY aesthetic check remains | `Header.tsx` (slim 48px, span wordmark, gear aria-expanded); SettingsPanel hides when closed | `tests/e2e/a11y.spec.ts` (axe violations=0); visual calmness deferred to human UAT |
| READ-05 | 02-03, **02-04** | Quiet structural progress, no page-number identity | ✓ SATISFIED (**Gap 1 closed**) | `ProgressHairline.tsx` (aria-hidden, `transformOrigin: "left"`, no transition); `app.css:726` (`transform-origin: left`); `SectionAnnouncer.tsx` (polite announce) | `tests/e2e/progress.spec.ts` (**5 tests** ✓ — incl. new transform-origin left-edge assertion at line 128); `tests/e2e/section-announce.spec.ts:129` (no page-number text ✓) |
| A11Y-01 | 02-01 | Full keyboard, no trap | ✓ SATISFIED | `<dialog>`/showModal (SettingsPanel.tsx:50, WipeConfirm.tsx:53) | `tests/e2e/panel-keyboard.spec.ts:20` (chromium ✓) |
| A11Y-02 | 02-01 | Visible logical focus, predictable across navigation | ✓ SATISFIED (automated) — MANUAL-ONLY visual focus-ring check remains | `triggerRef.current?.focus()` restore (SettingsPanel.tsx:75, WipeConfirm.tsx:79) | `tests/e2e/panel-keyboard.spec.ts` (focus movement ✓); visual focus quality → human UAT |
| A11Y-03 | 02-01 | Single content tree, semantic order | ✓ SATISFIED | Article stays mounted; `<dialog>` inert backdrop | `tests/e2e/a11y.spec.ts:71` (single-content-tree ✓) |
| A11Y-04 | 02-01 | Zoom/reflow | ✓ SATISFIED (320 CSS-px equivalent per UI-SPEC §Layout) | Reflow CSS; max-width measure caps | `tests/e2e/reflow.spec.ts:18+52` (chromium ✓) |
| A11Y-05 | 02-01 | Forced-colors/high-contrast | ✓ SATISFIED | Global `@media (forced-colors: active)` gate (Phase 1) + native semantics | `tests/e2e/forced-colors.spec.ts:17+36+50+97` (chromium ✓) |
| A11Y-06 | 02-01 | Reduced-motion | ✓ SATISFIED | Global `@media (prefers-reduced-motion)` gate; hairline has NO transition | `tests/e2e/reduced-motion.spec.ts:17+36+68` (chromium ✓) |
| A11Y-07 | 02-01 | Pointer/touch parity | ✓ SATISFIED | All controls ≥44×44px (CSS `--touch` minimum) | `tests/e2e/touch-targets.spec.ts:22+34` (chromium ✓) |
| A11Y-08 | 02-03 | Concise programmatic status | ✓ SATISFIED (automated) — MANUAL-ONLY NVDA/VoiceOver announce-quality check remains | `SectionAnnouncer.tsx` (debounced polite announce on h2/h3/h4 change) | `tests/e2e/section-announce.spec.ts:45+84` (chromium ✓); AT-quality → human UAT |
| STATE-01 | 02-03 | Location restored on reopen | ✓ SATISFIED | `ArticleView.tsx:124-170` (loadLocation→findScrollTarget→scrollIntoView) | `tests/e2e/persistence.spec.ts:206+251+283` (chromium ✓); `tests/unit/restoreLocation.test.ts` (4 findScrollTarget cases) |
| STATE-02 | 02-02 | Prefs persist locally across sessions | ✓ SATISFIED | `SettingsContext.tsx` debounced save + dual flush; `settingsStore.ts` Dexie put | `tests/e2e/persistence.spec.ts:56+89` (chromium ✓) |
| STATE-04 | 02-01, 02-02, 02-03 | Versioned/validated records | ✓ SATISFIED | `schema.ts:209-241` Zod schemas; safeParse on read in settingsStore + locationStore | `tests/unit/settingsSchema.test.ts` (46 cases); `tests/unit/locationSchema.test.ts` (30 cases); `tests/unit/storageFallback.test.ts` (corrupt branch) |
| STATE-05 | 02-02 | Recoverable error state | ✓ SATISFIED | `errors.ts` classifier; `WipeConfirm.tsx` (Pitfall 8); `StorageBanner.tsx`; App.tsx routing | `tests/unit/storageFallback.test.ts` (14 cases, 5 branches); `tests/e2e/persistence.spec.ts:123+164` (chromium ✓) |

**Requirements totals:** 17/17 SATISFIED with automated evidence. 2 strengthened by Gap closure (READ-02 typography cascade, READ-05 hairline origin). 3 carry additional manual-only UAT (see Human Verification Required).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER markers in any Phase 2 source file (incl. the 3 gap-closure edits) | ℹ️ Info | Clean |

`rg -n "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER\|placeholder\|coming soon\|not yet implemented"` across `src/reader/`, `src/persistence/`, `src/settings/`, `src/routes/ArticleView.tsx`, `src/App.tsx`, `src/app.css` → **0 matches.**

### Cross-Plan Integration

**Vertical slice connected across 4 plans (3 plans + 1 gap closure) — no orphaned seams:**

- **Plan 01 → 02:** `SettingsContext.tsx` exposes `storageState` + `resetLocalData` seam; Plan 02 fills them with Dexie load/save + classification. ✓
- **Plan 02 → 03:** `errors.ts` classifier + `settingsStore.ts` seam pattern is mirrored by `locationStore.ts`; `db.ts` `Table<>` typed properties already exist for `location`. ✓
- **Plan 03 → ArticleView:** All five new components (`ProgressHairline`, `SectionAnnouncer`, `ResumeBanner`, `useScrollSave`, `restoreLocation`) are mounted/wired in `ArticleView.tsx`. ✓
- **Plan 03 → 04 (gap closure):** `ProgressHairline.tsx` + `app.css .progress-hairline-fill` carried the invalid `inline-start` keyword into shipped code; `applyTheme.ts` + the SECOND body rule carried the bare-property regression. Plan 02-04 fixed both surgically with byte-unchanged preservation of every working path (`--font-body`, `--measure`, FIRST body rule, `:root`, the no-transition contract). ✓
- **App.tsx integration:** Wraps in `SettingsProvider`, mounts `Header` + `SettingsPanel` + `StorageRecoverySurfaces` (Plan 02 banner/wipe router). ✓
- **Header gear → SettingsPanel open:** `App.tsx:128-134` lifts `settingsOpen` state for both components. ✓
- **Dexie instance reuse:** `settingsStore`, `locationStore`, and `WipeConfirm.db.delete()` all use the same `db` export. ✓
- **bfcache-safe dual-flush pattern:** Identical in `SettingsContext.tsx:154-165` and `useScrollSave.ts:189-202`. ✓
- **Typography cascade contract (NEW — Plan 02-04 pattern):** `applyTheme` writes custom properties on `<html>`; the body rule consumes them via `var()` with literal first-paint fallbacks. Mirrors the working `--font-body` (FIRST body rule) + `--measure` (`.article-body max-width`) pattern. Documented in applyTheme.ts header rationale for Phase 3+ consumers. ✓

**No orphaned seams detected.**

### Human Verification Required

The 3 manual-only items below remain OPEN. They are documented in `02-VALIDATION.md` §Manual-Only Verifications and surface at the end-of-phase human checkpoint. **They are NOT gaps** — they are pure design/AT judgments that axe and Playwright cannot make. None blocks the phase's automated contract; none has a code-level root cause (confirmed: the 2 items that DID have code-level root causes were closed by Plan 02-04).

### 1. Screen-reader heading-change announce quality (A11Y-08)

**Test:** Run NVDA (Windows) or VoiceOver (macOS) across the 6-fixture corpus. Scroll past h2/h3/h4 headings at varying speeds; confirm the polite live region announces `Section: {heading}.` on section change without flooding during fast scroll.
**Expected:** Concise, non-flooding announce on section change. No announce within the same section. Polite (does not interrupt).
**Why human:** axe cannot judge announce conciseness/flood quality; AT semantics require a real screen reader.

### 2. Calm/quiet aesthetic of header + panel (READ-04)

**Test:** Visual review at default zoom (100%) and 200% zoom. Confirm the header reads as the "quietest possible chrome" — thin, low-contrast, no shadow, no accent fill. Confirm the closed gear does not permanently compete with article content. Confirm the panel slides calmly without jarring motion.
**Expected:** Aesthetic matches the PROJECT.md "calm, booklike" promise and UI-SPEC §Interaction 14 (Persistent header) quiet-chrome rule.
**Why human:** "calm" is a design judgment, not automatable.

### 3. Focus visibly logical across navigation (A11Y-02)

**Test:** Keyboard-traverse the full reader surface: skip-link → gear → Enter opens panel → Tab through all controls (5 fieldsets + Reset + close) → Esc closes → focus returns to gear. Then traverse ArticleView: tab to provenance link, activate, return.
**Expected:** Focus ring is visible (2px outline + 2px offset) at every step; order is logical; never lost.
**Why human:** `panel-keyboard.spec.ts` proves focus moves to the right elements, but visible-focus-ring quality is partly visual.

### Gaps Summary

**No code gaps remain.** Both UAT-diagnosed gaps from `02-UAT.md` are closed by Plan 02-04 with surgical fixes + new browser-level behavioral proof:

- **Gap 1 (READ-05, minor): CLOSED** — hairline now grows left-to-right (physical `left` keyword in both inline style + CSS rule); proven by `progress.spec.ts:128` computed-style assertion.
- **Gap 2 (READ-02, major): CLOSED** — text size + spacing now reach article text via custom-property cascade; proven by `typography-live-apply.spec.ts:37` real-browser proof.

All 17 requirements have automated evidence in the codebase + test suite (2 strengthened by gap closure). All 5 ROADMAP Success Criteria are verified. All artifacts exist, are substantive (no stubs), and are wired. The phase goal is technically achieved.

The 3 manual UAT items above are **not gaps** — they are the end-of-phase human verification that the GSD workflow routes through `verify-work`. They are intentionally manual (per `02-VALIDATION.md` §Manual-Only Verifications) and require human acknowledgement before advancing.

### Phase 03 Readiness

**Phase 02 is fully complete (4/4 plans including gap closure).** All automated checks pass:
- **242/242** unit + component tests green
- **46/46** chromium e2e tests green (**+2 NEW gap-closure specs**: `progress.spec.ts` transform-origin left-edge + `typography-live-apply.spec.ts` cascade proof)
- `npx tsc --noEmit` clean
- `npm run lint` clean (no jsx-a11y, no react-hooks, no no-danger violations)
- All 5 ROADMAP Phase 2 Success Criteria verified
- All 17 mapped requirements satisfied with automated evidence (READ-02 + READ-05 strengthened by gap closure)
- All 6 critical safety invariants hold (Pitfall 1, 4, 8, 9; aria-live=polite; normalizeText reuse; no transition on hairline)
- All artifacts substantive (no stubs)
- All wiring connected (no orphaned seams)

**Recommended next step:** Human acknowledges the 3 manual UAT items (NVDA/VoiceOver spot-check, calm-aesthetic visual review, keyboard-traverse focus visibility). On human ack, advance to Phase 03 (Trustworthy Layout Measurement). The Phase 03 roadmap entry builds on the Phase 2 scrolling substrate without modifying it — and now inherits a body whose typography is fully controlled via custom properties, so repagination will re-measure cleanly when size/line-height/letter-spacing/word-spacing change.

**Note on cross-engine matrix:** This re-verification ran chromium only (per the verification strategy — chromium is the project's primary engine). Plan 02-01 SUMMARY reports the full 3-engine matrix green for the 6 a11y specs; the 2 gap-closure specs are CSS-cascade + transform-origin fixes that behave identically across engines (no engine-specific CSS in the edits). If the human wants maximum coverage before Phase 03, run `npx playwright test` (all 3 engines) to confirm no firefox/webkit regressions.

---

_Verified: 2026-08-04T17:09:20Z_
_Verifier: the agent (gsd-verifier) — re-verification after Plan 02-04 gap closure_
