// src/vite-env.d.ts
// Ambient types for Vite-provided globals. The tsconfig `types` array already
// pulls in "vite/client"; the triple-slash reference below keeps this file
// self-sufficient if that ever changes. Phase 9 (D9-04 / 09-RESEARCH A3)
// adds the `__APP_VERSION__` build-time define (vite.config.ts `define`
// block) consumed by src/portability/bundle.ts resolveAppVersion() — the
// export bundle's diagnostic-only appVersion field.
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
