// src/reader/HighlightSlotSettings.tsx
// Issue #195 — the five highlight slots' configuration editor, hosted by the
// settings panel's "Highlights" group. Each numbered slot exposes exactly the
// three editable fields the slot contract names — short name, ONE color
// choice, zero or more highlight tags — plus the EXPLICIT default-slot
// radio (ordinary creation uses it; applying another slot never rewrites it).
//
// Issue #196 — the color choice widens to an ARBITRARY color: the closed
// named radios join a "Custom" pill backed by a native <input type="color">
// (always a #rrggbb value — the schema's strict-hex grammar) and a LIVE
// preview that renders the ACTUAL mark anatomy (the shared traits helpers +
// tint style) with the derived readable tint for the ACTIVE theme. Preview =
// render by construction: the preview mark, the reader's marks, and the
// review stripe all derive through readableHighlightTint against the same
// highlightBases(settings) resolver. A custom color is snapshotted onto
// highlights at creation — editing the slot never recolors historical
// annotations (the preview shows what NEW highlights will look like).
//
// Edits write through SettingsContext.update (debounced + dual-flush + the
// settingsStore Zod contract) as WHOLE-slot-array replacements — no in-place
// mutation of the settings record, so every notification sees a fresh
// immutable snapshot. A named pick clears the customColor key entirely
// (never an undefined-valued residue) so the stored row, the localStorage
// mirror, and the exported JSON stay byte-stable. Slot edits never touch
// historical highlights: a slot is a reusable preset copied at creation,
// not a live relation.
//
// Issue #219 — the native color input carries a LOCAL DRAFT + commits on
// settle, NOT per event. Chrome/Windows fires the `input` event continuously
// while dragging in the OS picker, and a per-event onPatch is three cascades
// per tick (synchronous setSettings + the applyTheme effect's full
// resolveCustomTheme + a fresh context value re-rendering EVERY useSettings
// consumer — ArticleView included) — a render storm that crawls on low-end
// machines. The debounced Dexie save was never the cost; the render storm
// is. So the drag lives in editor-local state (the preview derives from the
// draft — ONE cheap customHighlightTint call), and settings see at most ONE
// update per settle: a ~300ms quiet debounce. Deliberately NOT the native
// `change` event (verified per engine 2026-10-31, by reading the engines):
// WebKit fires `change` on EVERY picker adjustment
// (Source/WebCore/html/ColorInputType.cpp didChooseColor →
// dispatchFormControlChangeEvent, per tick), so change-based settle would
// keep the storm on WebKit; Chromium fires it only at dismissal
// (color_input_type.cc DidEndChooser → EnqueueChangeEvent) and Gecko only
// at Done (nsColorPickerShownCallback::Done — "end of a serie of Update()
// calls… a change event will have to be fired"). The quiet window is the
// one settle signal all three engines agree on.
//
// Reuse discipline: the tag editor is the byte-unchanged TagEntry (the ONE
// tag vocabulary + normalization; a unique inputId per slot — the combobox
// id contract), the named color radios are the closed HIGHLIGHT_COLOR_CHOICES
// with the shared decorative swatch, and every control is a native form
// control (radio/checkbox/input/color) so keyboard + screen-reader behavior
// is free.
import { HIGHLIGHT_COLOR_CHOICES } from "../annotations/highlightColors";
import { highlightClassName } from "../annotations/highlightColors";
import { normalizeTags } from "../ingestion/library/tagText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
import { highlightBases, customHighlightTint, tintMarkStyle } from "../settings/highlightTint";
import type { HighlightSlot } from "../content/schema";
import { TagEntry } from "./TagEntry";
// Issue #196 — the ONE Custom pill anatomy (shared with the panel picker).
import { CustomColorPill } from "./annotations/CustomColorPill";

/** The hex a slot's Custom choice seeds with on first activation (a calm
 * amber clearly outside the five named fills — the native color picker takes
 * over from there). Adjusted for readability by the tint derivation at
 * render; the reader's pick is what the record stores. */
const CUSTOM_COLOR_SEED = "#e9c46a";

