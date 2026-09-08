---
status: complete
---
# Smooth progress and optional page-turn motion

Implemented in 5f2e583. Progress uses a 200ms eased scale transition under no-preference. Reading settings now offer a default-off, locally persisted page fade (180ms). The single semantic page tree remains present; geometry, focus, navigation and pagination are unchanged. Live reduced-motion changes cancel the fade. Older settings remain valid with the optional field absent.

Validation: production build and lint passed; 111 settings/schema/mirror/portability unit tests passed. Browser run: 51 passed, 12 failed. All new motion, progress and page-stability checks passed in Chromium, Firefox and WebKit. The 12 failures are four existing library/review destination tests per engine blocked by missing library fixture text “The looting of science fiction”, before motion checks. Final mobile/desktop motion run: 3/3 passed; screenshots inspected at 390px and desktop. New helper copy uses UI typography and native themed checkbox.

Impeccable updated successfully to v4.2.2 per user authorization. No deployment performed.
