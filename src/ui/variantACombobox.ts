// src/ui/variantACombobox.ts
// Issues #75 + #107 — the ONE variant-A combobox register (the pattern
// decision #71 chose, first validated live on the TagPicker, now shared so
// the register's machinery exists once): a type-to-filter input whose
// list EITHER arrow opens (the ArrowUp-asymmetry fix — ArrowUp must not
// mutate `active` invisibly with Enter then committing nothing), with
// ArrowDown/ArrowUp moving the active option (wrapping) and Tab passing
// through (the listbox is never a trap). Escape is NOT intercepted — the
// host surface owns dismissal (the reader route's calm no-op; the tag
// popover/dialog). Enter policy is the host's: the input props route the
// key to the host's `onEnter`, so each host's commit contract stays
// visible at its own site. Focus opens the browse list (the
// click-to-pick path); blur closes it unless focus moved inside the
// picker root. No autoFocus prop (lint); hosts that OPEN the picker may
// focus it explicitly through the returned inputRef.
//
// Shape: the state hook runs first (draft/open/active own nothing about
// options), the host derives its option list from `state.lower`, and the
// pure `variantAComboboxInputProps` builder then receives the real option
// count + the host's Enter policy — no render-order circularity.
import { useRef, useState } from "react";
import type {
  ComponentPropsWithRef,
  Dispatch,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";

export interface VariantAComboboxState {
  draft: string;
  /** Raw open flag — hosts derive their listOpen (special lines included). */
  open: boolean;
  active: number;
  /** The trimmed, lowercased draft — the shared matching key. */
  lower: string;
  /** Clear the draft, close the list, rest the active index (post-pick). */
  reset: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  setDraft: Dispatch<SetStateAction<string>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setActive: Dispatch<SetStateAction<number>>;
}

export function useVariantAComboboxState(): VariantAComboboxState {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDraft("");
    setOpen(false);
    setActive(0);
  }

  return {
    draft,
    open,
    active,
    lower: draft.trim().toLowerCase(),
    reset,
    inputRef,
    setDraft,
    setOpen,
    setActive,
  };
}

export interface VariantAComboboxInputOptions {
  state: VariantAComboboxState;
  /** The combobox input's id (hosts own labeling + the e2e anchors). */
  inputId: string;
  /** Root element class the blur-containment check scopes to. */
  rootClassName: string;
  /** Selectable option count (special lines — create/no-match — excluded). */
  optionCount: number;
  /** The host's Enter policy; called only for Enter and owns preventDefault. */
  onEnter: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * variantAComboboxInputProps — the shared combobox anatomy: combobox role +
 * aria-controls wiring, open-on-focus / close-on-outside-blur, and the
 * variant-A keydown (either arrow opens + moves with wrapping; Enter
 * routes to the host policy). Spread it first; hosts layer className,
 * placeholder, aria-expanded, and aria-activedescendant over it. The
 * listbox id (for the host's aria wiring) is `${inputId}-listbox`.
 */
export function variantAComboboxInputProps({
  state,
  inputId,
  rootClassName,
  optionCount,
  onEnter,
}: VariantAComboboxInputOptions): ComponentPropsWithRef<"input"> {
  const { draft } = state;
  const listboxId = `${inputId}-listbox`;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && optionCount > 0) {
      e.preventDefault();
      // Either arrow opens a closed-but-nonempty list — the ArrowUp-
      // asymmetry fix (see module header).
      state.setOpen(true);
      state.setActive((a) =>
        e.key === "ArrowDown"
          ? (a + 1) % optionCount
          : (a - 1 + optionCount) % optionCount,
      );
    } else if (e.key === "Enter") {
      onEnter(e);
    }
  }

  return {
    ref: state.inputRef,
    id: inputId,
    type: "text",
    autoComplete: "off",
    role: "combobox",
    "aria-controls": listboxId,
    value: draft,
    onChange: (e) => {
      state.setDraft(e.target.value);
      state.setOpen(true);
      state.setActive(0);
    },
    onFocus: () => {
      // Focus opens the browse list (the click-to-pick path — the reader
      // can pick without typing at all); the blur handler closes it again.
      state.setOpen(true);
    },
    onKeyDown: handleKeyDown,
    onBlur: (e) => {
      if (
        !e.currentTarget
          .closest(rootClassName)
          ?.contains(e.relatedTarget as Node | null)
      ) {
        state.setOpen(false);
      }
    },
  };
}

/** The shared listbox id derivation (hosts wire aria-activedescendant). */
export function variantAListboxId(inputId: string): string {
  return `${inputId}-listbox`;
}