/** The quiet window that ends a picker drag (issue #219): one settle signal
 * all three engines agree on (see the module header — the native `change`
 * event fires per drag tick on WebKit, so it cannot carry the settle). The
 * LAST input event starts the window; any earlier event inside it resets
 * it, so a continuous drag commits nothing until it pauses. Exported for
 * the settle spec's ONE spelling. */
export const COLOR_SETTLE_MS = 300;

/** Issue #219 — the picker drag's draft-local commit-on-settle, ONE home for
 * the whole discipline (gathered from the review round: the draft state, its
 * ref twin for the async settle path, the settle timer, and the latest
 * commit facts). The drag lives in THIS hook's state, so a drag re-renders
 * exactly the host editor subtree — never the settings context, so every
 * useSettings consumer behind the panel stays put while the reader drags.
 *
 *   - trackColorTick(hex) — one picker `input` event: remember the hex
 *     locally + (re)arm the settle window. Per-event cost = one local
 *     setState + one timer reset: no settings write, no context churn.
 *   - settleColorDraft() — the ONE commit path (the quiet window firing, or
 *     teardown). A draft equal to the committed hex commits nothing (a
 *     re-fired change from the picker's dismissal must not mint a redundant
 *     settings update).
 *   - cancelColorDraft() — drop a pending draft WITHOUT committing: the
 *     named-pick path (the radio click is the LATER intent; a settle firing
 *     after it must not resurrect the custom color the reader abandoned).
 */
function useColorDraft({
  committed,
  onPatch,
}: {
  /** The slot's committed customColor — the truth a settle compares against. */
  committed: string | undefined;
  /** The host's settings write, reached at settle time through the latest
   * facts (a timer callback must never read a stale closure). */
  onPatch: (patch: { customColor: string }) => void;
}): {
  colorDraft: string | null;
  trackColorTick: (hex: string) => void;
  settleColorDraft: () => void;
  cancelColorDraft: () => void;
} {
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const colorDraftRef = useRef<string | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const settleFactsRef = useRef({ committed, onPatch });
  // Effect form, not a render-phase write: refs are not render output, and
  // the effect has always run long before a settle can fire (≥300ms after
  // the last tick) or before teardown cleanup reads it.
  useEffect(() => {
    settleFactsRef.current = { committed, onPatch };
  }, [committed, onPatch]);

  /** Disarm the settle window (both the settle + cancel paths start here). */
  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const settleColorDraft = useCallback(() => {
    clearSettleTimer();
    const draft = colorDraftRef.current;
    if (draft === null) return; // no drag in flight — also the cancel no-op
    colorDraftRef.current = null;
    setColorDraft(null);
    const { committed, onPatch } = settleFactsRef.current;
    if (draft !== committed) onPatch({ customColor: draft });
  }, [clearSettleTimer]);

  const trackColorTick = useCallback(
    (hex: string) => {
      colorDraftRef.current = hex;
      setColorDraft(hex);
      clearSettleTimer();
      settleTimerRef.current = window.setTimeout(settleColorDraft, COLOR_SETTLE_MS);
    },
    [clearSettleTimer, settleColorDraft],
  );

  const cancelColorDraft = useCallback(() => {
    clearSettleTimer();
    if (colorDraftRef.current !== null) {
      colorDraftRef.current = null;
      setColorDraft(null);
    }
  }, [clearSettleTimer]);

  // Teardown settles (honesty — a route change or panel teardown inside the
  // window never drops the reader's pick) and clears the timer either way.
  // StrictMode's dev double-mount finds no draft at cleanup time — no-op.
  useEffect(() => settleColorDraft, [settleColorDraft]);

  return { colorDraft, trackColorTick, settleColorDraft, cancelColorDraft };
}

/** One slot's editor block: number + live name, name field, color radios
 * (named choices + Custom with its native color input), the live rendered
 * preview, tag editor, default radio. Grouped + named by the visible slot
 * number (role="group" + aria-label) so screen readers announce "Slot 2"
 * context for every control inside. */
