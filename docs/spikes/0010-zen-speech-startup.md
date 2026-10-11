# Spike 0010: Zen (Firefox/macOS) read-aloud startup failure — platform evidence

**Issue:** [wvanderen/lem-reader#167](https://github.com/wvanderen/lem-reader/issues/167)
**Status:** Complete — **ROOT CAUSE FOUND AND FIXED (follow-up to the first pass below): on Firefox/macOS, `speechSynthesis.cancel()` landing on an utterance that is actively synthesizing permanently wedges the synthesizer (in-page recovery impossible). The read-aloud engine's startup probe canceled exactly there — a mid-synthesis cancel on every Play press. The fix removes every cancel from the startup path: the first chunk queues behind the probe and the probe runs to its natural end. See §8.**

---

## 8. Root cause (discriminating experiments on the reporter's own Firefox, one day after §3–§7)

The user reproduced the issue on real Firefox (157.0.1, macOS) AND Zen — and confirmed the #167 failure UI ("Speech didn't start. Try a different voice, then press Retry."), consistently, nothing in console. A one-click diagnostic page (HITL — the agent's environment cannot launch a second Firefox: the opencode shell denies Firefox's sandbox-extension XPC, `sandbox_extension_issue_file_to_process … Operation not permitted`, which is also why §3's clean-profile automation used `open` + beacons) ran the app-exact ladder in the user's Firefox and reported every event with timestamps:

**Run 1 — the wedge, reproduced (auto + gesture suites):**

| t (ms) | event                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1038   | plain volume-1 utterance: start → 6 word boundaries → end @3617 — **healthy**                                                                              |
| 3620   | volume-0 probe (the app's shape): start, ONE word boundary @4087 — then silence                                                                            |
| ~4137  | `cancel()` at the first boundary (the engine's resolve path)                                                                                               |
| 4200+  | first real chunk: NO events — ever                                                                                                                         |
| 4200→∞ | `speechSynthesis.speaking === true, pending === true` **forever**; every later utterance (delayed speak, retry ladder, Kathy variant) produces zero events |

**Run 2 — the discrimination matrix (canary-checked between every experiment):**

| Experiment                                                                       | Result                                                                                                               |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| E1: volume-0 probe LEFT ALONE                                                    | **healthy** — start, 6 boundaries, natural end at ~2.7s                                                              |
| E2: volume-0 short text, untouched                                               | healthy                                                                                                              |
| E3: volume 0.01 / 0.001, untouched                                               | healthy — near-zero volumes are not the problem                                                                      |
| E4: Kathy volume-0, untouched                                                    | healthy                                                                                                              |
| E5: **volume-0 probe + `cancel()` at the first boundary** (the app's exact move) | **WEDGES**: the queued chunk never speaks; canary STUCK                                                              |
| E6: recovery after the wedge                                                     | **nothing recovers it**: single `cancel()`, double `cancel()`, `resume()+cancel()` all fail; only a reload clears it |

The reporter's audible observation — "a lot of popping before it stops" — is the mid-synthesis cancel glitching the audio output; the pops are the wedge's audible signature.

**Conclusion:** not volume 0 (E1–E4), not the voices, not article length, not gesture gating — **`cancel()` during active synthesis of the silent probe**. Chromium/WebKit cancel cleanly, which is why Helium worked. Every Retry re-ran the identical probe-then-cancel, hence the consistent failure.

**Run 3 (cancel matrix, T-series)** was cut short when the diagnostic tab stopped reporting right after its first mid-speech cancel (content process stopped responding — the wedge's hardest form). The question it was answering — whether `cancel()` mid-synthesis of AUDIBLE (volume-1) speech also wedges (it would implicate Stop/seek/retune on Firefox) — remains **open**; no such failure has been reported in the field, so the fix keeps those cancels and relies on the existing honest-failure watchdogs to convert any such wedge into a visible, recoverable state rather than a fake "playing".

## 9. The fix (evidence-driven)

The engine now treats the synthesizer as untouchable while an utterance is actively synthesizing:

- **The startup probe is never canceled.** The first chunk QUEUES behind it; the synthesizer plays the silent probe to its natural end, then the chunk begins. The probe text is shortened ("Hi. One two three.", ~1.5s) so the audible-start delay stays small.
- While the probe is in flight: seek/skip/retune **retarget the queued chunk** (no cancel), pause **freezes** the queue (the watchdog stops; resume re-arms it), and a resolve that lands while paused parks the handoff for resume.
- The only remaining cancels are terminal (Stop/fail) or post-audible requeues (seek/retune after speech was heard — the WebKit settle discipline stays there).
- Regression pins: engine unit tests assert **zero `adapter.cancel()` calls through a full startup** (word-capable and dead-probe paths), retarget-without-cancel for seek/retune/skip mid-probe, freeze-doesn't-fail while paused, and re-armed honest failure after resume into a dead queue.

**Validation status:** engine truth table (164 unit tests, fake timers) green; chromium e2e (the deterministic fake-speech suite, 41 specs) green; **Firefox/WebKit e2e of this change could not run on the authoring machine** — an unrelated same-day environment regression denies ALL Firefox builds (real and Playwright) their sandbox/graphics extensions there (§8's automation note); the repo CI gate owns the full matrix. **Real-device confirmation on the reporter's Firefox is the decisive check**: Play → speech must now start (the probe completes silently first, ~1.5s), Retry must recover from any failure, and no popping.

## 10. Follow-up (post-fix, reporter's Firefox): sentence-boundary clicks — a SECOND, synthesis-internal Gecko defect

With the wedge fixed, read-aloud on the reporter's Firefox **works but produces a loud, full-scale click at every sentence boundary — including INSIDE a single utterance** (a labeled discriminator played four shapes: one long utterance, a gapless pre-queued chain, the engine's end-event chain, and the silent-probe handoff — **all popped identically**, the single-utterance variant right before a mid-text sentence). The click is therefore synthesis-internal: **Gecko's macOS TTS bridge clicks (and on this machine frequently DIES — the utterance's `end` never fires and the queue blocks) at each internal sentence break**. Not utterance chaining (all shapes identical), not the Web Speech event wiring (the discriminator set no boundary listeners), not Bluetooth (built-in speakers), not volume (unchanged across levels). The app cannot patch Gecko's audio graph from the web.

An attempted voice matrix died at its first modern-voice item (Samantha: announcement fine → two-sentence utterance → click → silence → blocked), reinforcing that the boundary failure can kill synthesis outright. A legacy-engine probe (Kathy/Fred — the classic `com.apple.speech.synthesis` MacinTalk voices, a different synthesizer from the modern AVSpeech voices) was queued as the last discriminator: if the legacy voices are click-free, readers on affected Firefox/macOS combinations have a working voice choice today via the reader's Voice picker.

**Final discriminator results (handoff):** Kathy/Fred still click, although
legacy voices survive boundaries more reliably. The v9 punctuation probes
(periods, commas, no punctuation, ellipses) all clicked with the same default
voice. No tested voice or text transformation removes the defect.

**Product decision:** Read-aloud is supported only in Chromium-based
browsers. Unsupported browsers show no read-aloud entry, only a dismissible
notice whose dismissal persists locally. Reading settings → Read-aloud →
Show read-aloud controls lets readers hide the transport on any browser;
hiding also stops active speech. Both preferences travel with export/import.
The browser support policy is conservative, not evidence that every other
engine or operating system reproduces the recorded macOS audio defect.
Revisit after real audio verification; fake-speech tests cannot prove that
audio clicks have been repaired.

**Recommended follow-ups:**

1. **Upstream bug** (Mozilla; also reproducible in Zen — same Gecko base): _"speechSynthesis on macOS: full-scale click at every internal sentence boundary; synthesis frequently dies at the boundary (utterance end never fires, queue blocks)"_ — reproduction: any multi-sentence utterance on Firefox 157 / macOS 10.15; the reader's evidence (§8–§10) is ready to attach.
2. Reader guidance: use a Chromium-based browser (Helium verified clean) until an upstream fix is verified.
3. The reader's own behavior is already honest under this defect: a synthesis death trips the playback-failure watchdog → the bar explains, the place is saved, Retry re-attempts.

---

## 1. The question

Read-aloud in Zen (a Firefox fork) on macOS reportedly opens the transport bar, produces no audible speech, and closes after a few seconds — on short and long articles, with both the system-default voice and Kathy, while the same long article works in Helium (Chromium). What actually fails, and what does the evidence support?

The engine's known failure ladder (before this issue) explains the _observed shape_ regardless of the platform trigger:

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

| Scenario                         | Result in Zen 1.23.1b                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| API presence                     | `speechSynthesis` + `SpeechSynthesisUtterance` present                                                                                    |
| Voice list                       | **0 voices at t=0 → 53 voices at ~1s** (async load; includes Kathy, Samantha, Fred, Ralph — the old `urn:moz-tts:osx:*` MacinTalk voices) |
| S2 volume-0 probe                | `start` at ~9ms after `speak()`, word boundaries every ~250–500ms, `end` at ~3.1s — **volume 0 does not suppress events**                 |
| S3a cancel→settle→speak          | works (start ~40ms after speak)                                                                                                           |
| S3b dead-probe → cancel → speak  | works                                                                                                                                     |
| S4 plain speak                   | works                                                                                                                                     |
| S5 delayed 2.6s                  | works (no user-activation expiry)                                                                                                         |
| S6 **Kathy explicitly assigned** | works (probe + audible)                                                                                                                   |
| S6 Samantha explicitly assigned  | works                                                                                                                                     |
| S7 speak before voices load      | events eventually fire; the utterance sat in Zen's queue behind later requests (see §5)                                                   |

### 3.2 Playwright Firefox 151 / Chromium / WebKit on macOS — same

All three control engines passed the identical suite (184 / 180 / 70 voices respectively; volume-0 probes fire everywhere; no gesture gate; no errors). Nothing in the engine's sequence is hostile to any of the three engines on this machine.

### 3.3 Consequence

The reported symptom cannot be explained by anything the engine _asks the platform to do_: every request shape it makes succeeds in a clean Zen profile on macOS, with both voices the reporter tried. Article length is affirmatively ruled out (short articles fail in the report; the harness spoke whole sequences fine). Candidate remaining triggers live in the reporter's environment (see §6), not in the app's request patterns.

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

No root-cause fix is claimed — none is supported by evidence; the honest deliverable is (a) the recorded platform evidence above, (b) the error-reason plumbing that makes the _next_ failure diagnosable, and (c) the recoverable failure experience, which converts any recurrence of this class from "menu closes after a few seconds" into "bar stays open, explains, offers Retry + voice selection, and preserves the place" — verified with deterministic speech tests plus real-browser UI checks, with working Chromium playback unchanged.
