// src/reader/useVoiceChoices.ts
// Issue #165 — the probed read-aloud voice list, shared by BOTH pickers
// (the Reading-settings panel and the transport bar's Voice popover — one
// seam, one behavior). The platform seam itself (probeVoices /
// filterVoiceChoices) stays framework-free in src/readaloud/webSpeech.ts;
// this is only the React glue around it.
//
// The list is PROBED when `active` turns true (Chrome fills getVoices()
// asynchronously via voiceschanged; probeVoices bounds the wait), and the
// OPTIONS show the filtered local-voice list while the unfiltered probe
// labels a stored voice the filter hid (a remote voice, or one since
// uninstalled) — the stored-but-hidden voice is APPENDED by the caller so
// the control always reflects the live truth (never a value with no
// option, never a silent mismatch between what is stored and what is
// displayed).

import { useEffect, useState } from "react";
import { filterVoiceChoices, probeVoices, speechSynthesisAvailable } from "../readaloud/webSpeech";
import type { VoiceChoice } from "../readaloud/webSpeech";

export interface VoiceChoices {
  /** Whether the platform exposes speechSynthesis at all. */
  speechAvailable: boolean;
  /** The filtered local-voice list (empty until the probe resolves). */
  voiceOptions: VoiceChoice[];
  /** The stored voice exists but the filtered list hid it — the caller
   * appends an option so the select never shows a valueless state. */
  storedVoiceMissing: boolean;
  /** The hidden stored voice's display label (its real name when the
   * platform knows it, else the opaque URI). Only meaningful when
   * storedVoiceMissing is true. */
  storedVoiceLabel: string | undefined;
}

export function useVoiceChoices(active: boolean, storedVoice: string | undefined): VoiceChoices {
  // Capability is environment-level — computed once per mount (the
  // SettingsPanel's hasWebCrypto pattern).
  const [speechAvailable] = useState(speechSynthesisAvailable);
  const [probedVoices, setProbedVoices] = useState<VoiceChoice[] | null>(null);
  useEffect(() => {
    if (!active || !speechAvailable) return;
    let cancelled = false;
    probeVoices().then((voices) => {
      if (!cancelled) setProbedVoices(voices);
    });
    return () => {
      cancelled = true;
    };
  }, [active, speechAvailable]);

  const voiceOptions = probedVoices ? filterVoiceChoices(probedVoices) : [];
  const storedVoiceMissing =
    storedVoice !== undefined && !voiceOptions.some((v) => v.voiceURI === storedVoice);
  const storedChoice = (probedVoices ?? []).find((v) => v.voiceURI === storedVoice);
  const storedVoiceLabel = storedVoiceMissing
    ? (storedChoice?.name ??
      (probedVoices === null ? storedVoice : `${storedVoice} (unavailable — using system default)`))
    : storedVoice;
  return { speechAvailable, voiceOptions, storedVoiceMissing, storedVoiceLabel };
}