function HighlightSlotEditor({
  slot,
  index,
  isDefault,
  bases,
  onPatch,
  onSetDefault,
}: {
  slot: HighlightSlot;
  index: number;
  isDefault: boolean;
  /** Issue #196 — the active theme's surface + ink pair (the preview's
   * derivation bases — the SAME resolver the render surfaces use). */
  bases: ReturnType<typeof highlightBases>;
  onPatch: (patch: Partial<HighlightSlot>) => void;
  onSetDefault: () => void;
}) {
  const n = index + 1;
  // Local draft for the name field: the schema requires a non-empty name, so
  // an intermediate empty value stays in the FIELD while the setting keeps
  // the last valid name — clearing + retyping behaves like a plain input,
  // and blur restores the saved name when the draft is whitespace-only.
  const [nameDraft, setNameDraft] = useState(slot.name);
  useEffect(() => {
    setNameDraft(slot.name);
  }, [slot.name]);

  // Issue #219 — the picker drag lives in the LOCAL draft (see useColorDraft
  // for the whole settle discipline + why the native `change` event cannot
  // carry the settle).
  const { colorDraft, trackColorTick, cancelColorDraft } = useColorDraft({
    committed: slot.customColor,
    onPatch,
  });

  // The color the editor currently tells the truth about: the in-drag draft
  // when one is in flight, else the committed snapshot. ONE spelling feeds
  // the Custom radio's checked state, the pill's seed, the native input's
  // value, and the preview's derivation — they can never disagree.
  const effectiveColor = colorDraft ?? slot.customColor;
  const isCustom = effectiveColor !== undefined;
  // The preview's derived tint (the SAME derivation the reader's marks and
  // the review stripe run). Undefined only outside a valid custom color.
  const previewTint = customHighlightTint(effectiveColor, bases);
  return (
    <div className="highlight-slot-editor" role="group" aria-label={`Slot ${n}`}>
      <p className="highlight-slot-editor-title">
        <span className="highlight-slot-number" aria-hidden="true">
          {n}
        </span>
        <span className="highlight-slot-editor-name">{slot.name}</span>
        {isDefault && <span className="highlight-slot-default-badge">Default</span>}
      </p>
      <label className="highlight-slot-editor-field">
        <span>Name</span>
        <input
          type="text"
          value={nameDraft}
          maxLength={40}
          aria-label={`Slot ${n} name`}
          onChange={(e) => {
            const name = e.currentTarget.value;
            setNameDraft(name);
            if (name.trim().length > 0) onPatch({ name: name.trim() });
          }}
          onBlur={() => {
            if (nameDraft.trim().length === 0) setNameDraft(slot.name);
          }}
        />
      </label>
      <fieldset className="settings-section highlight-slot-colors">
        <legend>Slot {n} color</legend>
        <div className="highlight-color-picker">
          {HIGHLIGHT_COLOR_CHOICES.map((choice) => (
            <label
              key={choice.id}
              className={`highlight-color-choice${
                !isCustom && slot.color === choice.id ? " selected" : ""
              }`}
            >
              <input
                type="radio"
                name={`slot-color-${index}`}
                value={choice.id}
                checked={!isCustom && slot.color === choice.id}
                onChange={() => {
                  // The named pick is the later intent: cancel any in-flight
                  // drag FIRST (issue #219) so the pending settle can never
                  // resurrect what the reader just abandoned.
                  cancelColorDraft();
                  onPatch({ color: choice.id, customColor: undefined });
                }}
                className="highlight-color-input"
              />
              {/* Decorative swatch — the text label + checked state carry the
                  meaning; the dot is presentation only. */}
              <span
                className={`highlight-color-swatch highlight-color-swatch-${choice.id}`}
                aria-hidden="true"
              />
              <span className="highlight-color-label">{choice.label}</span>
            </label>
          ))}
          {/* Issue #196 — the Custom choice: activates with a seed hex (or
              the current input value when returning), paints the derived
              tint as its swatch. A named pick clears the snapshot — the
              radios always show exactly one color source. The pill anatomy
              is the shared CustomColorPill (the panel picker's twin). */}
          <CustomColorPill
            name={`slot-color-${index}`}
            checked={isCustom}
            onActivate={() => onPatch({ customColor: effectiveColor ?? CUSTOM_COLOR_SEED })}
            tint={previewTint}
          />
        </div>
        {/* The native color input — the arbitrary picker. Always present +
            enabled so keyboard and touch users reach it directly. Issue #219:
            drag ticks land in the LOCAL draft (the preview follows live); the
            commit is ONE settings update per settle — the quiet window named
            by COLOR_SETTLE_MS (see the module header for why the native
            `change` event cannot carry the settle). Keyboard nudges (arrow
            keys) settle the same way once the reader pauses. */}
        <div className="highlight-slot-custom-row">
          <label className="highlight-slot-editor-field">
            <span>Custom color</span>
            <input
              type="color"
              value={effectiveColor ?? CUSTOM_COLOR_SEED}
              aria-label={`Slot ${n} custom color`}
              onChange={(e) => trackColorTick(e.currentTarget.value)}
            />
          </label>
          {/* The LIVE preview: the actual <mark> anatomy the reader's
              highlights render with (shared traits helpers + tint style),
              derived against the ACTIVE theme — from the DRAFT while a drag
              is in flight, from the committed snapshot after (issue #219: the
              reader watches the true result without a single settings write
              until the drag settles). */}
          <p className="highlight-slot-preview">
            <mark
              className={highlightClassName({
                color: slot.color,
                customColor: effectiveColor,
                hasNote: false,
                status: "confident",
              })}
              style={tintMarkStyle(previewTint)}
            >
              How a highlight reads
            </mark>
          </p>
        </div>
      </fieldset>
      {/* The byte-unchanged TagEntry — the ONE tag vocabulary. saveTags
          normalizes (trim/dedupe) then replaces the slot's tag array; the
          unique inputId keeps the five combobox ids distinct in one document. */}
      <div className="highlight-slot-editor-field">
        <span className="highlight-slot-tags-label" id={`slot-tags-label-${index}`}>
          Slot {n} tags
        </span>
        <TagEntry
          recordId={`highlight-slot-${index}`}
          tags={slot.tags}
          saveTags={async (next) => onPatch({ tags: normalizeTags(next) })}
          inputId={`slot-tags-input-${index}`}
        />
        <p className="settings-help">
          Tags this slot adds to a new highlight. Existing tags on a highlight are never removed.
        </p>
      </div>
      <label className="settings-row highlight-slot-default-row">
        <input
          type="radio"
          name="default-highlight-slot"
          value={index}
          checked={isDefault}
          onChange={onSetDefault}
        />
        <span>Default for new highlights</span>
      </label>
    </div>
  );
}

