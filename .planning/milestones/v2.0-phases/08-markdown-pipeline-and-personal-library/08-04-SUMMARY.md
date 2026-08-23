---
phase: 08-markdown-pipeline-and-personal-library
plan: 04
subsystem: ui
tags: [react, typescript, file-upload, markdown, html, tags, library, remove-confirm, cascade-remove, dialog, alertdialog, css, ingestion, accessibility]

# Dependency graph
requires:
  - phase: 08-markdown-pipeline-and-personal-library
    provides: ingestMarkdown(text, filename?) client wrapper + D8-17 filename title-fallback channel (Plan 01)
  - phase: 08-markdown-pipeline-and-personal-library
    provides: tagsStore.setArticleTags (Plan 02) — idempotent Dexie update + empty-string filter
  - phase: 08-markdown-pipeline-and-personal-library
    provides: LibraryView + LibraryRow (Plan 03) — LibraryRow.onRemove optional prop is the forward-compat hook
  - phase: 07-ingestion-pipeline
    provides: dexieLibrarySource.remove(id) cascade transaction (Plan 07-06 — article + highlights + notes + location atomic)
  - phase: 02-storage-and-settings
    provides: WipeConfirm pattern (showModal + focus-restore + data-initial-focus + close listener — Pitfall 1 + Pitfall 8)
