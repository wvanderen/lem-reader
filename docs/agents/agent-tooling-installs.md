# Agent-tooling installs

> Issue #255. A third-party skill installation once landed agent tooling in
> the product worktree, activated unreviewed hooks, and disturbed lint/format.
> The vendor exclusions added afterwards (in `eslint.config.js` and
> `.prettierignore`) are the standing fix — preserve them. This doc is the
> discipline for the next install.

## Before installing

- **Decide the scope explicitly.** User-level tooling (skills for _you_, any
  repo) installs under your agent config dir (e.g. `~/.agents/skills/`,
  `~/.pi/agent/skills/`) — never inside this repository. Repo-level tooling
  (shared with every contributor, reviewed in PRs) installs into this repo's
  vendored locations only: `.github/skills/`, `.github/agents/`, `.github/hooks/`.
- **Get explicit user approval** for anything that activates automatically
  (hooks, observers, formatters) — an unreviewed hook is code that runs on
  every edit.

## During/after installing

- **Check the working tree before committing:** `git status --short` and
  `git diff --stat`. An install must add only its own vendored files. It must
  never reformat, revert, or delete unrelated files, and a commit must never
  silently carry them — stage deliberately, not with `git add -A` over a
  surprise.
- **Keep vendored tooling out of product source:** nothing under `.github/skills`
  or `.github/agents` imports from or is imported by `src/`, `server/`,
  `functions/`. These directories are excluded from ESLint and Prettier
  (upstream formatting wins; reformatting would break upstream diffs) — if a
  new vendor root is added, extend those same ignores rather than formatting
  the vendor tree.
- **Hooks are opt-in by review.** `.github/hooks/*.json` only takes effect
  through an agent harness that reads it; when adding or changing one, say so
  in the PR and link the hook's source.

## Distinguishing tooling from product

| Vendored agent tooling                                 | Product source                             |
| ------------------------------------------------------ | ------------------------------------------ |
| `.github/skills/`, `.github/agents/`, `.github/hooks/` | `src/`, `server/`, `functions/`, `public/` |
| Owned by the tool's upstream; update by re-vendoring   | Owned by this repo; normal review          |
| Excluded from lint/format                              | Full lint/format/type/CI gates             |

If an install cannot respect this split (it wants to modify product files,
activate hooks, or change repo config), stop and surface the diff to the user
before proceeding.
