# Spike 0008: Web Speech API word-boundary reality across browsers

**Issue:** [wvanderen/lem-reader#22](https://github.com/wvanderen/lem-reader/issues/22)
**Status:** Complete — **CONDITIONAL GO: word-level following is realistic on desktop (with per-voice probing); on mobile it must degrade to sentence/block following, and mobile web is foreground-only**
**Scope guard honored:** zero production changes. Research only.

---

## 1. The question

Can the Web Speech API (`speechSynthesis`) support **reliable word-level "following"** (highlighting the currently spoken word) across Chromium, Firefox, and WebKit on desktop and mobile web — given Lem Reader's canonical article-global grapheme offsets, paginated/scrolling renderers, and local-first constraints?

---

## 2. Fact base

### 2.1 What the spec actually guarantees (and doesn't)

| Spec claim | Consequence for word-following |
|---|---|
| The `boundary` event fires "when the spoken utterance reaches a word or sentence boundary. **The user agent must fire this event if the speech synthesis engine provides the event.**" ([spec §4.2.5](https://webaudio.github.io/web-speech-api/#eventdef-speechsynthesisutterance-boundary)) | Engines are **exempt** when the underlying voice/engine has no word timings. There is no way to ask which voices provide them. |
| `charIndex` is a zero-based index "that most closely approximates the current speaking position"; "**No guarantee is given as to where charIndex will be with respect to word boundaries**"; engines that don't support it "must return 0" ([spec §4.2.6](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisevent-charindex)) | The highlight anchor may land at word start *or* end of previous word. A `charIndex === 0` mid-stream is indistinguishable from "unsupported". |
| `charLength` is "the length of the text (word or sentence)" at `charIndex`, or **0** if the engine can't determine it ([spec §4.2.6](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisevent-charlength)) | `charLength === 0` is common; the app must segment words itself (`Intl.Segmenter`) from `charIndex`. |
| `name` is `"word"` or `"sentence"` ([spec §4.2.6](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisevent-name)) | Sentence-granularity following is available where a voice emits sentence boundaries only. |
| Utterance text "may be limited to **32,767 characters**" ([spec §4.2.4](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisutterance-text)); `"text-too-long"` is a defined error code | Long-document utterances are out of spec-contract; chunking is mandatory for a reader app. |
| `pause()`/`resume()` act on a **global** paused state; `resume()` continues mid-utterance; `cancel()` clears the queue and speech "ceases immediately" ([spec §4.2.2](https://webaudio.github.io/web-speech-api/#speechsynthesis-methods)) | Pause/resume/seek are queue semantics, not timeline semantics. There is **no seek API** — seeking means cancel + speak-from-offset, which requires our own chunk/offset bookkeeping. |
| `rate` 0.1–10, `pitch` 0–2; engines "may constrain further" ([spec §4.2.4](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisutterance-rate)) | Rate/pitch are per-voice quality multipliers, not guaranteed ranges. |

MDN classifies `SpeechSynthesisUtterance` as Baseline (widely available since 2018) but the `boundary` event as **"not Baseline — does not work in some of the most widely-used browsers"**, with a Chrome note pointing at [crbug 40715888](https://issues.chromium.org/issues/40715888) ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesisUtterance.json)).

### 2.2 Per-engine `onboundary` reality

**Chromium desktop**

- A Chromium developer stated (2015) that "native speech synthesis on Mac OS X, Windows, and Chrome OS all support boundary events at the word level" (quoted from crbug 521666 in [SO 51645956](https://stackoverflow.com/questions/51645956/speechsynthesisutterance-onboundary-event-not-firing-properly)). Linux (speech-dispatcher) does not.
- Chrome's 19 preloaded **Google voices are online-only** ([Readium speech doc](https://readium.org/speech/docs/WebSpeech.html)), and per Readium and field reports from 2024–2025 they **do not return boundary events** ([read-aloud-best-practices#4](https://github.com/HadrienGardeur/read-aloud-best-practices); [SO 79554200](https://stackoverflow.com/questions/79554200/why-arent-speechsynthesisutterance-events-firing-when-using-chromes-google-voi)). Boundary behavior has therefore been voice-dependent and has **regressed at least once** — never assume it from platform membership.
- Some installed voices simply never fire boundary events (e.g. Windows voices: [crbug 40074945](https://issues.chromium.org/issues/40074945)).
- Specific tokens can **permanently stop** boundary events for the rest of the utterance in Chrome (German "E-Mail": [crbug 816891](https://bugs.chromium.org/p/chromium/issues/detail?id=816891), filed alongside [Mozilla bug 1441503](https://bugzilla.mozilla.org/show_bug.cgi?id=1441503)).

**Chromium Android**

- `onboundary` **does not fire** — open Chromium bug, referenced by MDN's own compat note ([crbug 40715888](https://issues.chromium.org/issues/40715888)). Word-following is off the table on Android Chrome.
- Voice selection is broken besides: Chrome Android returns an unfiltered, system-locale-localized list of languages/regions rather than installed voices, and falls back to English when a pack is missing ([Readium](https://readium.org/speech/docs/WebSpeech.html)).
- `pause()` "just causes the current utterance to end, so calling resume is a no-op" ([mdn/browser-compat-data#4500](https://github.com/mdn/browser-compat-data/issues/4500)); desktop Chrome has related pause bugs near utterance end ([crbug 433724383](https://issues.chromium.org/issues/433724383)).

**Firefox**

- Desktop Firefox fires `boundary` with **word and sentence** `name`s (FF 49+; FF Android 62+ per [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesisUtterance.json)); it is the only engine that reliably emits sentence-boundary events.
- Open bug (8 years, unassigned): after tokens like "E-Mail" on macOS, `charIndex` **freezes** ("makes it impossible to use the charIndex to highlight the currently spoken word"); accented words shift `charIndex` ([Mozilla bug 1441503](https://bugzilla.mozilla.org/show_bug.cgi?id=1441503), still NEW).
- Firefox has no voices of its own; voice lists come from the OS, and Firefox Android reports non-BCP-47 codes like `eng-US-f000` ([Readium](https://readium.org/speech/docs/WebSpeech.html)). Linux uses speech-dispatcher, which historically provides no boundary data (see Chromium note above — the platform TTS engine, not the browser, is the gate).

**WebKit (Safari macOS + all iOS/iPadOS browsers)**

- Boundary support landed in 2013 ([WebKit bug 107350, r144335](https://bugs.webkit.org/show_bug.cgi?id=107350)); WebKit's source forwards word/sentence boundaries with `charIndex` **and** `charLength` when the platform voice provides them ([SpeechSynthesis.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp)).
- **Per-voice gaps**: open bug — `onboundary` never fires with the "Eddy" voice ([WebKit bug 287551](https://bugs.webkit.org/show_bug.cgi?id=287551)); the highest-quality Siri voices are unavailable to Web Speech at all, and downloadable/enhanced voices are hidden from `getVoices()` (installing one can make a language vanish) ([Readium](https://readium.org/speech/docs/WebSpeech.html); [WebKit bug 290497](https://bugs.webkit.org/show_bug.cgi?id=290497) — "only low quality ones are available").
- **iOS requires a user gesture** to start speech: WebKit's source silently drops `speak()` without one (`RequireUserGestureForSpeechStart`, [SpeechSynthesis.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp)); Chrome has required user activation since M71 ([chromestatus](https://www.chromestatus.com/feature/5687444770914304)).
- **iOS silent switch** mutes Safari TTS even at full volume (practitioner-reported, widely reproduced: [talkr.app](https://talkrapp.com/speechSynthesis.html)).
- **Backgrounding/lock kills iOS speech**: speech stops when Safari is backgrounded mid-speech and the synthesizer stays broken until refresh ([WebOutLoud bulletin](https://weboutloud.io/bulletin/speech_synthesis_in_safari/)); page suspension calls `stopPlatformSpeech()` in WebKit's source. iOS also ducks other audio aggressively ([WebKit bug 278598](https://bugs.webkit.org/show_bug.cgi?id=278598)).
- iOS lies about voices: `getVoices()` lists ~55 but only ~36 respond, one per locale ([talkr.app](https://talkrapp.com/speechSynthesis.html)); empty utterances don't fire start/end ([WebKit bug 310602](https://bugs.webkit.org/show_bug.cgi?id=310602)); utterances queued right after `cancel()` miss events ([WebKit bug 238189](https://bugs.webkit.org/show_bug.cgi?id=238189)).

### 2.3 Long utterances and the chunking pattern

- Chrome desktop **Google voices stop playback after ~14 seconds** with no error callback ([read-aloud-best-practices#3](https://github.com/HadrienGardeur/read-aloud-best-practices), linking [crbug 332002367](https://issues.chromium.org/issues/332002367), [crbug 40747712](https://issues.chromium.org/issues/40747712), [SO 21947730](https://stackoverflow.com/questions/21947730/chrome-speech-synthesis-with-longer-texts)). The known workarounds are sentence chunking and a periodic `resume()` keep-alive ([SO 48044163](https://stackoverflow.com/a/48044163)).
- The spec-sanctioned ceiling is 32,767 characters (§2.1); the ecosystem pattern for readers is therefore: **split the normalized text into sentence-sized utterances, queue them, and keep `(utteranceIndex → canonicalOffset)` mapping** — exactly the pattern Readium's read-aloud guidance prescribes ([read-aloud-best-practices](https://github.com/HadrienGardeur/read-aloud-best-practices)).
- Keep references to each `SpeechSynthesisUtterance` until its `end` event: event handlers can be garbage-collected mid-speech ([talkr.app](https://talkrapp.com/speechSynthesis.html)).

### 2.4 `charIndex` → Lem Reader canonical offsets

`charIndex` indexes the **utterance's own text** (UTF-16 code units), not our normalized article text. Three deltas must be bridged:

1. **Chunk origin**: each sentence-chunk utterance carries its canonical article-grapheme start offset; `canonical = chunkOrigin + graphemeIndexOf(charIndex within chunk)`.
2. **UTF-16 → grapheme**: engines count code units; Lem Reader's canonical offsets are grapheme-based (`blockGraphemeLen`). Convert via `Intl.Segmenter` over the chunk text — the same discipline the codebase already applies for highlight offsets. Note bug 1441503 (§2.2): accents already shift `charIndex` in the wild, so never persist a raw `charIndex`.
3. **Word extent**: if `charLength > 0`, the word is `[canonical, canonical + charLength)`; otherwise segment the chunk with `Intl.Segmenter` (word granularity) and highlight the word containing the converted index — also handling the spec's "no guarantee where charIndex sits in the word".

### 2.5 Voice availability and quality per OS

Summarized from [Readium's voice survey](https://readium.org/speech/docs/WebSpeech.html) (April 2024): Chrome desktop = 19 high-quality voices, **online-only**, no offline fallback; Android = 67+ high-quality voices but Chrome exposes them badly; macOS/iOS = extensive per-voice-quality tiers, Siri voices excluded, downloadable voices hidden from web content; Windows = 98 voices, but the best "natural" voices are only exposed to Edge; Chrome OS = best Chromium story (offline Android/Natural voices) with availability/latency quirks. Edge desktop is the voice-quality king (250+ natural voices) but is not a Lem Reader target engine — its quirks (no pitch control, characters needing escaping) still matter if users open the reader there.

### 2.6 Free alternatives (paid cloud TTS excluded by standing constraint)

**Piper via WASM** ([rhasspy/piper](https://github.com/rhasspy/piper), MIT; browser builds: [@diffusionstudio/vits-web](https://www.npmjs.com/package/@diffusionstudio/vits-web), forks like [@mintplex-labs/piper-tts-web](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web)) — on-device neural TTS on ONNX Runtime WASM: `predict({text, voiceId})` returns a WAV blob; voices (~20–120 MB ONNX models, medium ≈ 60 MB) download once and cache in the Origin Private File System; runs in a Web Worker.

- Pro: identical cross-browser behavior, offline, no engine quirks, we own the whole pipeline.
- Con: multi-MB-model download before first use, real inference memory/CPU cost on low-end mobile, and **no word timings** — following would be approximate (per-chunk audio `currentTime` interpolation) or require phoneme alignment we'd have to build. Robot-adjacent options (eSpeak-ng/meSpeak.js) are worse quality than system voices on every target OS.

Verdict: a fallback/last-resort engine, not the v1 default. It cannot beat platform voices on quality-per-byte on desktop, and it duplicates what Android/Chrome OS system voices already provide offline.

---

## 3. What word-following can realistically be, per platform

| Platform / engine | Word following? | Mechanism & caveats |
|---|---|---|
| Chromium desktop (macOS/Windows/Chrome OS) | **Yes — with local system voices** (`localService: true`); **unreliable otherwise** | Boundary events via platform engine (crbug 521666). Google online voices: no boundary events + 14 s cutoff + network required (§2.2, §2.3). Linux Chromium: no. Behavior has regressed before — probe per voice at runtime. |
| Chromium Android | **No** | `onboundary` doesn't fire (crbug 40715888); pause broken; voice selection broken. Sentence/block following only. |
| Firefox desktop | **Yes, mostly** | Word + sentence boundary events; macOS `charIndex` freeze on some tokens (bug 1441503) — re-anchor each event, never extrapolate. Linux: voice-dependent (speech-dispatcher). |
| Firefox Android | **Unreliable — assume no** | API present since FF62 but field reports of events not firing on mobile; voice metadata non-conformant (§2.2). |
| WebKit macOS | **Yes, per voice** | `charIndex` + `charLength` both supplied; some voices silently never fire (bug 287551); best voices hidden — probe, then filter the voice list. |
| WebKit iOS/iPadOS (all iOS browsers) | **Yes in foreground, per voice** | Same mechanism as macOS; requires user gesture; muted by silent switch; dies on background/lock; `getVoices()` over-reports. Word following is fine for deliberate reading sessions; nothing survives the reader being backgrounded. |

**Cross-cutting conclusion:** word-following is a **per-voice capability, not a per-browser one**. Any implementation needs (a) a runtime capability probe (speak a short calibration utterance, count boundary events) when a voice is selected, and (b) a degradation ladder: word (`charIndex`+`charLength`) → word (`charIndex` + own segmentation) → sentence boundary → current-utterance/block highlight → progress bar only.

---

## 4. Findings

- **F1 — Word following is realistic on desktop, not on mobile.** Chromium desktop (local voices), Firefox desktop, and WebKit (capable voices) deliver `charIndex`-anchored word events. Android Chromium demonstrably does not fire them (crbug 40715888), and Firefox Android is unreliable. A v1 that promises word-highlighting on desktop and sentence/block-highlighting on mobile is honest; a v1 promising uniform word-following everywhere is not shippable without synthetic TTS.
- **F2 — Chunked sentence utterances are mandatory regardless.** They solve the 32,767-char ceiling, Chrome's 14 s Google-voice cutoff, seeking (cancel + speak-from-chunk, since no seek API exists), GC of utterances, and give each boundary event its canonical chunk-origin offset. This maps 1:1 onto the existing normalized-block model (chunks ⊂ blocks, offsets article-global).
- **F3 — Never trust the platform; probe the voice.** Chrome's boundary behavior has flipped at least once (Google voices), WebKit has per-voice holes (Eddy), iOS hides its best voices, and token-level bugs can freeze `charIndex` (bug 1441503). One calibration utterance per selected voice, re-checked per session, with the degradation ladder above.
- **F4 — Mobile web is foreground-only, and iOS adds hardware constraints.** iOS: user-gesture gating (silent refusal — detect the stall), silent-switch muting, death on background/lock. Android: pause() ends the utterance. Read-aloud controls must treat "backgrounded" as "stopped" and offer a visible resume affordance.
- **F5 — The mapping contract is charIndex → grapheme → canonical offset.** UTF-16 code units in, article-global grapheme offsets out, `charLength` used when nonzero, `Intl.Segmenter` word segmentation when not. Raw `charIndex` values are ephemeral and must never be persisted (same policy as DOM ranges — canonical offsets only).
- **F6 — Piper/WASM is a fallback, not a v1 alternative.** Free, offline, uniform — but 20–120 MB per voice, mobile inference cost, and no word timings. Revisit only if a real deployment shows voiceless platforms matter more than the download cost.

---

## 5. Recommendation (input for the TTS v1 scope decision)

**GO** for Web Speech read-aloud with word-following scoped as desktop-first, conditioned on:

1. **Sentence-chunked utterance queue** with `(chunk → canonical grapheme origin)` mapping (F2) — shared by both renderers; highlight targeting uses existing canonical offsets, never page numbers.
2. **Per-voice boundary probe + degradation ladder** (F3): word → sentence → block → progress-only. Ship all four states as first-class, reader-visible behavior (honesty constraint).
3. **Prefer `localService: true` voices**; deprioritize Google online voices; filter voice lists per platform (eSpeak/effect/low-quality voices exist to be filtered).
4. **charIndex → canonical mapping module** with the UTF-16/grapheme discipline (F5), re-anchored on every event.
5. **Transport controls built for the real semantics**: pause/resume with Android's cancel-like fallback, seek = cancel + speak-from-chunk, backgrounding = stop, iOS user-gesture stall detection.
6. Playwright matrix must assert **degraded** modes (no-boundary voices), not just the happy path; word-following assertions must be per-voice-class, not per-browser.

### Risk list

| Risk | Severity | Mitigation |
|---|---|---|
| Chrome regresses local-voice boundaries again | Medium | Runtime probe (F3); sentence fallback already built |
| `charIndex` corruption on specific tokens (bug 1441503) | Medium | Re-anchor per event; never extrapolate; regression fixtures with "E-Mail"-class tokens |
| iOS silent refusal without gesture reads as a crash | Medium | Stall detection + "tap to read" affordance (F4) |
| Pagination + speech interaction (page turn mid-utterance) | Medium | Boundary events drive page turns from canonical offsets — no page-number anchors (existing architecture) |
| Scope creep toward WASM TTS | Low | F6: explicit defer, revisit with deployment data |

---

## 6. Sources

Primary (specs, engine source, trackers):

- [Web Speech API spec (Draft CG Report, 2026-09-09)](https://webaudio.github.io/web-speech-api/) — §4.2.2 methods, §4.2.4 attributes (32,767 limit, rate/pitch), §4.2.5 events, §4.2.6 `charIndex`/`charLength`/`name`
- [MDN browser-compat-data: SpeechSynthesisUtterance](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesisUtterance.json) — Baseline/not-Baseline statuses, Chrome partial-implementation note
- [WebKit SpeechSynthesis.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp) — iOS gesture gating, boundary forwarding, cancel/suspend semantics
- [crbug 40715888](https://issues.chromium.org/issues/40715888) — Android boundary events don't fire
- [crbug 40074945](https://issues.chromium.org/issues/40074945) — boundary events missing for some Windows voices
- [crbug 332002367 / 40747712](https://issues.chromium.org/issues/332002367) via [read-aloud-best-practices#3](https://github.com/HadrienGardeur/read-aloud-best-practices) — Google voices 14 s cutoff
- [crbug 816891](https://bugs.chromium.org/p/chromium/issues/detail?id=816891) + [Mozilla bug 1441503](https://bugzilla.mozilla.org/show_bug.cgi?id=1441503) — token-corrupted `charIndex`
- [crbug 433724383](https://issues.chromium.org/issues/433724383) — desktop pause() defect; [mdn/browser-compat-data#4500](https://github.com/mdn/browser-compat-data/issues/4500) — Android pause() ends utterance
- [WebKit bug 107350](https://bugs.webkit.org/show_bug.cgi?id=107350) (boundary support, r144335), [287551](https://bugs.webkit.org/show_bug.cgi?id=287551) (Eddy voice), [290497](https://bugs.webkit.org/show_bug.cgi?id=290497) (low-quality voices only), [278598](https://bugs.webkit.org/show_bug.cgi?id=278598) (iOS ducking), [238189](https://bugs.webkit.org/show_bug.cgi?id=238189) (cancel→queue race), [310602](https://bugs.webkit.org/show_bug.cgi?id=310602) (empty utterances)
- [chromestatus: speak() user activation](https://www.chromestatus.com/feature/5687444770914304) — M71 gating

Aggregators and practitioner reports (used for behavior not covered by trackers, marked as such above):

- [Readium: SpeechSynthesis in browsers and OSes](https://readium.org/speech/docs/WebSpeech.html) and [read-aloud-best-practices](https://github.com/HadrienGardeur/read-aloud-best-practices) — voice availability/quality survey; read-aloud architecture guidance
- [WebOutLoud: State of Speech Synthesis in Safari](https://weboutloud.io/bulletin/speech_synthesis_in_safari/) — iOS backgrounding behavior
- [talkr.app: Lessons Learned Using speechSynthesis](https://talkrapp.com/speechSynthesis.html) — iOS silent switch, iOS voice over-reporting, utterance GC, M71 gating
- [SO 21947730](https://stackoverflow.com/questions/21947730/chrome-speech-synthesis-with-longer-texts), [SO 48044163](https://stackoverflow.com/a/48044163), [SO 41539680](https://stackoverflow.com/questions/41539680/speechsynthesis-speak-not-working-in-chrome) (rate > 2 stalls Chrome), [SO 79554200](https://stackoverflow.com/questions/79554200/why-arent-speechsynthesisutterance-events-firing-when-using-chromes-google-voi), [SO 51645956](https://stackoverflow.com/questions/51645956/speechsynthesisutterance-onboundary-event-not-firing-properly) (crbug 521666 quote)
- [rhasspy/piper](https://github.com/rhasspy/piper), [@diffusionstudio/vits-web](https://www.npmjs.com/package/@diffusionstudio/vits-web), [@mintplex-labs/piper-tts-web](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web) — WASM TTS alternative

Researched 2026-09-14. Volatile claims (Chrome Google-voice boundary behavior, iOS version-specific regressions) are date-stamped and must be re-probed at implementation time — see F3.
