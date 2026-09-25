// tests/e2e/_base.ts
// The ONE base-URL source for the e2e tree: every spec and helper imports
// BASE from here instead of re-declaring the LEM_E2E_BASE fallback inline.
// The env override is the parallel-wayfinder-sessions discipline (#81/#94) —
// a session pins its own dev server with
//   LEM_E2E_BASE=http://localhost:5321 npx playwright test ...
// and the default stays the shared dev server.
export const BASE = process.env.LEM_E2E_BASE ?? "http://localhost:5173";
