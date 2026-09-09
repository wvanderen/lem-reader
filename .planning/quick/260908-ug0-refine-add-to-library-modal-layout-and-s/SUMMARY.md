---
status: complete
---
# Add to Library refinement

Reorganized native source radios into a compact selector; introduced a stable input region and shared Cancel/submit footer. Preserved warm-paper tokens, ingest handlers, file retention, focus handling and live announcements. Fixed authored display overriding hidden upload forms, input box overflow, empty status chrome and mobile action wrapping. Source selection is disabled during ingestion.

Validation: 21 component tests; 33 focused-add/upload-queue browser tests across Chromium, Firefox and WebKit; production build; targeted ESLint; git diff --check. Impeccable detector returned no findings. Inspected desktop 1200×900 and mobile 375×812 for all three sources in two bounded visual passes. Existing bundle-size warning remains.

Updated browser selectors for shared footer and replaced a stale hardcoded fixture title with fixtureArticle.title. Added stable dialog/footer and inactive-form regression coverage.
