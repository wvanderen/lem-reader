// tests/e2e/_base.ts
// The ONE base-URL source for the e2e tree: every spec and helper imports
// BASE from here instead of re-declaring the fallback inline.
//
// Allocation lives in _server-port.mjs (issue #253): an explicit
// LEM_E2E_BASE override wins verbatim (CI's reference lane pins 15173; the
// #81/#94 parallel-wayfinder discipline pins its own), and the default is a
// stable per-worktree port — never the shared development default :5173, and
// never another worktree's port. The managed webServer (playwright.config.ts)
// resolves the SAME base and refuses to reuse any server it did not spawn.
import { resolveE2eBase } from "./_server-port.mjs";

export const BASE = resolveE2eBase();
