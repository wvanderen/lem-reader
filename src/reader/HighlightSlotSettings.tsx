// src/reader/HighlightSlotSettings.tsx
// Issue #195 — the five highlight slots' configuration editor, hosted by the
// settings panel's "Highlights" group. Each numbered slot exposes exactly the
// three editable fields the slot contract names — short name, ONE existing
// color choice, zero or more highlight tags — plus the EXPLICIT default-slot
// radio (ordinary creation uses it; applying another slot never rewrites it).
//
// Edits write through SettingsContext.update (debounced + dual-flush + the
// settingsStore Zod contract) as WHOLE-slot-array replacements — no in-place
// mutation of the settings record, so every notification sees a fresh
// immutable snapshot. Slot edits never touch historical highlights: a slot
// is a reusable preset copied at creation, not a live relation.
//
// Reuse discipline: the tag editor is the byte-unchanged TagEntry (the ONE
// tag vocabulary + normalization; a unique inputId per slot — the combobox
// id contract), the color radios are the closed HIGHLIGHT_COLOR_CHOICES with
// the shared decorative swatch, and every control is a native form control
// (radio/checkbox/input) so keyboard + screen-reader behavior is free.
import { HIGHLIGHT_COLOR_CHOICES } from "../annotations/highlightColors";
import { normalizeTags } from "../ingestion/library/tagText";
import { useEffect, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
import type { HighlightSlot } from "../content/schema";
import { TagEntry } from "./TagEntry";

/** One slot's editor block: number + live name, name field, color radios,
 * tag editor, default radio. Grouped + named by the visible slot number
 * (role="group" + aria-label) so screen readers announce "Slot 2" context
 * for every control inside. */
function HighlightSlotEditor({
  slot,
  index,
  isDefault,
  onPatch,
  onSetDefault,
}: {
  slot: HighlightSlot;
  index: number;
  isDefault: boolean;
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
              className={`highlight-color-choice${slot.color === choice.id ? " selected" : ""}`}
            >
              <input
                type="radio"
                name={`slot-color-${index}`}
                value={choice.id}
                checked={slot.color === choice.id}
                onChange={() => onPatch({ color: choice.id })}
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
 * HighlightSlotSettings — the five editors + the shared help line. Reads and
 * writes the settings record through useSettings; each patch rebuilds the
 * slot array immutably.
 */
export function HighlightSlotSettings(): React.ReactElement {
  const { settings, update } = useSettings();
  const slots = settings.highlightSlots;
  const defaultIndex = settings.defaultHighlightSlot;

  const patchSlot = (index: number, patch: Partial<HighlightSlot>): void => {
    update({
      highlightSlots: slots.map((s, i) => (i === index ? { ...s, ...patch } : s)),
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
          onPatch={(patch) => patchSlot(i, patch)}
          onSetDefault={() => update({ defaultHighlightSlot: i })}
        />
      ))}
      <p className="settings-help">
        Applying a slot to an existing highlight changes its color and adds the slot's tags — it
        never removes tags you added, and it never changes your default choice.
      </p>
    </div>
  );
}
