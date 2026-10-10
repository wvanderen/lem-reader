# Spike 0010: Zen (Firefox/macOS) read-aloud startup failure — platform evidence

**Issue:** [wvanderen/lem-reader#167](https://github.com/wvanderen/lem-reader/issues/167)
**Status:** Complete — **NO REPRODUCTION in a clean Zen profile on macOS; the platform-level Web Speech stack in Zen 1.23.1b is healthy for every sequence the read-aloud engine uses. The reported failure is environment-specific (not reproducible here) — the app-level recovery UX was still fixed (see the issue's acceptance criteria), and the evidence still needed from the reporter is listed in §6.**

---

## 1. The question

Read-aloud in Zen (a Firefox fork) on macOS reportedly opens the transport bar, produces no audible speech, and closes after a few seconds — on short and long articles, with both the system-default voice and Kathy, while the same long article works in Helium (Chromium). What actually fails, and what does the evidence support?

The engine's known failure ladder (before this issue) explains the *observed shape* regardless of the platform trigger:

1. Play → silent probe utterance (`volume: 0`) waits up to 2s for a boundary (`PROBE_TIMEOUT_MS`);
2. post-cancel settle (60ms);
3. the first real chunk waits 3s for its first event (`FIRST_EVENT_STALL_MS` watchdog);
4. `fail()` → state "stopped" → the transport bar collapsed back to the idle entry.

Silence → collapse after ~5s, with no explanation and no recovery affordance — exactly the report. Before this spike, the engine also **discarded `SpeechSynthesisErrorEvent.error`**, so a platform refusal ("not-allowed", "synthesis-failed", …) was indistinguishable from a silent stall. Article length was never a plausible cause (short articles failed too — the chunker caps utterances at 250 graphemes regardless).

## 2. Method

A dependency-free HTTP harness (`speech-harness.mjs`, kept out of the repo) served a probe page that reproduces the engine's exact sequences and POSTs timestamped event logs back:

- **S1** `getVoices()` at t=0 and after 1s (async voice load);
- **S2** the probe replica: `PROBE_TEXT` at `volume: 0`, bounded 4s;
- **S3a** the handoff replica: probe ended → `cancel()` → 60ms settle → real chunk (`volume: 1`);
- **S3b** the dead-probe replica: probe silent → 2s wait → `cancel()` → 60ms settle → real chunk;
- **S4** plain speak (no probe);
- **S5** speak 2.6s after the last speech activity (activation-expiry shape);
- **S6** explicit voice assignment (Kathy — `urn:moz-tts:osx:com.apple.speech.synthesis.voice.Kathy` — and Samantha), probe then real text, as the reporter tried;
- **S7** speak at t≈0, before any voices have loaded (the app's early-press timing).

Run on: Playwright's real Firefox 151 / Chromium / WebKit (headed, real macOS voices) as controls, and **real Zen 1.23.1b** (`/Applications/Zen.app`, Gecko 157 base, UA `Mozilla/5.0 … rv:157.0 Gecko/20100101 Firefox/157.0`) launched isolated (`--new-instance --profile <temp> --no-remote`) against the harness. All runs auto-executed without a user gesture, which doubles as a gesture-gating probe (none of the three engines gated speech).

## 3. Findings

### 3.1 Real Zen on macOS — the platform is healthy

Every scenario produced a full event trail (timestamps from one representative run):

| Scenario | Result in Zen 1.23.1b |
| --- | --- |
| API presence | `speechSynthesis` + `SpeechSynthesisUtterance` present |
| Voice list | **0 voices at t=0 → 53 voices at ~1s** (async load; includes Kathy, Samantha, Fred, Ralph — the old `urn:moz-tts:osx:*` MacinTalk voices) |
| S2 volume-0 probe | `start` at ~9ms after `speak()`, word boundaries every ~250–500ms, `end` at ~3.1s — **volume 0 does not suppress events** |
| S3a cancel→settle→speak | works (start ~40ms after speak) |
| S3b dead-probe → cancel → speak | works |
| S4 plain speak | works |
| S5 delayed 2.6s | works (no user-activation expiry) |
| S6 **Kathy explicitly assigned** | works (probe + audible) |
| S6 Samantha explicitly assigned | works |
| S7 speak before voices load | events eventually fire; the utterance sat in Zen's queue behind later requests (see §5) |

### 3.2 Playwright Firefox 151 / Chromium / WebKit on macOS — same

All three control engines passed the identical suite (184 / 180 / 70 voices respectively; volume-0 probes fire everywhere; no gesture gate; no errors). Nothing in the engine's sequence is hostile to any of the three engines on this machine.

### 3.3 Consequence

The reported symptom cannot be explained by anything the engine *asks the platform to do*: every request shape it makes succeeds in a clean Zen profile on macOS, with both voices the reporter tried. Article length is affirmatively ruled out (short articles fail in the report; the harness spoke whole sequences fine). Candidate remaining triggers live in the reporter's environment (see §6), not in the app's request patterns.

## 4. What the app changed anyway (issue #167 implementation)

Even without a platform-level reproduction, the app's failure handling was genuinely broken for ANY trigger of this class — the acceptance criteria are unconditional:

- `onerror` no longer discards the platform's error reason (adapter seam passes `SpeechSynthesisErrorEvent.error` through);
- a detected failure now lands the transport on **"failed"** (never a fake "playing", never a silent collapse): the bar stays open with the VISIBLE calm explanation, **Retry**, and voice + speed selection; the failure kind (startup vs playback) is reported honestly with distinct copy;
- the reading position is never rewound: Retry starts a fresh session from the preserved listened offset (never past unheard passages — verified by deterministic fake-speech e2e in `tests/e2e/readaloud/read-aloud-failure.spec.ts`).

## 5. Incidental finding: pre-voices speech can queue late in Zen

S7's utterance (spoken at t≈0, before Zen's voice list loaded) did not begin speaking until ~37s later — after the whole harness suite had drained. A request made before the synthesizer had voices appears to sit in Zen's queue rather than synthesize on voice-load. This does not match the app's flow (the probe speaks ~immediately at press and fired events in every run), but it is a real Zen quirk worth remembering: **a queued-while-voiceless utterance can surface very late**, which would present as "nothing happens now, audio appears much later or never".

## 6. Limitation + evidence still needed from the reporter

**Limitation:** the exact failing environment could not be reproduced, and the app itself could not be driven inside Zen. Zen 1.23.1b in a throwaway profile on this macOS machine speaks correctly through every path the app uses; the difference must live in the reporter's Zen session/environment. The harness therefore probed the platform sequences the engine issues (§3.1) rather than clicking the app's own UI in Zen — driving Zen programmatically was attempted and is not currently possible from this environment: Playwright cannot attach to Zen (unpatched fork — the launch hangs; Juggler is Playwright's own Firefox patch set), Firefox removed its CDP remote agent in 129 (Zen 1.23.1b is Gecko 157), and raw Marionette was not attempted after the CDP path closed (the harness POST design made it unnecessary for platform-level evidence). The article-level leg (the reported marxist.com article, short vs long, in the reporter's Zen) remains open and is the first item below.

To close the diagnosis, the report should capture (in the reporter's Zen):

0. **The app-level leg**: open the reported article (and any short one) in the reporter's Zen, press Read aloud, and note which failure the (fixed) bar reports — the startup vs playback distinction now on the bar plus the console's platform error reason. If it reproduces there, stock-Firefox on the same machine (item 5) separates Zen-specific from Gecko-wide;

1. **`about:support`** (Troubleshooting Information) — the modified-prefs list; specifically any `media.webspeech.*`, `media.audioaccessibility.*`, or accessibility/AT-instrumentation entries, and whether an accessibility tool was active at the time (Firefox's macOS TTS bridge changes under screen readers);
2. **Zen version + Firefox base** (`about:support` → Application Basics) and whether the in-app updater had a pending update at the time (this machine's Zen was observed mid-update-replacement during testing — coincidental, but a half-replaced Gecko could plausibly wedge TTS until relaunch);
3. **Extensions and Zen mods** (Zen ships community mods; anything touching audio/media permissions is suspect);
4. **Console output** from the failing press (devtools → Console) — with issue #167's fix, the failure now keeps the bar open; the status line distinguishes startup vs playback, and future builds can log the platform's `error` reason (now plumbed through the adapter but not yet reader-facing);
5. Whether **the same failure reproduces in stock Firefox** on the same machine, same article (separates Zen-specific from Gecko-wide);
6. Whether a **relaunch of Zen** clears it (OS-level TTS service state vs in-session state).

## 7. Verdict

No root-cause fix is claimed — none is supported by evidence; the honest deliverable is (a) the recorded platform evidence above, (b) the error-reason plumbing that makes the *next* failure diagnosable, and (c) the recoverable failure experience, which converts any recurrence of this class from "menu closes after a few seconds" into "bar stays open, explains, offers Retry + voice selection, and preserves the place" — verified with deterministic speech tests plus real-browser UI checks, with working Chromium playback unchanged.
