// src/ui/BusyButton.tsx
// Issue #98 (decision #96) — the ONE unified in-flight button register.
// Owns the exact attribute triple every in-flight submit used to hand-roll:
//
//   aria-busy="true" (undefined when idle) + disabled + the spinner arc
//   PREPENDED to the label (aria-hidden — the accessible name stays the
//   action; sighted readers get the wait, screen readers get busy state +
//   stable name + disabled semantics — the ReadingStateButton pattern).
//
// The shared CSS register (.btn[aria-busy] wait cursor + the spin keyframes
// under the positive reduced-motion gate) keys off the aria-busy attribute
// this component owns. Idle rendering is byte-identical to a plain button.
import type { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "./icons";

interface BusyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** True while this button's write is in flight. */
  busy: boolean;
}

export function BusyButton({
  busy,
  disabled,
  children,
  type = "button",
  ...rest
}: BusyButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
    >
      {busy && <SpinnerIcon />}
      {children}
    </button>
  );
}