/**
 * HighlightSlotSettings — the five editors + the shared help lines. Reads and
 * writes the settings record through useSettings; each patch rebuilds the
 * slot array immutably (and strips an undefined-valued customColor so the
 * stored row stays JSON-clean).
 */
export function HighlightSlotSettings(): React.ReactElement {
  const { settings, update } = useSettings();
  const slots = settings.highlightSlots;
  const defaultIndex = settings.defaultHighlightSlot;
  // Issue #196 — the preview + swatch derivation bases (the SAME resolver
  // ArticleView feeds its render surfaces — preview = render by
  // construction, in every theme including the derived custom slots).
  const bases = useMemo(() => highlightBases(settings), [settings]);

  const patchSlot = (index: number, patch: Partial<HighlightSlot>): void => {
    update({
      highlightSlots: slots.map((s, i) => {
        if (i !== index) return s;
        const merged = { ...s, ...patch };
        // A named pick clears the custom snapshot entirely — never an
        // undefined-valued key (JSON/IDB shape stays byte-stable).
        if (merged.customColor === undefined) delete merged.customColor;
        return merged;
      }),
    });
  };

  return (
    <div className="highlight-slots-editor">
      <p className="settings-help">
        Five numbered quick presets for new highlights. Editing a slot never changes highlights you
        already made.
      </p>
      {slots.map((slot, i) => (
        <HighlightSlotEditor
          key={i}
          slot={slot}
          index={i}
          isDefault={defaultIndex === i}
          bases={bases}
          onPatch={(patch) => patchSlot(i, patch)}
          onSetDefault={() => update({ defaultHighlightSlot: i })}
        />
      ))}
      <p className="settings-help">
        A custom color previews how it will actually read in your current theme. Applying a slot to
        an existing highlight changes its color and adds the slot's tags — it never removes tags you
        added, and it never changes your default choice.
      </p>
    </div>
  );
}
