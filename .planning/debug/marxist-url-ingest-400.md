---
status: awaiting-reproduction
trigger: Deployed article ingestion returns HTTP 400 with reason server-error.
---

## Symptoms
Expected: Add the supplied marxist.com Minneapolis Teamsters article to the library.
Actual: Production returns {ok:false,reason:"server-error"} after about 10.7 seconds.
Reproduction: Submit the supplied URL through Add by URL on lem-reader.vercel.app.
Timeline: Reported September 7, 2026; first occurrence unknown.

## Current Focus
hypothesis: Intermittent upstream transport failure; exact original exception remains unknown.
next_action: Retry in the reader. If failure recurs, capture server-side exception diagnostics.

## Evidence
- The ingest catch suppresses all non-IngestionError details and returns server-error.
- The adapter maps every typed refusal to HTTP 400.
- Production replay on 2026-09-08 UTC returned HTTP 200 in 2.70 seconds with the expected title and confident extraction.
- Direct retrieval of the source HTML also succeeded (162299 bytes).
- No application code changed: the reported failure has not reproduced, and a timeout is only a hypothesis. Generic native fetch failures currently reach the catch as server-error.
