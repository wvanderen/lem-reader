import { useCallback, useEffect, useRef, useState } from "react";

/** Hover/focus labels and non-activating touch/pen inspection for compact actions. */
export function useActionInspection() {
  const [inspectionLabel, setInspectionLabel] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspected = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchFocusing = useRef(false);
  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);
  useEffect(() => () => clearHold(), [clearHold]);
  const resetInspection = useCallback(() => {
    clearHold();
    inspected.current = false;
    touchFocusing.current = false;
    touchStart.current = null;
    setInspectionLabel(null);
    setHoveredLabel(null);
    setFocusedLabel(null);
  }, [clearHold]);
  const inspectionProps = (label: string, activate: () => void) => ({
    onMouseEnter: () => setHoveredLabel(label),
    onMouseLeave: () => setHoveredLabel(null),
    onFocus: () => {
      if (!touchFocusing.current) setFocusedLabel(label);
    },
    onBlur: () => {
      setFocusedLabel(null);
      setInspectionLabel(null);
    },
    onPointerDown: (event: React.PointerEvent) => {
      clearHold();
      inspected.current = false;
      touchFocusing.current = event.pointerType === "touch" || event.pointerType === "pen";
      if (!touchFocusing.current) return;
      touchStart.current = { x: event.clientX, y: event.clientY };
      holdTimer.current = setTimeout(() => {
        inspected.current = true;
        setInspectionLabel(label);
      }, 500);
    },
    onPointerUp: () => {
      clearHold();
      touchFocusing.current = false;
    },
    onPointerCancel: () => {
      clearHold();
      inspected.current = false;
      touchFocusing.current = false;
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = touchStart.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearHold();
    },
    onContextMenu: (event: React.MouseEvent) => {
      if (touchFocusing.current || inspected.current) event.preventDefault();
    },
    onClick: (event: React.MouseEvent) => {
      if (inspected.current && event.detail !== 0) {
        inspected.current = false;
        event.preventDefault();
        return;
      }
      activate();
    },
  });
  return {
    activeLabel: hoveredLabel ?? inspectionLabel ?? focusedLabel,
    inspectionProps,
    resetInspection,
  };
}
