# Deferred Items — quick task 260819-qbq

## Pre-existing (out of scope, discovered during Task 1 lint gate)

- `npm run lint` fails with 3 PRE-EXISTING errors in `src/portability/zipSlip.ts`
  (2× `no-control-regex` at 34:7 and 76:14 — `/\x1f/` control chars; 1×
  `no-useless-escape` at 77:16 — `\/`). File last touched 2026-08-15 in
  `9793d1f feat(09-01): implement bundle schema + zip slip guard`; the quick
  task's working-tree diff touches only `src/app.css` (not linted by ESLint),
  so the errors cannot originate here. NOT fixed per the scope-boundary rule.
  Note: the intentional control-char regexes may simply need inline
  `eslint-disable-next-line no-control-regex` justification comments — owner
  call, not auto-fixable prose-free.
