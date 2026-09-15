# Spike 0008: Fetching YouTube transcripts in 2026 — methods, formats, risks

**Issue:** [wvanderen/lem-reader#20](https://github.com/wvanderen/lem-reader/issues/20)
**Status:** Complete — **recommendation: one server-side InnerTube caption fetch (library-aided), official Data API at most for optional metadata, public Invidious/Piped instances not relied on**
**Scope guard honored:** research only. No production changes.

---

## 1. The question

Lem Reader's ingest endpoint (`server/safeFetch.ts` → `server/ingest.ts`) normalizes web articles. Can it also obtain a YouTube video's **transcript** plus **title, channel, duration, chapters** — reliably, calmly, and within the project's honesty and security constraints? This doc compares four method families and records live-probe evidence from **2026-09-14**.

**Method of research:** primary sources (official API docs, library source code, instance API docs) plus live `curl` probes against youtube.com and the public instance ecosystem on the research date. All probe results below are first-hand.

---

## 2. Method A — direct `timedtext` caption endpoints

**The idea:** YouTube serves caption data at `https://www.youtube.com/api/timedtext?v=VIDEO_ID&lang=en&fmt=json3` (historically also `https://video.google.com/timedtext?...`).

**Live probe (2026-09-14):** a bare request for a captions-rich video (`dQw4w9WgXcQ`) returns **HTTP 200 with an empty body** (`content-type: text/html`). The bare-parameter form has been dead for third parties since YouTube began requiring session-bound signature (`pot`/`signature`/`exp`-family) parameters — those are issued inside the caption-track `baseUrl` values that only a **player session** (watch-page HTML or an InnerTube `player` response) can produce. The endpoint is a *delivery* URL, not a *discovery* URL: you must already have the per-session signed URL.

**Formats** (when fetched via a valid `baseUrl`, `fmt=` / official `tfmt=` values — the official `captions.download` doc lists the same family):

| Format | Shape | Timing granularity |
|---|---|---|
| `json3` | JSON: `events[]` with `tStartMs`, `dDurationMs`, `segs[]` (`utf8`, `tOffsetMs`) | line-level events with **per-word offsets** |
| `srv1` | XML `<text start="…​" dur="…​">line</text>` | **per-line** |
| `srv2` | XML, per-line events with word `<s>` children | line + word |
| `srv3` | XML word-level | **per-word** |
| `vtt` / `ttml` | WebVTT / TTML | line-level cues |
| `sbv`, `scc`, `srt` | legacy subtitle containers | cue-level |

Evidence that YouTube now defaults player-issued `baseUrl`s to the word-level `srv3`: `youtube-transcript-api` strips it — `caption["baseUrl"].replace("&fmt=srv3", "")` — and parses the remaining `srv1`-style XML (source: `youtube_transcript_api/_transcripts.py`).

**Availability:** track discovery lives in the player response under `captions.playerCaptionsTracklistRenderer.captionTracks[]`, each with `languageCode`, `name`, `kind: "asr"` (auto-generated) or absent (manual), `isTranslatable`, and a `translationLanguages[]` list. Manual tracks are preferred by every sane client; ASR tracks are usually present for spoken content.

**Failure modes:** empty body (no/invalid signature), `&exp=xpe` experiment flag on the `baseUrl` ⇒ the library raises `PoTokenRequired` (YouTube is A/B-ing attestation-gated captions; source: `_transcripts.py` `fetch()`), private/unlisted videos never yield a track list, age-gated videos require login.

**Verdict:** not a standalone method — it is the last mile of Method B.

---

## 3. Method B — InnerTube-scraping libraries (the `youtube-transcript-api` family)

All of these scrape YouTube's **private InnerTube API** (`POST https://www.youtube.com/youtubei/v1/player`), not the Data API. None are affiliated with YouTube.

| | `youtube-transcript-api` (Python) | `youtube-transcript` (TS) | `youtubei.js` / `YouTube.js` (TS) |
|---|---|---|---|
| Version (2026-09-14) | 1.2.4 (PyPI) | 1.3.1 (npm, 2026-04-25) | 18.0.0 (npm, 2026-08-13) |
| Flow | GET watch HTML → consent cookie → extract `INNERTUBE_API_KEY` → POST `player` (WEB context) → `captionTracks[].baseUrl` fetch | POST `youtubei/v1/player` (ANDROID client `20.10.38`) directly → regex-parse transcript XML | full InnerTube session client (`getInfo()`) with player deciphering, cookies, proxies, PO-token support |
| Returns | `FetchedTranscript` snippets `{text, start, duration}` + `language`, `language_code`, `is_generated`; `list()` for track discovery; translation via `translate()` | `TranscriptResponse[]` `{text, start, duration}` | complete `VideoInfo`: `basic_info` (title, author, duration, keywords…), captions, chapters via engagement panels, plus everything else InnerTube exposes |
| Language negotiation | priority-ordered `languages=['de','en']`; manual preferred over ASR; `find_generated/manually_created_transcript` | minimal: first available track | client-level `lang`/`location`; track list from player response |
| Metadata (title/channel/duration) | ✗ transcripts only | ✗ transcripts only | ✓ full |
| Failure taxonomy | typed: `TranscriptsDisabled`, `NoTranscriptFound`, `AgeRestricted`, `VideoUnplayable`, `RequestBlocked`/`IpBlocked` (HTTP 429), `PoTokenRequired`, `VideoUnavailable` | typed incl. `YoutubeTranscriptTooManyRequestError`, `TranscriptDisabledError` | InnerTube errors surfaced by client |
| Blocked-IP story | README: "YouTube has started blocking most IPs that are known to belong to cloud providers" — rotating **residential proxies** are the documented workaround; cookie auth for age-gated videos "currently not available" | none built in | proxy + `po_token` config options |
| Health | actively maintained, large user base | small, but updated 2026-04 | actively maintained (2026-08), large community |

**Common failure modes** (InnerTube-level `playabilityStatus`): `OK`, `ERROR` (video unavailable/private → typed refusal), `LOGIN_REQUIRED` with reason "Sign in to confirm you're not a bot" (bot detection) or "This video may be inappropriate…" (age gate). Transcripts-off videos expose `TranscriptsDisabled`. Unlisted videos with the link work; private ones never do.

**Rate-limiting reality:** per-IP 429s and hard IP blocks (especially cloud-provider ranges), not token-bucket quotas. For a **personal-use** app fetching one video per user action, residential-proxy escalation is *not* needed — but caching and polite pacing are mandatory from day one.

**Verdict:** this is the only working transcript path. For Lem Reader (Node server), `youtubei.js` gives transcripts **and** metadata **and** chapters from one dependency; the minimal `youtube-transcript` approach proves a ~150-line hand-rolled client is viable if dependency weight matters.

---

## 4. Method C — Invidious / Piped public instances

Both are community reverse-proxy projects with JSON APIs that wrap InnerTube. Both nominally solve CORS (instances send `access-control-allow-origin: *`) and both expose chapters.

| | Invidious | Piped |
|---|---|---|
| Transcript endpoint | `GET /api/v1/captions/:id` → `{captions:[{label, languageCode, url}]}`; `?label=` returns **WebVTT**; `?lang=`; `?tlang=` auto-translate (docs: `iv-org/documentation/docs/api.md`) | `/streams/:id` → `VideoInfo` incl. `subtitles[]` (OpenAPI `#/components/schemas/Subtitle`) |
| Metadata endpoint | `GET /api/v1/videos/:id` → `title`, `author`, `lengthSeconds`, `captions`, `chapters` | `/streams/:id` → `title`, `uploader`, `duration`, `views`, `subtitles`, chapters (`ChapterSegment.java`: `title`, `image`, `start`) |
| **Live probe 2026-09-14** | top 4 instances: 403 Forbidden (anti-bot), "forbidden", Anubis bot-check page, HTML front page. One instance (`inv.nadeko.net`) served the caption **list** JSON only with a browser User-Agent — but `/api/v1/videos` answered "**Endpoint disabled**" and the caption **content** fetch returned HTTP 200 with **0 bytes** | official API host `pipedapi.kavin.rocks`: **HTTP 526** (Cloudflare invalid cert); alternates: 301, 502, empty |

**Structural risk:** both projects are in a permanent arms race with YouTube (Invidious needs PO-token support / `inv-sig-helper` / video-companion infrastructure; instance operators disable heavy endpoints to survive). The probe shows the real-world contract: **public instances are hostile to programmatic access and fail in heterogenous ways** (403, challenge pages, disabled endpoints, truncated responses). Self-hosting an Invidious instance works but is a heavy, YouTube-coupled dependency for a personal reader.

**Verdict:** acceptable as an *optional, best-effort fallback* — never as the primary path.

---

## 5. Method D — official / supported path (YouTube Data API v3)

- `captions.list` (50 quota units) lists caption tracks for a video; the response "does not contain the actual captions".
- `captions.download` (200 units, formats `srt/sbv/scc/ttml/vtt`, `tlang` translation) **"requires the user to have permission to edit the video"** — i.e. OAuth as (a delegate of) the video owner; third-party downloads return `403 forbidden`. **There is no official way to download another channel's captions.** Default project quota is 10,000 units/day.
- `videos.list` (1 unit) gives `snippet.title`, `snippet.channelTitle`, `contentDetails.duration` (ISO 8601) — metadata, **no transcripts, no chapters**.

**Verdict:** metadata-only (optional); cannot deliver the core requirement. Also note the API's Developer Policies prohibit circumventing the API/official player to obtain content — the scraping methods above are ToS-exposed by definition.

---

## 6. Why server-side fetching is required (CORS)

**Live probe (2026-09-14):** `youtube.com` watch-page and `timedtext` responses carry **no `Access-Control-Allow-Origin` header** (only `content-type`). A browser `fetch()` from the Lem Reader origin can therefore *send* the request but cannot *read* the response — CORS blocks the read. Additionally, a browser-side InnerTube call would leak the user's IP/cookies into YouTube's bot-scoring with no control over headers or retries.

This fits the existing architecture exactly: ingestion already runs server-side through the SSRF-guarded `safeFetchCore` pipeline (scheme/metadata/DNS/IP validation, redirect re-validation, size caps). YouTube hosts are public, so they pass the SSRF guard; a YouTube ingest profile would be a new `SafeFetchProfile`, not a fork.

---

## 7. Metadata & chapters — where each datum comes from

| Datum | InnerTube (Method B) | Invidious | Piped | Data API v3 |
|---|---|---|---|---|
| Title | `videoDetails.title` | `videos/:id → title` | `streams/:id → title` | `videos.list snippet.title` |
| Channel | `videoDetails.author` | `author` | `uploader` | `snippet.channelTitle` |
| Duration | `videoDetails.lengthSeconds` | `lengthSeconds` | `duration` | `contentDetails.duration` (ISO 8601) |
| Chapters | engagement-panel `macroMarkersListItemRenderer` (needs the `next` endpoint; parsed by both projects) | `chapters[]` on videos response | `chapters[]` (`title`, `image`, `start`) | ✗ none |

One InnerTube `player` call covers transcript + title + channel + duration; chapters need one extra `next` call and can be deferred.

---

## 8. Recommendation matrix

| Criterion | A: bare timedtext | B: InnerTube library (server) | C: public Invidious/Piped | D: Data API v3 |
|---|---|---|---|---|
| Transcript (manual + ASR) | ✗ (empty response) | ✓ | ~ (instance-dependent; probe: mostly broken) | ✗ (owner-only download) |
| Metadata | ✗ | ✓ (`youtubei.js`; minimal libs: transcripts only) | ✓ | ✓ |
| Chapters | ✗ | ✓ (extra `next` call) | ✓ | ✗ |
| Reliability (personal use) | dead | ✓ best available; IP-block risk | ✗ empirically | ✓ for metadata |
| Must run server-side | n/a | ✓ (CORS + attestation) | no (ACAO:*) but unreliable | ✓ (API key secrecy) |
| ToS exposure | n/a | scraping = outside ToS; personal-use enforcement is IP-level (429/blocks), documented by libs | same | ✓ sanctioned |
| Maintenance risk | n/a | libs patch within days of YouTube changes | instances break constantly | stable but feature-poor |

**Recommendation for Lem Reader:**

1. **Primary:** server-side InnerTube `player` fetch in the ingest pipeline — via `youtubei.js` (transcripts + metadata + chapters, one dependency) or a minimal hand-rolled client modeled on `youtube-transcript`'s ~150-line ANDROID-client approach. Map `playabilityStatus` reasons (`TranscriptsDisabled`, age gate, bot-check, unavailable) onto calm, reader-visible refusal reasons per the project's honesty constraint.
2. **Cache** transcripts+metadata in the local library (they are immutable per video); pace requests (one per user action is fine at personal scale; no proxies needed).
3. **Fallback chain:** (optional) official `videos.list` for metadata if an API key is configured; public instances only as best-effort last resort, never trusted.
4. **Skip:** bare timedtext (dead), public-instance reliance (empirically unreliable), Data API captions (impossible for third-party videos).

---

## 9. Sources

- YouTube Data API — Captions resource, `captions.download` (owner-only, quota, formats): developers.google.com/youtube/v3/docs/captions and /docs/captions/download (fetched 2026-09-14)
- `youtube-transcript-api` 1.2.4 README + `_transcripts.py` source (InnerTube flow, error taxonomy, proxy/IP-block guidance, `srv3` stripping, `PoTokenRequired`): github.com/jdepoix/youtube-transcript-api, pypi.org/project/youtube-transcript-api
- `youtube-transcript` 1.3.1 source (ANDROID InnerTube client) + registry metadata: npmjs.com/package/youtube-transcript
- `youtubei.js` (YouTube.js) 18.0.0 README + guide (`po_token`, session options): github.com/LuanRT/YouTube.js, ytjs.dev
- Invidious API docs (`/api/v1/videos`, `/api/v1/captions`): github.com/iv-org/documentation/docs/api.md
- Piped API docs + OpenAPI (`/streams/{videoId}` → `VideoInfo`, `Subtitle`) + `ChapterSegment.java`: github.com/TeamPiped/documentation, github.com/TeamPiped/OpenAPI, github.com/TeamPiped/Piped-Backend
- Live probes (2026-09-14, curl): youtube.com watch/timedtext headers + empty-body bare timedtext; youtube.com responses lack `Access-Control-Allow-Origin`; Invidious instances `inv.nadeko.net` (caption list OK w/ browser UA; videos endpoint disabled; caption content 0 bytes), `invidious.nerdvpn.de` (HTML), `invidious.tiekoetter.com`/`yt.chocolatemoo53.com` (403), `invidious.f5.si` (bot challenge); Piped `pipedapi.kavin.rocks` (526), alternates (301/502/empty); Piped repo still active (pushed 2026-09-11, unarchived)
