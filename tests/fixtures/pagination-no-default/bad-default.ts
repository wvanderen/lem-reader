// tests/fixtures/pagination-no-default/bad-default.ts
// Issue #255 — the DELIBERATELY BAD fixture for the pagination no-default
// lint gate (scripts/check-pagination-no-default.mjs). The `default:` branch
// below is exactly the Pattern F violation the gate rejects; `npm run lint`
// proves it can reject this file via the gate's --self-test pass. This
// fixture is test data, never imported by product code.
type Transport = "rail" | "ferry" | "trail";

export function boardingGate(mode: Transport): string {
  switch (mode) {
    case "rail":
      return "platform 9";
    case "ferry":
      return "pier 4";
    case "trail":
      return "trailhead";
    // The prohibited fallback branch: a future Transport literal would be
    // silently swallowed instead of failing to compile.
    default:
      return "unknown";
  }
}
