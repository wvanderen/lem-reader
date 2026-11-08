import { useCallback, useEffect, useRef } from "react";

/** Retire asynchronous navigation after departure, unmount, or a newer press. */
export function useNavigationIntent(): () => () => boolean {
  const generation = useRef(0);
  useEffect(() => {
    const retire = () => {
      generation.current += 1;
    };
    window.addEventListener("hashchange", retire);
    window.addEventListener("popstate", retire);
    return () => {
      retire();
      window.removeEventListener("hashchange", retire);
      window.removeEventListener("popstate", retire);
    };
  }, []);
  return useCallback(() => {
    const token = ++generation.current;
    const hash = window.location.hash;
    return () => generation.current === token && window.location.hash === hash;
  }, []);
}
