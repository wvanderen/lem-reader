# A minimal hand-rolled InnerTube client, no transcript dependency

The server fetches YouTube transcripts with a ~300-line project-owned InnerTube client (`server/youtubeTranscript.ts`) rather than a transcript library, because the ingest pipeline's guarantees — regex-validated ids before any request, one SSRF-guarded fetch pipeline, typed calm refusals, no retries, no hidden cache — would each have to be audited and re-wrapped around a third-party dependency that owns its own fetch path. The library is the cache: fetched transcripts are saved articles, and refusals are terminal.

## Considered options

- **`youtubei.js` 18.0.0** (rejected): covers transcripts + metadata + chapters from one dependency, but it owns a full InnerTube session client (deciphering, cookies, proxies, PO tokens) with a large audit surface, and its internal fetch path bypasses the safeFetch pipeline — wrapping it would fork the security boundary the pipeline exists to keep single.
- **Official YouTube Data API v3** (rejected): `captions.download` requires owner permission — third-party transcript download is impossible; usable at most for optional metadata.

## Consequences

- The two InnerTube POSTs (`player` ANDROID context, `next` WEB context for chapters) target constant code-owned URLs guarded by per-call timeout/size caps; the signed caption GET alone carries a third-party URL and therefore flows through the full `safeFetchCore` pipeline under a caption-infrastructure host pin (`www.youtube.com` / `*.googlevideo.com`).
- The client is exposed to YouTube's InnerTube churn (client-version drift, IP-level 429s, attestation experiments). When it breaks, it refuses calmly with one of four structured kinds (`no-captions`, `unavailable-private`, `age-gated`, `bot-check`) or an honest transport reason — it never degrades silently, and fixtures captured per docs/spikes/0008 make drift visible in CI.
- No server-side cache, no retry: re-fetching a transcript is a reader action, and the saved article persists in the local library.

---
Decided in [Transcript fetch client & cache posture: youtubei.js vs minimal InnerTube client](https://github.com/wvanderen/lem-reader/issues/27), 2026-09-16.
