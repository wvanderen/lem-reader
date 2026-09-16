# InnerTube fixtures (issue #35)

Captured and synthesized 2026-09-16 for the fixture-driven `youtube-transcript.spec.ts`
suite. Trimmed captures keep every field the client reads (`playabilityStatus`,
`videoDetails`, `captionTracks[]`, `macroMarkersListItemRenderer{title,timeDescription}`)
and drop bulk the client ignores (thumbnails, streamingData, tracking params) so the
fixtures stay reviewable. The `responseKind` / `captured` / `provenance` keys inside each
file carry machine-readable provenance; the client ignores unknown keys.

| File | Provenance | Shape |
|---|---|---|
| `player.ok.dQw4w9WgXcQ.json` | **Live capture** — ANDROID `player` POST, 2026-09-16 | `playabilityStatus.status: "OK"`, `videoDetails`, 6 `captionTracks` (manual en first, then asr en, then 4 translated), signed `baseUrl`s ending `&fmt=srv3` |
| `player.error.unavailable.json` | **Live capture** — ANDROID `player` POST for `SOQjWE4vSgQ`, 2026-09-16 | `status: "ERROR"`, `reason: "This video is unavailable"` → `unavailable-private` |
| `player.ok.no-captions.json` | **Synthesized** — transcripts-disabled videos return `OK` with the captions renderer absent (spike 0008 §3 `TranscriptsDisabled` taxonomy); every video probed live on 2026-09-16 carried ASR tracks, so no live no-caption capture was possible | `OK` + no `captions` key → `no-captions` |
| `player.login-required.bot.json` | **Synthesized** — reason string from spike 0008 §3 / `youtube-transcript-api` `_transcripts.py`; bot-gating is IP-reputation-dependent and did not trigger from this host | `LOGIN_REQUIRED` + "not a bot" → `bot-check` |
| `player.login-required.age.json` | **Synthesized** — reason phrasing from spike 0008 §3 | `LOGIN_REQUIRED` + age phrasing → `age-gated` |
| `next.chapters.aircAruvnKk.json` | **Live capture** — WEB `next` POST, 2026-09-16, 3Blue1Brown "But what is a neural network?" (12 creator chapters) | `engagement-panel-macro-markers-description-chapters` panel with `macroMarkersListItemRenderer` items |
| `captions.dQw4w9WgXcQ.en.srv1.xml` | **Live capture** — signed timedtext GET with `&fmt=srv3` stripped, 2026-09-16 | `<transcript><text start dur>` line-level; note the srv1 double-escape quirk (`&amp;#39;`) in the raw bytes |
| `captions.dQw4w9WgXcQ.en.srv3.xml` | **Live capture** — the same track as issued (`format="3"`), 2026-09-16 | `<timedtext><p t d>` millisecond shape; exercises the defensive srv3 parser branch |

Signed URLs in the captures expired long ago (the `expire` param); fixtures are network-dead
by design — the suite replays them through a mocked `fetch`/`node:dns`. Live behavior is
covered by the opt-in `youtube-real-network.spec.ts` (`YOUTUBE_REAL_NETWORK=1`).
