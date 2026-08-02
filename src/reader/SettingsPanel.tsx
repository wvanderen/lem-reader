// src/reader/SettingsPanel.tsx
// The first <dialog> in the codebase. Opened via ref.current.showModal() so the
// browser provides the focus trap, Esc dismissal, ::backdrop, and auto-inert
// of the rest of the document for FREE (A11Y-01/03 — no hand-rolled roving
// tabindex, no manual inert management). Slides over the article from the
// inline end; the article stays mounted behind the scrim (single content tree
// — A11Y-03, no duplication).
//
// CRITICAL — Pitfall 1 (A11Y-02): showModal() does NOT auto-restore focus to
// the trigger on close. We capture document.activeElement (the gear) into
// triggerRef on open, and the dialog `close` event listener calls
// triggerRef.current?.focus(). The CALL SITE (triggerRef.current?.focus()) is
// asserted by tests/component/SettingsPanel.test.tsx; the actual focus-restore
// behavior is proven by tests/e2e/panel-keyboard.spec.ts across Chromium /
// Firefox / WebKit (Pitfall 2 — jsdom cannot replicate the inert/top-layer).
//
// Form controls (UI-SPEC §Interaction 9): Typeface/Spacing/Theme = fieldset +
// legend + radio; Size/Reading-width = input type=range with visible readout.
// Every control calls useSettings().update({...}) — the live-apply happens in
// SettingsContext's effect, NOT in this component (D2-03). Reset restores
// DEFAULT_SETTINGS (D2-04). Copy is verbatim UI-SPEC §Copywriting.
import { useEffect, useRef } from "react";
import { useSettings } from "../settings/SettingsContext";
import { MEASURE_STEPS, SIZE_STEPS } from "../settings/tokens";
import type { ReaderSettings } from "../content/schema";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // The trigger that opened the dialog — captured on open so the close handler
  // can restore focus (Pitfall 1 / A11Y-02). HTMLElement, not HTMLButton,
  // because document.activeElement is typed as Element | null.
  const triggerRef = useRef<HTMLElement | null>(null);

  const { settings, update, reset } = useSettings();

  // Sync the `open` prop with the underlying <dialog> state. showModal()/close
  // are idempotent guards — only flip when state actually differs.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Pitfall 1: capture the focused element BEFORE showModal moves focus
      // into the dialog. document.activeElement is the gear (the trigger).
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + WebKit quirk): Chromium
      // auto-focuses the first focusable control on showModal, but WebKit
      // leaves focus on <body> (cycling body↔dialog without reaching controls).
      // Explicitly focus the first focusable control so the focus trap and the
      // initial reading position are predictable everywhere. The .settings-close
      // button is the first focusable element in DOM order (panel header).
      const first =
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ?? dlg;
      first.focus();
    } else if (!open && dlg.open) {
      dlg.close(); // fires the `close` event → the listener below runs
    }
  }, [open]);

  // Register the `close` event listener (with cleanup). On close: flip React
  // state via onClose() and restore focus to the captured trigger (Pitfall 1).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      onClose();
      // A11Y-02: restore focus to the trigger. showModal does not do this for us.
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  // Form-change dispatchers — call update() with the typed patch. The
  // SettingsContext live-applies each change via applyTheme (D2-03).
  const onFont = (font: ReaderSettings["font"]) => update({ font });
  const onSize = (size: ReaderSettings["size"]) => update({ size });
  const onMeasure = (measure: ReaderSettings["measure"]) => update({ measure });
  const onSpacing = (spacing: ReaderSettings["spacing"]) => update({ spacing });
  const onTheme = (theme: ReaderSettings["theme"]) => update({ theme });
  const onReset = () => reset(); // D2-04 — restores DEFAULT_SETTINGS

  // The panel renders a <div> wrapper, NOT a <form method="dialog">. The
  // earlier form-wrapped variant caused a focus-trap edge case in Chromium
  // (focus briefly escaped to <body> during the wrap-around). Every control
  // here is type="button" with a React onChange/onClick handler, so no form
  // submission behavior is needed.
  return (
    <dialog ref={ref} className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-panel-inner">
        <div className="settings-panel-header">
          <h2 id="settings-title">Reading settings</h2>
          <button
            type="button"
            className="settings-close"
            aria-label="Close reading settings"
            onClick={onClose}
          >
            <CloseIcon aria-hidden="true" />
          </button>
        </div>

        <fieldset className="settings-section">
          <legend>Typeface</legend>
          <label className="settings-row">
            <input
              type="radio"
              name="font"
              value="serif"
              checked={settings.font === "serif"}
              onChange={() => onFont("serif")}
            />
            <span>Serif</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="font"
              value="sans"
              checked={settings.font === "sans"}
              onChange={() => onFont("sans")}
            />
            <span>Sans</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="font"
              value="dyslexic"
              checked={settings.font === "dyslexic"}
              onChange={() => onFont("dyslexic")}
            />
            <span>Dyslexia-friendly</span>
          </label>
        </fieldset>

        <fieldset className="settings-section">
          <legend>
            Text size <span className="settings-value">{settings.size} px</span>
          </legend>
          {/* Stepped range over SIZE_STEPS — min/max bound the slider, step
              matches the gap between consecutive steps so arrow keys land on a
              valid value. aria-valuenow carries the current value for AT. */}
          <input
            type="range"
            name="size"
            min={SIZE_STEPS[0]}
            max={SIZE_STEPS[SIZE_STEPS.length - 1]}
            step={SIZE_STEPS[1] - SIZE_STEPS[0]}
            value={settings.size}
            aria-label="Text size"
            aria-valuenow={settings.size}
            aria-valuemin={SIZE_STEPS[0]}
            aria-valuemax={SIZE_STEPS[SIZE_STEPS.length - 1]}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (SIZE_STEPS.includes(next as (typeof SIZE_STEPS)[number])) {
                onSize(next as ReaderSettings["size"]);
              }
            }}
          />
        </fieldset>

        <fieldset className="settings-section">
          <legend>
            Reading width{" "}
            <span className="settings-value">{settings.measure} ch</span>
          </legend>
          <input
            type="range"
            name="measure"
            min={MEASURE_STEPS[0]}
            max={MEASURE_STEPS[MEASURE_STEPS.length - 1]}
            step={MEASURE_STEPS[1] - MEASURE_STEPS[0]}
            value={settings.measure}
            aria-label="Reading width"
            aria-valuenow={settings.measure}
            aria-valuemin={MEASURE_STEPS[0]}
            aria-valuemax={MEASURE_STEPS[MEASURE_STEPS.length - 1]}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (
                MEASURE_STEPS.includes(next as (typeof MEASURE_STEPS)[number])
              ) {
                onMeasure(next as ReaderSettings["measure"]);
              }
            }}
          />
        </fieldset>

        <fieldset className="settings-section">
          <legend>Spacing</legend>
          <label className="settings-row">
            <input
              type="radio"
              name="spacing"
              value="compact"
              checked={settings.spacing === "compact"}
              onChange={() => onSpacing("compact")}
            />
            <span>Compact</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="spacing"
              value="comfortable"
              checked={settings.spacing === "comfortable"}
              onChange={() => onSpacing("comfortable")}
            />
            <span>Comfortable</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="spacing"
              value="spacious"
              checked={settings.spacing === "spacious"}
              onChange={() => onSpacing("spacious")}
            />
            <span>Spacious</span>
          </label>
        </fieldset>

        <fieldset className="settings-section">
          <legend>Theme</legend>
          <label className="settings-row">
            <input
              type="radio"
              name="theme"
              value="sepia"
              checked={settings.theme === "sepia"}
              onChange={() => onTheme("sepia")}
            />
            <span>Sepia</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="theme"
              value="light"
              checked={settings.theme === "light"}
              onChange={() => onTheme("light")}
            />
            <span>Light</span>
          </label>
          <label className="settings-row">
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={settings.theme === "dark"}
              onChange={() => onTheme("dark")}
            />
            <span>Dark</span>
          </label>
        </fieldset>

        <div className="settings-footer">
          {/* The Reset button's accessible name conveys the consequence (D2-04,
              UI-SPEC §Copywriting line 317); applyTheme + SettingsContext state
              flip together the moment it's clicked. */}
          <button type="button" className="settings-reset" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </div>
    </dialog>
  );
}

function CloseIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
