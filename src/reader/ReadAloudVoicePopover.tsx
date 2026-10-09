// src/reader/ReadAloudVoicePopover.tsx
// Issue #165 — the transport bar's Voice popover: the read-aloud voice is
// "one action away" from the bar (the speed select lives directly on the
// bar; the less frequent voice choice opens from the Voice button). A
// native popover="auto" panel (top layer, free light-dismiss + Esc) — the
// RowTagsPopover discipline — anchored to the bar's trigger through CSS
// anchor positioning (.readaloud-voice-trigger's anchor-name →
// .readaloud-voice-popover's position-anchor; opens UPWARD, the bar sits
// at the viewport's bottom edge, with native flip fallbacks).
//
// The voice options come from the SHARED useVoiceChoices seam — the exact
// filtered local list (system default first; a stored voice the filter hid
// is appended) the Reading-settings panel renders. A change writes through
// onVoiceChange immediately (fire-and-forget — no lost choice on
// light-dismiss); useReadAloud's retune seam applies it to the live session.
//
// Focus: the trigger's ref is PASSED IN by the bar (the real invoker —
// capturing document.activeElement at open would grab <body> on engines
// that don't focus buttons on click, WebKit among them). It is restored at
// close — but ONLY when focus currently sits inside the panel (Esc /
// light-dismiss), or explicitly by the Done handler. A popover="auto"
// panel doesn't trap focus; Tab cycles into the page and back (the bar's
// own no-trap rule).
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useVoiceChoices } from "./useVoiceChoices";

export interface ReadAloudVoicePopoverProps {
  /** True ⇒ the popover shows (anchored to the bar's Voice button). */
  open: boolean;
  /** The currently stored voice URI (undefined = system default). */
  voice: string | undefined;
  /** A picked voiceURI ("" = system default). Writes immediately. */
  onVoiceChange: (voiceURI: string) => void;
  /** Close request from ANY dismissal (Esc, light-dismiss, Done). */
  onClose: () => void;
  /** The Voice button's ref — the focus-restore target (the invoker). */
  triggerRef: RefObject<HTMLElement | null>;
}

export function ReadAloudVoicePopover({
  open,
  voice,
  onVoiceChange,
  onClose,
  triggerRef,
}: ReadAloudVoicePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  // The list is probed exactly while the panel is open (the SettingsPanel
  // pattern — Chrome fills getVoices() asynchronously).
  const { voiceOptions, storedVoiceMissing, storedVoiceLabel } = useVoiceChoices(open, voice);

  // Open/close seam — the RowTagsPopover pattern (idempotent twin runs; the
  // toggle-event close routes back through onClose).
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    if (open && !el.matches(":popover-open")) {
      el.showPopover();
    } else if (!open && el.matches(":popover-open")) {
      el.hidePopover();
    }
  }, [open]);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const handleToggle = (e: Event) => {
      const next = (e as ToggleEvent).newState === "open";
      if (next) return;
      // Close (user dismissal OR the programmatic flip). Restore focus to
      // the trigger only when the panel held it; then route through onClose
      // (idempotent — the bar clears an already-cleared flag).
      if (el.contains(document.activeElement)) triggerRef.current?.focus();
      onClose();
    };
    el.addEventListener("toggle", handleToggle);
    return () => el.removeEventListener("toggle", handleToggle);
    // triggerRef is a stable ref object (the bar owns it) — listed for the
    // exhaustive-deps rule, never a re-subscribe.
  }, [onClose, triggerRef]);

  return (
    <div
      ref={popoverRef}
      popover="auto"
      role="dialog"
      aria-label="Read-aloud voice"
      className="readaloud-voice-popover"
    >
      {open && (
        <>
          <label htmlFor="readaloud-voice-select" className="readaloud-voice-label">
            Read-aloud voice
          </label>
          <select
            id="readaloud-voice-select"
            className="settings-select"
            value={voice ?? ""}
            onChange={(e) => onVoiceChange(e.currentTarget.value)}
          >
            <option value="">System default voice</option>
            {voiceOptions.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
            {storedVoiceMissing && <option value={voice}>{storedVoiceLabel}</option>}
          </select>
          <p className="readaloud-voice-help">
            Voices installed on this device. Changes apply right away — even while reading aloud.
          </p>
          <div className="readaloud-voice-footer">
            {/* Done restores focus to the trigger ITSELF, before onClose:
                the content unmounts the moment `open` flips, so the toggle
                handler below would find no focused panel element to restore
                from (Esc and light-dismiss hide the panel FIRST — the
                browser fires toggle while the content is still mounted — so
                their restore path stays in the handler). Unconditional: the
                invoker ref is the button that opened the panel. */}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                triggerRef.current?.focus();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
