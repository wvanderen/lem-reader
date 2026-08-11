// Wave-0 stub — ING-07 / SC#4 (the mXSS regression suite).
// Replaced by Plan 07-04. These `test.todo` placeholders let the harness wire
// up now (tsc + vitest green) so 07-04 can swap them for real bodies.
//
// Gate contract (RESEARCH.md §Gate 2 L964-970): feed DOMPurify Attack Classes
// & Bypass History payloads through the full pipeline (Readability mock →
// DOMPurify → htmlToBlocks) and assert the resulting Block tree contains ZERO
// `<script>`, ZERO inline `on*` handlers, ZERO `javascript:` URIs, and ZERO
// SVG/MathML. A repo-wide `dangerouslySetInnerHTML` grep gate is the
// belt-and-suspenders structural defense (eslint `react/no-danger` already
// covers /server + /functions per 07-PATTERNS.md L713).
import { describe, test } from "vitest";

describe("mXSS regression suite (Wave-0 stub — replaced by 07-04)", () => {
  test.todo("script tag stripped");
  test.todo("inline on* handler stripped");
  test.todo("javascript: URI rejected by linkableUrl");
  test.todo("SVG/MathML stripped by USE_PROFILES html");
  test.todo("dangerouslySetInnerHTML grep gate zero matches");
});
