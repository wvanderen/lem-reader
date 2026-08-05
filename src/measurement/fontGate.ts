// src/measurement/fontGate.ts
// Font-readiness gate (D3-06). No measurement result is accepted as
// trustworthy before `document.fonts.ready` resolves — a font swap
// invalidates every predicted line break (Pitfall 3 — RESEARCH §Common
// Pitfalls 3: "font-swap invalidates breaks"). Every measurement pass must
// await `.ready` AFTER its trigger fires; the promise is re-awaitable and
// resolves fresh for each new font set, so re-awaiting on every trigger is
// the portable primitive.
//
// ANTI-PATTERN (RESEARCH §Anti-Patterns): `document.fonts.onloadingdone`
// is NOT Baseline (MDN "Limited availability"). It MUST NOT be the sole
// signal — re-awaiting `.ready` is the Baseline-widely-available primitive
// (MDN). This module is the ONLY font-readiness signal the measurement
// pipeline consumes.

/**
 * Sentinel thrown when a measurement pass is cancelled via its AbortSignal.
 * The engine's catch path checks `instanceof AbortError` to distinguish
 * cancellation (silent drop) from real errors (emit measurement-error).
 */
export class AbortError extends Error {
  readonly name = "AbortError";
  constructor(message = "measurement aborted") {
    super(message);
    // Restore prototype chain for older transpile targets.
    Object.setPrototypeOf(this, AbortError.prototype);
  }
}

/**
 * Await `document.fonts.ready`, throwing `AbortError` if `signal` is or
 * becomes aborted. The font-set may change between triggers (font swap,
 * first web-font load, future D2-06 dyslexic web-font); re-awaiting `.ready`
 * after every bump is the only portable way to catch a swap.
 *
 * Composes with Epoch: pass the AbortSignal returned by `epoch.bump()` so
 * a newer trigger cancels this await mid-flight. We race the font-ready
 * promise against the abort event so a never-resolving font promise still
 * surfaces cancellation (otherwise a mid-flight abort would hang forever
 * waiting for fonts to settle). The abort listener is registered with
 * `{ once: true }` so it self-cleans after firing.
 */
export async function awaitFontsReady(signal: AbortSignal): Promise<void> {
  // Fast-path: already aborted — fail before awaiting anything.
  if (signal.aborted) throw new AbortError();
  await Promise.race([
    document.fonts.ready,
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new AbortError()),
        { once: true },
      );
    }),
  ]);
}
