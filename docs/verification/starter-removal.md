# Starter removal verification — PR #143

Explicit restoration from an unavailable starter article focuses its heading
before the ordinary saved-position restoration path. This also applies when a
library import supplied a position while the starter remained removed. Ordinary
article reopening continues to restore its saved position.

Verified on 2026-10-01:

- `npm run test:unit -- --run tests/unit/portability`: 285 tests passed.
- `npx playwright test tests/e2e/library/starter-removal.spec.ts tests/e2e/library/card-actions.spec.ts --workers=3`: 15 tests passed across Chromium, Firefox, and WebKit.
- `npm run lint`, `npm run lint:no-danger`, and `npm run build`: passed.

The browser checks cover keyboard restoration with a saved starter position in
paginated and scrolling modes, deletion followed by empty-library reload,
Settings restoration followed by another reload, tag-filter placement and
horizontal overflow at 320 CSS pixels, tag-filter operation under 400% CSS zoom,
and persistent read/unread card actions. The 320-pixel reflow assertion is shared
across engines; CSS zoom supplies an additional operability check.

The complete unit and browser suites were not run in this verification pass.