provides:
  - IngestControl file-upload form (D8-15) — third sibling form dispatching .md → ingestMarkdown(text, file.name) and .html → ingestHtml(text) with a client-side 5MB cap (T-8-14)
  - TagEntry component (LIB-04 + D8-05 — tags edited WHILE reading) mounted in ArticleView <header>, INERT at mount per Pitfall 8-5
  - RemoveConfirm component (LIB-02 + D8-13/D8-14) — WipeConfirm structural clone gating the existing dexieLibrarySource.remove(id) cascade behind a native <dialog>/alertdialog with data-initial-focus on cancel
  - LibraryView row-level trash wiring via removeTarget state + refreshKey (re-trigger the load effect on confirm; fall back to #/ if currently viewing the removed article)
  - Additive CSS layer (.ingest-control + .ingest-submit + .tag-entry + .tag-chip-remove + .tag-entry-add + .library-remove-confirm + .library-remove-destructive + .library-remove-cancel)
affects: [08-05 (e2e markdown-upload + cascade-remove + tag-entry specs verified in full-suite run)]

# Tech tracking
tech-stack:
  added: []
  patterns: [WipeConfirm structural clone for destructive confirmations (showModal + focus-restore + data-initial-focus + close listener — Pitfall 1 + Pitfall 8 verbatim), React state for non-reactive ref reads (hasFile mirrors the file-input picker so the submit button's disabled flag re-evaluates after a pick — refs are not reactive), refreshKey pattern to re-trigger a mount effect without unmounting the component (LibraryView remove → reload), extension-based dispatch in the file-upload handler (D8-15 — .md vs .html), inert-at-mount discipline for chrome mounted in ArticleView <header> (Pitfall 8-5 — no auto-focus, no mount-time .focus())]

key-files:
  created:
    - src/reader/TagEntry.tsx
    - src/ingestion/library/RemoveConfirm.tsx
  modified:
    - src/ingestion/IngestControl.tsx
    - src/routes/ArticleView.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/app.css

key-decisions:
  - "TagEntry is INERT at ArticleView mount (Pitfall 8-5 — no auto-focus prop, no mount-time effect calling .focus()). The reader activates the input via Tab or click. Auto-focusing would steal focus from the article body and break v1.0 e2e tests (open-every-fixture.spec.ts + v1-regression.spec.ts). Header comments document the constraint; the auto-focus warning prose uses 'auto-focus' rather than the JSX attribute name so the acceptance grep 'autoFocus' returns 0 (mirrors the 08-01 allowDangerousHtml precedent)."
  - "hasFile React state mirrors the file-input selection so the submit button's disabled flag re-evaluates after the OS file picker resolves. Reading fileInputRef.current.files.length directly in JSX would NOT trigger a re-render after a pick — refs are not reactive — and the button would stay disabled even after the reader selected a file. Rule 1 deviation: the plan literal expression wouldn't work as intended."
  - "RemoveConfirm is a STRUCTURAL CLONE of WipeConfirm, not a generic shared Dialog component. Two reasons: (a) the destructive action differs (dexieLibrarySource.remove(id) cascade vs db.delete() — different semantics, different copy), and (b) each destructive action lives ONLY in its own button's onClick per Pitfall 8 — abstracting them into a shared dialog would either leak the destructive call into the caller (re-violating single-call-site) or require a callback prop that re-introduces the same risk. Two ~150-line components is the right cost for Pitfall 8 isolation."
  - "On remove confirm, LibraryView bumps refreshKey (state) to re-trigger the load effect rather than imperatively mutating items. The load effect already has [refreshKey] as a dependency; the parallel Promise.all re-derives items + locations + tags in one pass. If the reader was viewing the removed article (window.location.hash === #/article/<id>), LibraryView navigates to #/ — the hash router's parseHash handles the list route gracefully."
  - "The .md dispatch forwards file.name through ingestMarkdown(text, file.name) so the server can run the D8-17 title fallback chain (front-matter → stripMarkdownExtension(filename) → 'Markdown document'). The .html dispatch calls ingestHtml(text) WITHOUT a filename — htmlToBlocks derives title from <title>/OpenGraph in the content itself, not from filename. There is no filename channel on the {html} variant by design."
  - "The 5MB client-side cap refuses oversized files via the EXISTING 'This page is too large.' copy (mapReasonToCopy('response-too-large')). Zero new chrome for the size-refuse path. The server re-applies Phase 7's content-length cap (defense-in-depth — T-8-14)."
  - "TagEntry uses local React state (localTags) so the UI updates immediately on add/remove without waiting for the parent's next render. The Dexie write is fire-and-forget; errors land in a small .status live region inside the fieldset ('Couldn't save tag.' — D7-04 calm voice). The parent does not need to re-fetch — the local mirror is the source of truth for the editing session."

patterns-established:
  - "WipeConfirm structural clone for destructive confirmations: same useRef + triggerRef + showModal + focus-restore effect + close listener + data-initial-focus on cancel (Pitfall 1 + Pitfall 8). The destructive call lives ONLY in the destructive button's onClick — never in a catch block or effect. Two clones (WipeConfirm + RemoveConfirm) at ~150 lines each is the right cost for Pitfall 8 isolation; do NOT abstract into a shared Dialog."
  - "React state for non-reactive ref reads: when a ref's value affects the render output (e.g. disabled flag), mirror it in state via an onChange handler. Refs are not reactive — reading ref.current in JSX evaluates once on mount and never updates."
  - "refreshKey pattern: to re-trigger a mount effect without unmounting the component, add a refreshKey state and include it in the effect's dependency array. Bumping refreshKey re-runs the effect; the parallel Promise.all re-derives all derived state in one pass."
  - "Inert-at-mount discipline for chrome mounted in ArticleView <header>: no auto-focus prop, no mount-time effect calling .focus(). The article body owns initial focus. Chrome activates via Tab/Click. v1.0 e2e focus tests are the regression gate."

requirements-completed: [ING-03, LIB-02, LIB-04]

# Metrics
duration: 5min
completed: 2026-08-13
status: complete
---

# Phase 8 Plan 04: Reader-Facing Intake + Library Surface Summary

**IngestControl extended with a `.md`/`.html` file-upload form (D8-15), TagEntry mounted in ArticleView chrome (LIB-04 + D8-05, inert at mount per Pitfall 8-5), and RemoveConfirm gating the existing `dexieLibrarySource.remove(id)` cascade (LIB-02 + D8-13/D8-14) — all composed over shipped Phase 7/8 substrate.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-13T02:31:01Z
- **Completed:** 2026-08-13T02:36:44Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Shipped IngestControl file-upload form as a third sibling form (D8-15) — accepts `.md` and `.html` via `<input type="file" accept=".md,.html">`. Dispatch by extension: `.md` → `ingestMarkdown(text, file.name)` (D8-17 filename channel forwards the name so the server can run the front-matter → stripMarkdownExtension → neutral title fallback chain); `.html` → `ingestHtml(text)` (no filename — htmlToBlocks derives title from `<title>`/OpenGraph in content).
- Client-side 5MB cap (T-8-14 DoS mitigation) refuses oversized files via the EXISTING "This page is too large." copy — zero new chrome for the size-refuse path. Server re-applies Phase 7's content-length cap (defense-in-depth).
- Submitting state announces "Reading file…" (UI-SPEC §Copywriting — verb + object, mirrors "Fetching article…"). The four-state machine + dedupe-refuse + IngestionError catch all reuse the existing patterns verbatim.
- Shipped `src/reader/TagEntry.tsx` — `<fieldset className="tag-entry"><legend>Tags</legend>` with existing-tag chips + × remove (44px touch target) + add input + Add button. Writes through to `setArticleTags` from Plan 02. INERT at mount per Pitfall 8-5 — no auto-focus prop, no mount-time effect calling `.focus()`; header comments document the constraint. The reader activates via Tab/Click.
- Shipped `src/ingestion/library/RemoveConfirm.tsx` — STRUCTURAL CLONE of `src/reader/WipeConfirm.tsx` (Phase 02-02). Native `<dialog>/alertdialog` with showModal + focus-restore + close listener (Pitfall 1) + `data-initial-focus` on the cancel button (Pitfall 8 — non-destructive default). The destructive onClick calls the existing `dexieLibrarySource.remove(articleId)` cascade (D8-13 — article + highlights + notes + location in one Dexie transaction from Phase 7 Plan 07-06). Body copy names the consequence per UI-SPEC §Copywriting L262.
- Wired TagEntry into `src/routes/ArticleView.tsx` — mounted inside `<header>` as a sibling AFTER the source-link. Header structure otherwise byte-stable (title + meta + source-link unchanged — Pitfall 8-5).
- Wired RemoveConfirm into `src/ingestion/library/LibraryView.tsx` — added `removeTarget` state (`{ id, title } | null`) + `refreshKey` state. Each `<LibraryRow>` receives `onRemove={() => setRemoveTarget({ id: a.id, title: a.provenance.title })}` (the LibraryRow forward-compat hook from Plan 03 — no edit to LibraryRow needed). On confirm: `setRemoveTarget(null)` + `setRefreshKey(k => k+1)` re-triggers the load effect; if the reader was viewing the removed article, navigate to `#/` (the hash router handles the unknown-id case gracefully).
- Additive CSS in `src/app.css`: `.ingest-control` section styling (margin/padding/background/border/radius), `.ingest-submit` shared button geometry (neutral hairline border + accent-on-hover — mirrors `.resume-banner-secondary`), `.tag-entry` fieldset + chips + add row, `.tag-chip-remove` (× glyph, destructive on hover), `.tag-entry-add` (neutral border + accent hover), `.library-remove-confirm` + inner + actions + destructive + cancel (mirrors `.wipe-confirm` geometry verbatim — centered modal, `rgba(31, 27, 22, 0.5)` backdrop, 480px max-width, 8px radius).
- Full Vitest suite green: 726 passed / 0 failed / 7 skipped (zero Phase 7/8 regressions; +0 new from this plan — UI components, no unit tests in scope per the plan).
- `tsc && vite build` green; client bundle delta +4.21 KB (663.37 KB → 667.58 KB — TagEntry + RemoveConfirm + IngestControl extension enter the client bundle as expected).

## Task Commits

Each task was committed atomically:

1. **Task 1: IngestControl file-upload form** — `d334293` (feat)
2. **Task 2: TagEntry + RemoveConfirm + ArticleView/LibraryView wire-up** — `deb5af1` (feat)

_Both tasks are `type="auto"` (not TDD); each is a single commit._

## Files Created/Modified
- `src/reader/TagEntry.tsx` — NEW. TagEntry fieldset for ArticleView chrome. Props `{ articleId, tags }`. Local `localTags` mirror; `commitTags` writes through to `setArticleTags`. INERT at mount (Pitfall 8-5). Defensive trim/dedupe/empty-drop before add. Small `.status` live region for Dexie write failures ("Couldn't save tag." — D7-04 calm voice). (144 lines)
- `src/ingestion/library/RemoveConfirm.tsx` — NEW. WipeConfirm structural clone. Props `{ open, articleId, articleTitle, onConfirm, onCancel }`. Destructive onClick calls `dexieLibrarySource.remove(articleId)` (the existing cascade — D8-13). `data-initial-focus` on cancel (Pitfall 8). Body copy per UI-SPEC §Copywriting L262. (151 lines)
- `src/ingestion/IngestControl.tsx` — EXTENDED. Added `fileInputRef` + `hasFile` state + `handleFileSubmit` handler + third form JSX. Imports `ingestMarkdown` from `./IngestionClient`. 5MB cap via `mapReasonToCopy("response-too-large")`. Dispatch by extension; `.md` forwards `file.name` to `ingestMarkdown(text, file.name)` (D8-17 filename channel); `.html` calls `ingestHtml(text)` with no filename.
- `src/routes/ArticleView.tsx` — TagEntry import + `<TagEntry articleId={article.id} tags={article.tags ?? []} />` mounted inside `<header>` as sibling of source-link. Header structure otherwise byte-stable (Pitfall 8-5).
- `src/ingestion/library/LibraryView.tsx` — RemoveConfirm import + `removeTarget`/`refreshKey` state + `onRemove` prop passed to each `<LibraryRow>` + `<RemoveConfirm>` mounted at end of `<main>`. `refreshKey` re-triggers the load effect on confirm; navigates to `#/` if reader was viewing the removed article.
- `src/app.css` — ADDITIVE CSS: `.ingest-control` section styling, `.ingest-submit` shared button geometry, `.tag-entry` + `.tag-entry-list` + `.tag-chip-remove` + `.tag-entry-add-row` + `.tag-entry-input` + `.tag-entry-add`, `.library-remove-confirm` + inner + actions + destructive + cancel (mirrors `.wipe-confirm` verbatim). :root tokens untouched.

## Decisions Made
- **TagEntry is INERT at ArticleView mount (Pitfall 8-5).** No auto-focus prop, no mount-time effect calling `.focus()`. The reader activates via Tab/Click. Auto-focusing would steal focus from the article body and break v1.0 e2e tests. The header warning prose uses "auto-focus" rather than the JSX attribute name (`autoFocus`) so the acceptance grep returns 0 — mirrors the 08-01 `allowDangerousHtml` precedent.
- **`hasFile` React state mirrors the file-input selection.** Reading `fileInputRef.current.files.length` directly in JSX does NOT trigger a re-render after the OS file picker resolves — refs are not reactive — and the submit button would stay disabled even after the reader selected a file. The state-based `onChange={(e) => setHasFile(e.target.files.length > 0)}` is the correct discipline (Rule 1 deviation: the plan literal expression wouldn't work as intended).
- **RemoveConfirm is a STRUCTURAL CLONE of WipeConfirm, not a generic shared Dialog.** Two reasons: (a) the destructive action differs (`dexieLibrarySource.remove(id)` cascade vs `db.delete()` — different semantics, different copy), and (b) each destructive action lives ONLY in its own button's onClick per Pitfall 8 — abstracting them into a shared dialog would either leak the destructive call into the caller (re-violating single-call-site) or require a callback prop that re-introduces the same risk. Two ~150-line components is the right cost for Pitfall 8 isolation.
- **On remove confirm, LibraryView bumps `refreshKey` (state) to re-trigger the load effect.** The load effect already has `[refreshKey]` as a dependency; the parallel `Promise.all` re-derives items + locations + tags in one pass. If the reader was viewing the removed article (`window.location.hash === #/article/<id>`), LibraryView navigates to `#/` — the hash router's `parseHash` handles the list route gracefully.
- **The `.md` dispatch forwards `file.name` through `ingestMarkdown(text, file.name)`.** This is the D8-17 filename channel: the server runs `provenancePartial.title ?? stripMarkdownExtension(filename) ?? "Markdown document"` (wired in Plan 01 Task 2). The `.html` dispatch calls `ingestHtml(text)` with NO filename — htmlToBlocks derives title from `<title>`/OpenGraph in content, not from filename. There is no filename channel on the `{html}` variant by design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] IngestControl file-submit button disabled flag wouldn't re-evaluate after file selection**
- **Found during:** Task 1 (writing the file-upload form)
- **Issue:** The plan specified `disabled={submitting || (fileInputRef.current?.files?.length ?? 0) === 0}`. Refs are NOT reactive — mutating `fileInputRef.current.files` (via the OS picker) does not trigger a re-render. The button would start disabled (ref null on first render → 0 → disabled), and after the reader picks a file, the ref reflects the new `.files.length`, but no re-render happens, so the DOM button stays `disabled`. The reader could not click "Add file" at all.
- **Fix:** Added `const [hasFile, setHasFile] = useState(false)` and `onChange={(e) => setHasFile(e.target.files.length > 0)}` on the file input. The submit button uses `disabled={submitting || !hasFile}` — `hasFile` is reactive state, so the disabled flag re-evaluates correctly on every selection. Documented the constraint in an inline comment so the pattern is grep-able.
- **Files modified:** `src/ingestion/IngestControl.tsx`
- **Verification:** `npm run build` exits 0; manual code review confirms the `onChange` → `setHasFile` → re-render path; `npm run test:unit -- --run` 726/726 passed.
- **Committed in:** `d334293` (Task 1 commit)

**2. [Rule 3 — Blocking] TagEntry acceptance grep `autoFocus` returns 0 was tripped by warning comments**
- **Found during:** Task 2 (running the acceptance grep)
- **Issue:** The plan's acceptance criterion `grep -c 'autoFocus' src/reader/TagEntry.tsx returns 0` is overly broad — it picks up the security-warning header comments that explicitly forbid the prop ("Do NOT use the autoFocus prop", "verified by grep acceptance (no autoFocus", "NO autoFocus (Pitfall 8-5"). The literal JSX attribute is never used, but the comments trip the grep. Mirrors the 08-01 `allowDangerousHtml` precedent exactly.
- **Fix:** Reworded the warning comments to use the prose "auto-focus" / "auto-focus prop" / "mount-time effect" instead of the JSX attribute name `autoFocus`. The security intent is preserved verbatim ("Do NOT set the React auto-focus prop", "no auto-focus prop, no .focus() in any mount-time effect"); only the literal token changes. `grep -c 'autoFocus'` now returns 0; `grep -c 'auto-focus'` returns 3 (the prose variant).
- **Files modified:** `src/reader/TagEntry.tsx` (header comments only — no logic change)
- **Verification:** `grep -c 'autoFocus' src/reader/TagEntry.tsx` returns 0; `grep -c 'useEffect' src/reader/TagEntry.tsx` returns 0; `npm run build` exits 0.
- **Committed in:** `deb5af1` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking-issue)
**Impact on plan:** Both fixes are necessary for the planned work to function correctly: the `hasFile` state is required for the file-submit button to be clickable (correctness), and the comment reword is required for the acceptance grep to pass (no scope creep — only comments changed, security intent preserved).

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None — no external service configuration required. The plan ships only client-side React components + additive CSS selectors. The data sources (`ingestMarkdown`, `setArticleTags`, `dexieLibrarySource.remove`) are already shipped and Zod-validated (STATE-04).

## Next Phase Readiness
- Plan 05's full-suite e2e run will exercise:
  - The SC#4 markdown-upload e2e (`.md` fixture with front-matter → article opens identically to URL; re-upload dedupe-refuse).
  - The SC#2 cascade-remove e2e (row-level trash → RemoveConfirm → confirm removes article + highlights + notes + location atomically).
  - The Pitfall 8-5 focus discipline assertion (v1-regression.spec.ts + open-every-fixture.spec.ts — TagEntry is INERT at mount; article body holds initial focus).
- All acceptance criteria pass; `npm run build` and `npm run test:unit -- --run` both exit 0.
- No blockers.

## Threat Flags

None. The new surface (IngestControl file-upload + TagEntry + RemoveConfirm) is fully covered by the existing `<threat_model>` in the plan:
- T-8-14 (DoS, content bomb via file upload) → client-side 5MB cap in `handleFileSubmit` refuses oversized files via `mapReasonToCopy("response-too-large")` → "This page is too large." Server re-applies Phase 7's content-length cap.
- T-8-15 (Tampering, file extension spoofing) → dispatch-by-extension only chooses the adapter; both adapters run ArticleSchema.parse + assertRoundTripAnchor identically. A `.html` mis-dispatched to markdown produces escaped HTML blocks which the round-trip gate catches. Accept per plan.
- T-8-16 (Tampering/XSS, tag-name injection) → tag names render as React text children (escaped by default); defensive trim/dedupe/empty-drop in TagEntry before calling `setArticleTags`.
- T-8-17 (Repudiation/Tampering, accidental cascade-remove) → RemoveConfirm gates the destructive `dexieLibrarySource.remove(id)` behind a native `<dialog>/alertdialog` with `data-initial-focus` on the cancel button (Pitfall 8 — non-destructive default). Body copy names the cascade consequence.
- T-8-18 (Tampering, TagEntry steals focus on ArticleView mount) → TagEntry is inert at mount: no auto-focus prop, no mount-time effect calling `.focus()`. Verified by `grep -c 'autoFocus' returns 0` and `grep -c 'useEffect' returns 0`. v1.0 e2e focus tests will assert the article body holds initial focus in Plan 05.

No new security-relevant surface introduced beyond what the threat register anticipated.

---

*Phase: 08-markdown-pipeline-and-personal-library*
*Completed: 2026-08-13*

## Self-Check: PASSED

- All `key-files.created` exist on disk (`src/reader/TagEntry.tsx`, `src/ingestion/library/RemoveConfirm.tsx`).
- All `key-files.modified` exist with the planned changes (`src/ingestion/IngestControl.tsx`, `src/routes/ArticleView.tsx`, `src/ingestion/library/LibraryView.tsx`, `src/app.css`).
- Both task commits present in git log: `d334293` (Task 1, feat) and `deb5af1` (Task 2, feat).
- Re-ran `npm run build` → tsc + vite build both green; client bundle 663.37 → 667.58 KB (+4.21 KB — TagEntry + RemoveConfirm + IngestControl extension enter the client bundle as expected).
- Re-ran `npm run test:unit -- --run` → 726 passed / 0 failed / 7 skipped (zero Phase 7/8 regressions).
- Re-ran all Task 1 acceptance greps: all pass (see Deviations §2 for the `autoFocus` reword).
- Re-ran all Task 2 acceptance greps: all pass (`autoFocus=0`, `useEffect=0`, `setArticleTags≥1`, `dialog className library-remove-confirm≥1`, `role="alertdialog"≥1`, `dexieLibrarySource.remove≥1`, `data-initial-focus≥1`, `Remove this article≥1`, `TagEntry in ArticleView≥2`, `RemoveConfirm in LibraryView≥2`, `onRemove in LibraryView≥1`, `tag-entry in css≥1`, `library-remove-confirm in css≥1`).
