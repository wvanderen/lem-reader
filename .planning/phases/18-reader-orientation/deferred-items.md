# Phase 18 Deferred Items

Out-of-scope discoveries logged during execution (not fixed per executor
scope boundary — only issues directly caused by the current task's changes
are auto-fixable).

## 18-01

- **Pre-existing TS error in `tests/e2e/ingestion/dexie-migration.spec.ts:715`**
  (TS2339: Property 'provenance' does not exist on the narrowed
  `articleRow` type `{ id, readerTitle?, readerAuthor? }`). Introduced by
  Phase 17 commit 83d8f99 ("v5-row override hydration migration proof") —
  `articleRow` is narrowed by an earlier indexed-access and the later
  `articleRow?.provenance` access trips TS 7 narrowing. Discovered during
  18-01 Task 1's `npx tsc --noEmit` verification; unrelated to `toc.ts`
  (nothing in the ingestion spec imports it). Unit + e2e suites unaffected
  (Vite transform does not type-check); needs a fix in the spec's own type
  annotation (e.g. typing the row as the raw IndexedDB shape).
