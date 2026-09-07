---
status: complete
---
# Open-source and portfolio readiness

Implemented in commit `234f46c`.

- Added a portfolio-facing README with product positioning, feature overview, architecture and security rationale, local setup, commands, repository map, honest limitations, feedback routes, and licensing.
- Added an MIT license, contribution guide, and private vulnerability-reporting policy.
- Added structured GitHub issue forms for bugs and ideas, disabled unstructured blank issues, and linked private security advisories.
- Added a quiet Library footer linking to a prefilled GitHub feedback issue. Its accessible name announces that GitHub opens in a new tab.
- Added standard package repository, bug tracker, homepage, and license metadata while retaining `private: true` to prevent accidental npm publication.

## Verification

- ESLint and `lint:no-danger` passed.
- Full unit suite passed: 104 files and 1,605 tests, with 2 files / 13 tests intentionally skipped.
- Production TypeScript/Vite build passed; the existing large-chunk advisory remains unchanged.
- Focused App component suite passed: 17 tests, including the feedback URL contract.
- All three GitHub issue configuration files parsed as valid YAML; `git diff --check` passed.
- Browser inspection confirmed the Library renders the link with the expected URL, `_blank` target, `noreferrer`, visible accessibility-tree name, and no horizontal overflow at 1280px.

## Workflow

GSD quick executed inline because automatic sub-agent delegation was not authorized. No reading-engine, ingestion, persistence, or annotation behavior changed.
