# Phase 2: Accessible Scrolling Reader — Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 34 (5 modified + 19 new + 10 new test files)
**Analogs found:** 31 / 34 (3 are genuinely novel — first-of-kind in this codebase)

## ⚠ Context Note for Planner

Unlike Phase 1 (greenfield), **Phase 2 extends a real, shipped codebase.** Every modified file has an in-repo analog (itself), and most new files have a close structural sibling. The pattern excerpts below cite **real source lines** with paths + line numbers — the planner's `<action>` blocks should lift from these, not from RESEARCH.md sketches when a real analog exists.

**Three genuinely-novel mechanisms** (no in-repo analog — lift from `02-RESEARCH.md` §Architecture Patterns):
1. Native `<dialog>`/`showModal()` focus-trap + restore (Pattern 1) — first dialog in the codebase
2. React Context (`SettingsContext`) — first context/provider in the codebase (STACK.md forbids Redux/Zustand; React context is the sanctioned choice)
3. `IntersectionObserver` scroll-spy (Pattern 6) — first observer in the codebase

Everything else maps to an existing shipped file.

---

## File Classification

> **Role legend:** `model` = Zod schema + inferred types · `service` = repository / Dexie store seam · `provider` = React context provider · `utility` = pure helper · `renderer` = React component emitting semantic HTML · `hook` = React custom hook · `route` = top-level view · `config` = CSS / app shell · `test` = Vitest (jsdom) / Playwright (3-engine)

> **Data flow legend:** `request-response` = render-once async load · `event-driven` = observer/listener-driven · `transform` = pure in→out · `CRUD` = store read/write · `pub-sub` = context fan-out · `n/a` = static

| # | New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|-------------------|------|-----------|----------------|---------------|
| 1 | `src/persistence/db.ts` *(EDIT)* | service | CRUD | itself (lines 17–28) | **exact** |
| 2 | `src/content/schema.ts` *(EDIT)* | model | transform | itself (lines 16–200) | **exact** |
| 3 | `src/persistence/settingsStore.ts` *(NEW)* | service | CRUD | `src/content/repository.ts` (seam pattern) | role-match |
| 4 | `src/persistence/locationStore.ts` *(NEW)* | service | CRUD | `src/content/repository.ts` (seam pattern) | role-match |
| 5 | `src/settings/defaults.ts` *(NEW)* | utility | n/a | `src/app.css` `:root` (lines 6–16) | role-match |
| 6 | `src/settings/tokens.ts` *(NEW)* | utility | n/a | `src/app.css` font stacks (lines 28–33) + schema.ts enums | role-match |
| 7 | `src/settings/applyTheme.ts` *(NEW)* | utility | transform | `src/app.css` `:root` (lines 6–34) — **writes to these** | role-match |
| 8 | `src/settings/SettingsContext.tsx` *(NEW)* | provider | pub-sub | `src/App.tsx` (state+effect shell) — **first context** | partial (novel) |
| 9 | `src/reader/Header.tsx` *(NEW)* | renderer | request-response | `src/a11y/SkipLink.tsx` (minimal semantic component) | role-match |
| 10 | `src/reader/SettingsPanel.tsx` *(NEW)* | renderer | event-driven | `src/a11y/SkipLink.tsx` + RESEARCH Pattern 1 — **first dialog** | partial (novel) |
| 11 | `src/reader/WipeConfirm.tsx` *(NEW)* | renderer | event-driven | `src/reader/SettingsPanel.tsx` (same phase, sibling) | role-match |
| 12 | `src/reader/ProgressHairline.tsx` *(NEW)* | renderer | transform | `src/a11y/SkipLink.tsx` (trivial component) | role-match |
| 13 | `src/reader/SectionAnnouncer.tsx` *(NEW)* | renderer | event-driven | `src/routes/ArticleView.tsx` (effect+cleanup) + RESEARCH Pattern 6 — **first observer** | partial (novel) |
| 14 | `src/reader/ResumeBanner.tsx` *(NEW)* | renderer | request-response | `src/routes/ArticleView.tsx` `.status` region (lines 52–64) | role-match |
| 15 | `src/reader/restoreLocation.ts` *(NEW)* | utility | transform | `src/content/normalizeText.ts` (**MUST reuse its rules**) | exact (substrate) |
| 16 | `src/reader/useScrollSave.ts` *(NEW)* | hook | event-driven | `src/App.tsx` effect pattern (lines 20–37) — **first hook** | partial (novel) |
| 17 | `src/routes/ArticleView.tsx` *(EDIT)* | route | request-response | itself (lines 27–89) | exact |
| 18 | `src/App.tsx` *(EDIT)* | route | event-driven | itself (lines 18–44) | exact |
| 19 | `src/app.css` *(EDIT)* | config | n/a | itself (lines 6–261) | exact |
| 20 | `tests/component/SettingsPanel.test.tsx` *(NEW)* | test | request-response | `tests/component/ArticleView.test.tsx` | exact |
| 21 | `tests/component/SettingsContext.test.tsx` *(NEW)* | test | request-response | `tests/component/ArticleView.test.tsx` | role-match |
| 22 | `tests/unit/restoreLocation.test.ts` *(NEW)* | test | transform | `tests/unit/normalizeText.test.ts` | exact |
| 23 | `tests/unit/settingsSchema.test.ts` *(NEW)* | test | transform | `tests/unit/schema.test.ts` | exact |
| 24 | `tests/unit/locationSchema.test.ts` *(NEW)* | test | transform | `tests/unit/schema.test.ts` | exact |
| 25 | `tests/unit/storageFallback.test.ts` *(NEW)* | test | request-response | `tests/component/ArticleView.test.tsx` (vi.mock + fallback assertion) | role-match |
| 26 | `tests/e2e/panel-keyboard.spec.ts` *(NEW)* | test | request-response | `tests/e2e/open-every-fixture.spec.ts` | role-match |
| 27 | `tests/e2e/persistence.spec.ts` *(NEW)* | test | request-response | `tests/e2e/a11y.spec.ts` + open-every-fixture | role-match |
| 28 | `tests/e2e/section-announce.spec.ts` *(NEW)* | test | event-driven | `tests/e2e/open-every-fixture.spec.ts` | role-match |
| 29 | `tests/e2e/progress.spec.ts` *(NEW)* | test | event-driven | `tests/e2e/open-every-fixture.spec.ts` | role-match |
| 30 | `tests/e2e/reflow.spec.ts` *(NEW)* | test | request-response | `tests/e2e/a11y.spec.ts` | role-match |
| 31 | `tests/e2e/forced-colors.spec.ts` *(NEW)* | test | request-response | `tests/e2e/a11y.spec.ts` | role-match |
| 32 | `tests/e2e/reduced-motion.spec.ts` *(NEW)* | test | request-response | `tests/e2e/a11y.spec.ts` | role-match |
| 33 | `tests/e2e/touch-targets.spec.ts` *(NEW)* | test | request-response | `tests/e2e/open-every-fixture.spec.ts` | role-match |
| 34 | `tests/e2e/a11y.spec.ts` *(EDIT — extend)* | test | request-response | itself | exact |

---

## Pattern Assignments

### Modified Files (Wave 0 — frozen contract extensions)

---

#### 1. `src/persistence/db.ts` *(EDIT — add `version(2)`)*

**Analog:** itself — the shipped `version(1)` declaration.

**CRITICAL RULE (Pitfall 9):** `this.version(1)` is shipped byte-for-byte. Phase 2 **appends** `this.version(2).stores({...})` to the SAME `constructor()`. Dexie ≥3 auto-knows declared versions; re-declaring identical stores is a schema no-op. Do NOT edit lines 17–28.

**Shipped pattern to extend (lines 14–30):**
```ts
export class LemReaderDB extends Dexie {
  constructor() {
    super("lem-reader");
    this.version(1).stores({  // ← NEVER EDIT THIS BLOCK
      articles: "id, revision",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
    });
    // ← PHASE 2 APPENDS: this.version(2).stores({...})
  }
}
export const db = new LemReaderDB();
```

**Phase 2 add (lift from `02-RESEARCH.md` Pattern 3, lines 326–334):**
```ts
this.version(2).stores({
  // Re-declaring reserved slots at v2 anchors STATE-04 versioning and gives a
  // clean migration hook. v1 wrote NO records (static fixtures), so no data
  // migration is needed; identical store definitions are a schema no-op in Dexie ≥3.
  articles: "id, revision",
  settings: "key",
  location: "[articleId+revision]",
});
```
The `db` instance export (line 32) and the `LemReaderDB` class shape stay unchanged. Stores **must** be typed; see `02-RESEARCH.md` for the `interface LemReaderDB { articles: Table<…>; … }` extension (the shipped file currently omits table-type annotations — Phase 2 may add them, LOW risk).

---

#### 2. `src/content/schema.ts` *(EDIT — add settings + location schemas)*

**Analog:** itself — the shipped Zod-at-boundary model.

**Conventions to replicate verbatim** (from the shipped file):
- **Header comment block** explaining security/recursion pitfalls (lines 1–15) — add a section for the new STATE-04 records.
- **`z.enum` / `z.literal` / `z.union` for closed value sets** (see `HeadingBlock.level` lines 57–64).
- **`z.string().regex(/^[a-z0-9-]+$/)`** on ids — reuse the EXACT same regex for `LocationRecordSchema.articleId` (D-06 consistency, lines 187–189).
- **`z.number().int().min(1)`** for monotonic revision (line 188) — reuse for `LocationRecordSchema.revision`.
- **`z.infer<>` exported types** as single source of truth (lines 199–200).

**Shipped enum-literal pattern to mirror (lines 57–64):**
```ts
level: z.union([
  z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6),
]),  // Pitfall 10 — heading-order guard at parse time
```

**Phase 2 add (lift from `02-RESEARCH.md` Pattern 3, lines 337–356):**
```ts
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([z.literal(16), z.literal(18), z.literal(20), z.literal(22), z.literal(24)]),
  measure: z.union([z.literal(52), z.literal(58), z.literal(64), z.literal(72)]),
  spacing: z.enum(["compact", "comfortable", "spacious"]),
  theme: z.enum(["sepia", "light", "dark"]),
});
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;

export const LocationRecordSchema = z.object({
  schemaVersion: z.literal(1),
  articleId: z.string().regex(/^[a-z0-9-]+$/),   // matches ArticleSchema.id (D-06)
  revision: z.number().int().min(1),              // D-06 monotonic
  graphemeOffset: z.number().int().min(0),
  savedAt: z.string().datetime(),
});
export type LocationRecord = z.infer<typeof LocationRecordSchema>;
```
**Note:** no recursion here (unlike `BlockSchema`), so no two-pass getter form (Pitfall 7) is needed. The `schemaVersion: z.literal(1)` field is the STATE-04 migration hook.

---

#### 17. `src/routes/ArticleView.tsx` *(EDIT)*

**Analog:** itself — the shipped reader route.

**Conventions to preserve (lines 27–89):**
- **Cancelled-flag async pattern** (lines 31–48) — the `let cancelled = false; … return () => { cancelled = true; }` guard. Reuse for any new async work (location load/restore).
- **`"loading" | "ready" | "error"` status union** (line 29) + the `.status` region fallback render (lines 50–65).
- **`openArticle(articleId)` repository seam call** (line 35) — DO NOT swap to Dexie (D2-13: reading never depends on Dexie; fixtures stay bundled JSON).
- **`Intl.DateTimeFormat(navigator.language, …)` with try/catch fallback** (lines 16–25) — locale pattern to reuse.
- **Provenance `<header>` + source-URL link** with `rel="noopener noreferrer" target="_blank"` + visually-hidden new-tab announce (lines 72–85).

**Shipped async-effect pattern (lines 31–48):**
```ts
useEffect(() => {
  let cancelled = false;
  setStatus("loading");
  setArticle(null);
  openArticle(articleId)
    .then((a) => {
      if (cancelled) return;
      setArticle(a);
      setStatus(a ? "ready" : "error");
    })
    .catch(() => {
      if (cancelled) return;
      setStatus("error");
    });
  return () => {
    cancelled = true;
  };
}, [articleId]);
```

**Phase 2 mounts here:** after `<ArticleBody article={article} />` (line 86), wire in `<ResumeBanner>`, `<ProgressHairline>` (or mount above `<main>` per UI-SPEC §Layout), `<SectionAnnouncer>`, the restore-on-ready effect, and the `useScrollSave(article)` hook. The settings live-apply happens via the `SettingsContext` provider in `App.tsx` (token write to `:root`), so `ArticleView` itself mostly observes. See UI-SPEC §Component Inventory lines 462–471.

---

#### 18. `src/App.tsx` *(EDIT)*

**Analog:** itself — the shipped router shell.

**Conventions to preserve (lines 6–46):**
- **Hash-based router, no library** (lines 13–16 `parseHash`, lines 19–37 effect) — the `hashchange` listener with the Gap 3 fragment guard (lines 30–34) MUST stay.
- **Fragment-namespace guard** (lines 21–34) — `#fn-N`, `#fn-ref-N`, `#main` must NOT swap the view. Phase 2 adds no new in-page fragments that need this guard, but the guard MUST remain intact.
- **`SkipLink` as first focusable element** (line 40) — UI-SPEC §Component Inventory line 459; stays first.
- **`view.name === "list" ? <FixtureList/> : <ArticleView/>`** swap (line 41).

**Shipped router shell (lines 18–44):**
```ts
export function App() {
  const [view, setView] = useState<View>(() => parseHash());
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      if (hash !== "" && !hash.startsWith("#/")) return;  // Gap 3 guard
      setView(parseHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <>
      <SkipLink />
      {view.name === "list" ? <FixtureList /> : <ArticleView articleId={view.id} />}
    </>
  );
}
```

**Phase 2 wraps the tree** with `<SettingsContext.Provider>` and mounts `<Header>` + `<SettingsPanel>` + `<WipeConfirm>` above the view swap. Settings is a **panel, not a route** (D2-01) — the router stays two-view. Header sits above `<main>` on BOTH views (D2-02).

---

#### 19. `src/app.css` *(EDIT — add theme tokens + chrome rules)*

**Analog:** itself — the shipped authored-CSS layers.

**Conventions to preserve:**
- **`:root` custom properties block** (lines 6–34) — Phase 2's `applyTheme.ts` WRITES to `--font-body`, body `font-size`/`line-height`, and (new) `--measure`. The `:root` block keeps the Sepia defaults as the literal values; Light/Dark arrive via `[data-theme="light"]`/`[data-theme="dark"]` selector overrides (NOT removing the `:root` Sepia values — those ARE Sepia).
- **Defensive gates already global** (lines 43–66): `prefers-reduced-motion` (sets `scroll-behavior: auto !important` — location-restore scroll is calm under reduced motion), `forced-colors` (keeps link underlines), `:focus-visible` (2px outline + 2px offset). Phase 2's new controls inherit these — **do not re-declare**; only ADD new selectors.
- **Spacing tokens** (lines 18–26): `--space-xs…3xl` + `--touch: 44px`. Every new control's hit area uses `min-height: var(--touch)`.
- **`.status` card pattern** (lines 214–228) — reuse for `.resume-banner` and `.storage-banner` (UI-SPEC §Copywriting Contract + §Component Inventory lines 464–465 say "reuses `.status`").
- **`.visually-hidden` helper** (lines 84–92) — reuse for the section-announce live region (UI-SPEC line 463).
- **`max-width: 64ch; margin-inline: auto;`** on `.article-body` (lines 135–138) — Phase 2 binds this to a new `--measure` custom property (`max-width: var(--measure)`), so the stepped measure control rewrites `--measure` on `:root`.
- **`em`-based block rhythm** inside `.article-body` (lines 139–148) — MUST stay so body-size changes preserve calm (UI-SPEC Dimension 4, Pitfall 7).
- **Responsive `@media (min-width: 640px/1024px)` pattern** (lines 252–261) — mirror for panel geometry (UI-SPEC §Layout: panel ~360–420px ≥640px, near-full-width sheet <640px).

**Shipped `:root` to extend (lines 6–34):**
```css
:root {
  /* D-07 warm-paper defaults — these ARE the Sepia theme tokens */
  --surface: #fbf8f3;
  --surface-raised: #f2ede3;
  --ink: #1f1b16;
  --ink-soft: #5c544a;
  --accent: #6b4423;
  --accent-hover: #4e2f18;
  --focus-ring: #6b4423;
  --destructive: #9b2c2c;
  --hairline: #d9d1c2;
  /* … spacing + font stacks … */
}
```

**Phase 2 adds** (exact token values from `02-UI-SPEC.md` §Color lines 226–252):
```css
/* Light + Dark theme overrides — Sepia is the :root default, NOT a [data-theme] block */
[data-theme="light"] {
  --surface: #fcfcfa; --surface-raised: #f4f4f0; --ink: #1a1a1a; --ink-soft: #555555;
  --accent: #6b4423; --accent-hover: #4e2f18; --focus-ring: #6b4423;
  --destructive: #9b2c2c; --hairline: #ddd9d0;
}
[data-theme="dark"] {
  --surface: #1b1814; --surface-raised: #26221c; --ink: #ede6d9; --ink-soft: #b8ae9c;
  --accent: #c49a6c; --accent-hover: #dab489; --focus-ring: #c49a6c;
  --destructive: #e07a7a; --hairline: #3a3328;
}
```
Plus new class hooks from UI-SPEC §Component Inventory lines 451–471: `.app-header`, `.progress-hairline`, `.resume-banner`, `.settings-panel`, `.settings-scrim`, `.storage-banner`. **Hairline MUST have NO transition on its `transform`** (UI-SPEC §Interaction 12, Pitfall anti-pattern #6). `app.css` must bind `.article-body { max-width: var(--measure); }` (default `--measure: 64ch` in `:root`).

---

### New Persistence Files

---

#### 3. `src/persistence/settingsStore.ts` *(NEW)*

**Analog:** `src/content/repository.ts` (the shipped repository seam pattern).

**Conventions to replicate:**
- **Header comment block** documenting the boundary + STATE-05 contract (repository.ts lines 1–5 style).
- **`import type` for type-only imports** (repository.ts line 6) — `verbatimModuleSyntax: true` (tsconfig).
- **Module-level exported functions** as the single-import surface (repository.ts lines 23–25 `listArticles`/`openArticle` wrappers).
- **Try/catch + safeParse on READ** — the shipped codebase validates at the fixture boundary (`ArticleSchema.parse(raw)` in `fixtures/index.ts`); settingsStore uses `.safeParse()` instead because persisted records can be corrupt (STATE-04/05).

**Shipped seam pattern (`src/content/repository.ts` lines 6–25):**
```ts
import type { CanonicalArticle } from "./types";
import { fixtures } from "../fixtures";

export interface ArticleRepository {
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;
}
// Module-level convenience wrappers — single-import surface for routes.
export const listArticles = inMemoryRepository.list;
export const openArticle = inMemoryRepository.open;
```

**Phase 2 lift-target (`02-RESEARCH.md` Code Examples lines 566–589) — the STATE-05-aware version:**
```ts
import { db } from "./db";
import { ReaderSettingsSchema, type ReaderSettings } from "../content/schema";
import { DEFAULT_SETTINGS } from "../settings/defaults";

const KEY = "reader-prefs";
export type SettingsLoadResult =
  | { ok: true; settings: ReaderSettings }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

export async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    const raw = await db.settings.get(KEY);
    if (!raw?.value) return { ok: true, settings: DEFAULT_SETTINGS }; // first run
    const parsed = ReaderSettingsSchema.safeParse(raw.value);
    return parsed.success ? { ok: true, settings: parsed.data } : { ok: false, reason: "corrupt" };
  } catch (e) {
    return { ok: false, reason: isUnupgradeable(e) ? "unupgradeable" : "unavailable" };
  }
}
```
Named-error classifier (`02-RESEARCH.md` Code Examples lines 592–600) lives in this file or a shared `errors.ts`.

---

#### 4. `src/persistence/locationStore.ts` *(NEW)*

**Analog:** `src/persistence/settingsStore.ts` (sibling, same phase) — mirrors its seam/try-catch/safeParse shape.

Keyed by the compound `[articleId+revision]` index already reserved in `db.ts` line 23. `load` returns `LocationRecord | null`; `save` writes `{ "[articleId+revision]": articleId+":"+revision, ...record }` (Dexie compound-key record shape). Same `SettingsLoadResult`-style error classification on read for STATE-05 parity.

---

### New Settings Layer (`src/settings/`)

---

#### 5. `src/settings/defaults.ts` *(NEW)*

**Analog:** `src/app.css` `:root` block (lines 6–16) — the D-07 warm-paper tokens. `defaults.ts` is the **JS mirror** of those CSS defaults (the Reset target — D2-04).

**Phase 2 content (literal):**
```ts
import type { ReaderSettings } from "../content/schema";
export const DEFAULT_SETTINGS: ReaderSettings = {
  schemaVersion: 1,
  font: "serif",        // D-07 warm-paper serif
  size: 18,             // D-07 default body size
  measure: 64,          // D-07 calm measure
  spacing: "comfortable", // D-07 line-height 1.6
  theme: "sepia",       // D-07 warm-paper == D2-09 default theme
};
```
"Reset to defaults" (D2-04) sets the context state to this object and clears persisted overrides.

---

#### 6. `src/settings/tokens.ts` *(NEW)*

**Analog:** `src/app.css` font stacks (lines 28–33) + schema.ts enum patterns.

**Phase 2 content (lift from `02-RESEARCH.md` Pattern 2 lines 294–304 + UI-SPEC §Typography):**
```ts
export const FONT_STACKS = {
  serif: "'Iowan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  dyslexic: "Verdana, Tahoma, 'Segoe UI', Geneva, sans-serif",  // D2-06 Option A — font-load-safe
} as const;

export const SPACING_PRESETS = {  // D2-08 — preset-internal
  compact:     { lineHeight: 1.4, letterSpacing: "0",     wordSpacing: "0" },
  comfortable: { lineHeight: 1.6, letterSpacing: "0",     wordSpacing: "0" },  // D-07 default
  spacious:    { lineHeight: 1.8, letterSpacing: "0.01em", wordSpacing: "0.05em" },
} as const;

export const SIZE_STEPS = [16, 18, 20, 22, 24] as const;     // D2-07
export const MEASURE_STEPS = [52, 58, 64, 72] as const;      // D2-07
```
**Critical:** the `serif` string here MUST byte-match `--font-body` in `app.css` line 29 (single source of truth for the default stack).

---

#### 7. `src/settings/applyTheme.ts` *(NEW)*

**Analog:** `src/app.css` `:root` (lines 6–34) — **this utility WRITES to those exact custom properties at runtime.** The `:root` block is the static default; `applyTheme` is the live-apply mutator (D2-03).

**Phase 2 lift-target (`02-RESEARCH.md` Pattern 2 lines 306–318):**
```ts
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "./tokens";

export function applyTheme(s: ReaderSettings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;                                  // [data-theme] token swap
  root.style.setProperty("--font-body", FONT_STACKS[s.font]);
  root.style.setProperty("font-size", `${s.size}px`);            // body knob; headings are em (UI-SPEC Dim 4)
  const p = SPACING_PRESETS[s.spacing];
  root.style.setProperty("line-height", String(p.lineHeight));
  root.style.setProperty("--letter-spacing", p.letterSpacing);
  root.style.setProperty("--word-spacing", p.wordSpacing);
  root.style.setProperty("--measure", `${s.measure}ch`);         // .article-body max-width
}
```
**Security note (Pitfall 9):** all values are Zod-validated enums/numbers, applied via `style.setProperty` (no selector parsing) and `dataset.theme` (data attr, not HTML). No XSS surface — matches the shipped `react/no-danger` discipline.

---

#### 8. `src/settings/SettingsContext.tsx` *(NEW — first React context in codebase)*

**Analog:** `src/App.tsx` (state + effect shell pattern) — no existing context/provider in the codebase. STACK.md sanctions React context as the state choice (no Redux/Zustand).

**Structural analog (`src/App.tsx` lines 18–44) — useState + useEffect + exported component:**
```ts
export function App() {
  const [view, setView] = useState<View>(() => parseHash());
  useEffect(() => {
    const onHash = () => { … };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return ( … );
}
```

**Phase 2 shape:**
```tsx
// Holds current ReaderSettings (live source of truth), the load result, and a
// debounced save function. On mount: loadSettings() → setSettings or surface
// storage-error state. Every control change: setSettings(s) + applyTheme(s)
// immediately (live preview) + schedule debounced saveSettings(s).
export function SettingsProvider({ children }: { children: React.ReactNode }) { … }
export function useSettings(): { settings: ReaderSettings; update: (patch: Partial<ReaderSettings>) => void; reset: () => void; storageState: "ok" | "unavailable" | "corrupt" | "unupgradeable"; } { … }
```
**Pitfall 5 (write storm):** decouple token application (immediate `applyTheme` every change) from persistence (debounced ~400ms per `02-RESEARCH.md` Open Question #2). **Pitfall 4 (flush):** register `visibilitychange` + `pagehide` listeners in the provider's mount effect to flush the pending debounced write (mirrors `useScrollSave` Pattern 4).

---

### New Reader Components (`src/reader/`)

---

#### 9. `src/reader/Header.tsx` *(NEW)*

**Analog:** `src/a11y/SkipLink.tsx` — minimal semantic component, single responsibility, verbatim UI-SPEC copy.

**Shipped minimal-component pattern (`src/a11y/SkipLink.tsx` lines 5–11):**
```tsx
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to article
    </a>
  );
}
```
Header comment cites UI-SPEC section; class hook matches CSS; copy is verbatim microcopy.

**Phase 2 content (UI-SPEC §Component Inventory line 460, §Copywriting lines 306–307):**
```tsx
export function Header({ onOpenSettings, settingsOpen }: { onOpenSettings: () => void; settingsOpen: boolean }) {
  return (
    <header className="app-header">
      <span>Lem Reader</span>  {/* wordmark — text, not a link (UI-SPEC line 306) */}
      <button type="button" onClick={onOpenSettings} aria-expanded={settingsOpen}
              aria-label="Reading settings" aria-haspopup="dialog" className="gear-button">
        {/* inline SVG gear — aria-label carries the name */}
      </button>
    </header>
  );
}
```
**Quiet-chrome rule (D2-02, READ-04):** no accent fill, no toolbar styling, no shadow. Gear is `--ink-soft` when closed, `--accent` only when open (UI-SPEC §Color accent-reserved list line 270). ~48px tall, 1px `--hairline` bottom rule.

---

#### 10. `src/reader/SettingsPanel.tsx` *(NEW — first `<dialog>` in codebase)*

**Analogs:** `src/a11y/SkipLink.tsx` (semantic-component + aria patterns) + `02-RESEARCH.md` Pattern 1 (the `<dialog>` mechanism — no in-repo dialog exists).

**CRITICAL (Pitfall 1, A11Y-02):** `showModal()` does NOT auto-restore focus to the trigger. Capture `document.activeElement` on open; `.focus()` it in the dialog `close` handler. **Verify in Playwright, NOT jsdom** (Pitfall 2 — jsdom implements the `HTMLDialogElement` API but not the inert/top-layer/focus behavior).

**Phase 2 lift-target (`02-RESEARCH.md` Pattern 1 lines 248–285):**
```tsx
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);  // the gear button
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement;  // capture gear
      dlg.showModal();  // browser: focus→first focusable, trap, inert backdrop, Esc closes
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onClose = () => { onClose(); triggerRef.current?.focus(); };  // A11Y-02 restore
    dlg.addEventListener("close", onClose);
    return () => dlg.removeEventListener("close", onClose);
  }, [onClose]);
  return (
    <dialog ref={ref} className="settings-panel" aria-labelledby="settings-title">
      <h2 id="settings-title">Reading settings</h2>
      {/* fieldsets: Typeface / Size / Reading width / Spacing / Theme + Reset + close (×) */}
    </dialog>
  );
}
```
**Form controls (UI-SPEC §Interaction 9):** Typeface/Spacing/Theme = `<fieldset><legend>` + `<input type="radio">`; Size/Reading-width = `<input type="range">` with visible readout (RESEARCH Open Question #3 recommendation). Each control calls `update({ [field]: value })` from `useSettings()` — **live-apply happens via the context's `applyTheme` effect, not in this component** (D2-03). Reset button restores `DEFAULT_SETTINGS` (D2-04). Copy is verbatim UI-SPEC §Copywriting lines 308–317.

---

#### 11. `src/reader/WipeConfirm.tsx` *(NEW)*

**Analog:** `src/reader/SettingsPanel.tsx` (sibling, same phase) — identical `<dialog>` + focus-restore mechanism, but `role="alertdialog"`.

UI-SPEC §Interaction 13 + §Component Inventory line 468: title + body + Reset (destructive) + Cancel. Copy verbatim lines 328–331. **D2-13 / Pitfall 8:** `db.delete()` runs ONLY inside the destructive button's handler — never in a catch block (no silent wipe). Same `triggerRef.current?.focus()` restore pattern.

---

#### 12. `src/reader/ProgressHairline.tsx` *(NEW)*

**Analog:** `src/a11y/SkipLink.tsx` (trivial component) + `src/app.css` `.status`/`.visually-hidden` helpers.

**Phase 2 content (UI-SPEC §Interaction 12, §Component Inventory line 462):**
```tsx
export function ProgressHairline({ progress }: { progress: number }) {
  // aria-hidden — progress is conveyed to AT via SectionAnnouncer's live region
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div className="progress-hairline-fill"
           style={{ transform: `scaleX(${progress})`, transformOrigin: "inline-start" }} />
    </div>
  );
}
```
**CSS rule (in `app.css`): NO transition on the transform** — the global reduced-motion gate is trivially satisfied and the hairline never animates (UI-SPEC §Interaction 12, RESEARCH anti-pattern #6). Track = `--ink-soft` at ~20% alpha; fill = `--accent` (UI-SPEC §Color accent-reserved line 269). Mount only on ArticleView (hidden on FixtureList — UI-SPEC §Layout line 491).

---

#### 13. `src/reader/SectionAnnouncer.tsx` *(NEW — first `IntersectionObserver` in codebase)*

**Analogs:** `src/routes/ArticleView.tsx` (useEffect + cleanup + DOM query pattern, lines 31–48) + `src/routes/FixtureList.tsx` `.status` region (`role="status"` `aria-live="polite"`, line 36).

**Shipped status-region pattern (`src/routes/FixtureList.tsx` line 36):**
```tsx
<div className="status" role="status" aria-live="polite" aria-atomic="true">
```

**Shipped effect+cleanup pattern (`src/routes/ArticleView.tsx` lines 31–48):** `useEffect(() => { … return () => { cancelled = true; }; }, [articleId]);`

**Phase 2 lift-target (`02-RESEARCH.md` Pattern 6 lines 446–464):**
```tsx
useEffect(() => {
  const headings = Array.from(articleEl!.querySelectorAll("h2, h3, h4"));
  const obs = new IntersectionObserver(
    (entries) => {
      // rootMargin negative-top places a sentinel line UNDER the 48px header
      const passed = headings.filter((h) => h.getBoundingClientRect().top < HEADER_PX + 8).pop();
      if (passed && passed.textContent !== currentRef.current) {
        currentRef.current = passed.textContent;
        debouncedAnnounce(`Section: ${passed.textContent}.`);
      }
    },
    { rootMargin: `-${HEADER_PX}px 0px -60% 0px`, threshold: [0] },
  );
  headings.forEach((h) => obs.observe(h));
  return () => obs.disconnect();
}, [articleEl]);
```
**Pitfall 6:** debounce the announce (~400ms) + only announce when the section text actually changes (avoid flooding on fast scroll — A11Y-08). Live region uses `.visually-hidden` (app.css lines 84–92). Copy verbatim: `Section: {heading text}.` (UI-SPEC line 324).

---

#### 14. `src/reader/ResumeBanner.tsx` *(NEW)*

**Analogs:** `src/routes/ArticleView.tsx` `.status` region (lines 52–64) for the structure + `src/a11y/SkipLink.tsx` for the minimal-component + aria discipline.

**Shipped status region (`src/routes/ArticleView.tsx` lines 52–64):**
```tsx
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "loading" ? <p>Opening article…</p> : ( … )}
</div>
```

**Phase 2 content (UI-SPEC §Interaction 10, §Copywriting lines 318–323):**
```tsx
export function ResumeBanner({ onResume, onDismiss }: { onResume: () => void; onDismiss: () => void }) {
  return (
    <div className="resume-banner" role="status" aria-live="polite">
      <h2>You left off here</h2>
      <p>Resume reading where you stopped, or start from the top.</p>
      <button type="button" onClick={onResume}>Resume reading</button>
      <button type="button" onClick={onDismiss /* scroll to top */}>Start from top</button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}
```
**Lifecycle (UI-SPEC §Interaction 10):** auto-dismisses on first scroll/pointer activity OR explicit action. Non-modal (polite tap on the shoulder). Reuses `.status` styling (`--surface-raised`, `--hairline` border, 4px radius, `padding: lg`). Polite announce on open: *"Returned to where you left off."* (UI-SPEC line 323).

---

#### 15. `src/reader/restoreLocation.ts` *(NEW — closest coupling to Phase 1 substrate)*

**Analog:** `src/content/normalizeText.ts` — **this module MUST reuse `normalizeText`'s per-block rules EXACTLY** so saved grapheme offsets stay consistent with the D-05 contract. Re-anchoring is best-effort block-level (not exact-character; RESEARCH Pattern 5 + note).

**Shipped substrate to reuse (`src/content/normalizeText.ts`):**
- `BLOCK_SEPARATOR = "\n"` (line 13)
- `normalizeRunText(text)` (lines 24–26) — collapse ASCII whitespace, trim
- `graphemeClusters(text, locale)` (lines 91–94) — `Intl.Segmenter` with `article.lang`
- `blockText(block)` (lines 41–63) — the per-kind text contribution rule

**Phase 2 lift-target (`02-RESEARCH.md` Pattern 5 lines 416–435):**
```ts
import { graphemeClusters, BLOCK_SEPARATOR } from "../content/normalizeText";
// reuse the SAME per-block normalization (collapse ASCII ws, code verbatim, footnote markers)
export function findScrollTarget(
  article: CanonicalArticle, blocks: HTMLElement[], offset: number,
): HTMLElement | null {
  let consumed = 0;
  let last: HTMLElement | null = null;
  for (const el of blocks) {
    last = el;
    const text = normalizeElText(el);  // mirrors normalizeText block rules (reuse, don't reimpl)
    const len = graphemeClusters(text, article.lang).length;
    if (offset <= consumed + len) return el;
    consumed += len + 1;  // +BLOCK_SEPARATOR
  }
  return last;  // clamp to end if offset overshoots (corpus changed)
}
```
**Note (RESEARCH Pattern 5):** `normalizeElText` MUST mirror `normalizeText`'s block rules exactly (collapse ASCII whitespace only; code-block source verbatim; footnote markers as visible text). **Reuse the same helpers, not a parallel implementation.** `scrollIntoView({ block: "start" })` is calm under reduced-motion because the global gate sets `scroll-behavior: auto` (app.css line 50).

---

#### 16. `src/reader/useScrollSave.ts` *(NEW — first custom hook in codebase)*

**Analog:** `src/App.tsx` effect + listener + cleanup pattern (lines 20–37).

**Shipped listener+cleanup pattern (`src/App.tsx` lines 20–37):**
```ts
useEffect(() => {
  const onHash = () => { … };
  window.addEventListener("hashchange", onHash);
  return () => window.removeEventListener("hashchange", onHash);
}, []);
```

**Phase 2 lift-target (`02-RESEARCH.md` Pattern 4 lines 378–404):**
```ts
const pending = useRef<LocationRecord | null>(null);
const timer = useRef<number>();
function schedule(loc: LocationRecord) {
  pending.current = loc;
  clearTimeout(timer.current);
  timer.current = window.setTimeout(flush, 1200);  // debounce window (RESEARCH Open Q #2)
}
async function flush() {
  const loc = pending.current;
  if (!loc) return;
  pending.current = null;
  try { await locationStore.save(loc); }
  catch (e) { notifyStorageFailure(e); }  // STATE-05 — never throw to reader
}
useEffect(() => {
  const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", flush);  // covers navigation/closure
  return () => {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", flush);
  };
}, []);
```
**Pitfall 4:** BOTH `visibilitychange` AND `pagehide` (primary + safety net). NEVER `beforeunload`/`unload` (breaks bfcache, unreliable on mobile). Debounce ~1200ms (RESEARCH Open Question #2 recommendation).

---

### New Test Files

> **Environment discipline (Pitfall 2, STACK.md):** jsdom (vitest) is NOT authoritative for `<dialog>` focus-trap/inert, `IntersectionObserver`, scroll, or zoom. Those run in **Playwright across Chromium/Firefox/WebKit**. In vitest, assert only application-level concerns (open/close state, aria attrs, control presence, the focus-restore *call site*, pure domain logic). The trap/scroll/inert themselves are e2e assertions.

---

#### 20–21. `tests/component/SettingsPanel.test.tsx` + `tests/component/SettingsContext.test.tsx`

**Analog (exact):** `tests/component/ArticleView.test.tsx` — the shipped component-test pattern.

**Shipped component-test conventions (`tests/component/ArticleView.test.tsx`):**
- **`vi.mock` hoisting + factory** (lines 11–14) — mock the store module; drive via `vi.mocked(...)`.
- **`vi.mocked(openArticle)` + `mockReset` in `beforeEach`** (lines 20, 43–45).
- **Stub article builder** (lines 22–41) — type-satisfies `CanonicalArticle`.
- **RTL queries by role/label/visible text only** (lines 51, 57, 69, 92).
- **Loading + error + null paths** (lines 79–103).

```tsx
vi.mock("../../src/persistence/settingsStore", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));
import { SettingsPanel } from "../../src/reader/SettingsPanel";
import { loadSettings } from "../../src/persistence/settingsStore";
const loadMock = vi.mocked(loadSettings);
```
**For `SettingsPanel.test.tsx`:** assert open/close state flips, `aria-labelledby="settings-title"`, fieldset/legend/control presence, the focus-restore `.focus()` call site (NOT the trap — that's e2e). **For `SettingsContext.test.tsx`:** assert `applyTheme` writes `data-theme` + `--font-body` on `<html>` (jsdom-safe — these are DOM writes, not layout).

---

#### 22. `tests/unit/restoreLocation.test.ts`

**Analog (exact):** `tests/unit/normalizeText.test.ts` — pure domain-logic test over the D-05 substrate.

**Shipped unit-test conventions (`tests/unit/normalizeText.test.ts`):**
- **`parseArticle(raw)` helper** via `ArticleSchema.parse` (lines 16–18).
- **`baseArticle` shared fixture** (lines 20–30).
- **`it.each` for tabular accept/reject** (see schema.test.ts lines 47–58).
- **Offset assertions** (lines 145–148: `expect(bodyOffset).toBeGreaterThan(refOffset)`).

**For restoreLocation:** build a fixture, render its blocks (or pass `HTMLElement[]` stubs with `.textContent`), assert `findScrollTarget(article, blocks, offset)` returns the correct block. Cover: offset 0 → first block; offset mid-paragraph → that block; offset overshoot → last block (clamp); empty blocks → null. **Pure logic — jsdom-safe.**

---

#### 23–24. `tests/unit/settingsSchema.test.ts` + `tests/unit/locationSchema.test.ts`

**Analog (exact):** `tests/unit/schema.test.ts` — the Zod boundary-validation pattern.

**Shipped schema-test conventions (`tests/unit/schema.test.ts`):**
- **`validArticle(overrides)` builder returning `unknown`** so Zod is exercised at runtime (lines 15–30).
- **`it.each([...])` for reject cases** (lines 47–58, 70–73, 98–105).
- **`expect(() => Schema.parse(bad)).toThrow()`** for rejections (line 56).
- **`expect(Schema.parse(good).field).toBe(...)`** for acceptances (lines 36–40).

**For settingsSchema:** accept the 3×5×4×3×3 matrix; reject bad enum values, non-literal `schemaVersion`, out-of-step sizes/measures. **For locationSchema:** accept valid `[articleId+revision]`; reject bad `articleId` regex (reuse the D-06 cases from schema.test.ts lines 48–50), negative `revision`, negative `graphemeOffset`, malformed `savedAt` datetime.

---

#### 25. `tests/unit/storageFallback.test.ts`

**Analog:** `tests/component/ArticleView.test.tsx` (vi.mock + rejected-promise → fallback assertion) lines 85–103.

**For storageFallback:** mock `loadSettings` to reject with named errors (`{ name: "UpgradeError" }`, `{ name: "QuotaExceeded" }`); assert `SettingsLoadResult.reason` classification (`unupgradeable` / `unavailable` / `corrupt`); assert `safeParse` failure → `corrupt`. Mock Dexie at the `db` import boundary.

---

#### 26–33. Playwright e2e specs

**Analogs:** `tests/e2e/open-every-fixture.spec.ts` (page.goto, console-error capture, role queries, image stubbing) + `tests/e2e/a11y.spec.ts` (AxeBuilder, WCAG_TAGS, 3-engine matrix, `seriousViolations` filter).

**Shipped e2e conventions:**
- **`const BASE = "http://localhost:5173"`** (both files).
- **Image stub `beforeEach`** with `page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, …)` (open-every-fixture lines 22–26).
- **Console-error capture** with network-noise filter (open-every-fixture lines 31–42).
- **`for (const article of fixtures) { test.describe(...) }`** per-fixture matrix (open-every-fixture lines 28–62, a11y lines 46–62).
- **AxeBuilder `.withTags([...WCAG_TAGS]).analyze()`** + `seriousViolations` filter (a11y lines 36–43).
- **Role-based queries:** `page.getByRole("heading", { level: 1, name: … })`, `page.getByRole("link", { name: /…/ })` (open-every-fixture lines 47–57).

**Per spec:**
- **`panel-keyboard.spec.ts`** (A11Y-01/02): focus gear → open → Tab cycles within dialog → Esc closes → assert `document.activeElement === gear`. The KEY focus-restore test (Pitfall 1) — jsdom cannot replicate this.
- **`persistence.spec.ts`** (STATE-01/02): change settings → reload → assert persisted; scroll → `visibilitychange`-hidden → reload → assert location saved.
- **`section-announce.spec.ts`** + **`progress.spec.ts`** (A11Y-08/READ-05): scroll past headings → assert live-region text updates (debounced); assert hairline `scaleX` ratio; assert no page numbers in DOM.
- **`reflow.spec.ts`** (A11Y-04): `page.setViewportSize({ width: 320, height: … })` + 200% zoom; assert no horizontal scroll, all controls visible.
- **`forced-colors.spec.ts`** (A11Y-05): `page.emulateMedia({ forcedColors: "active" })`; assert link underlines + focus outlines + gear open/closed distinction survive.
- **`reduced-motion.spec.ts`** (A11Y-06): `page.emulateMedia({ reducedMotion: "reduce" })`; assert panel has no slide animation, hairline has no transition, restore scroll is instant.
- **`touch-targets.spec.ts`** (A11Y-07): query every new control's bounding box; assert `≥ 44×44px`.
- **`a11y.spec.ts` (EDIT — extend):** add axe runs on the settings-panel-open state, resume-banner state, and storage-failure-banner state (single-content-tree A11Y-03 check: article is `inert` not duplicated).

---

## Shared Patterns

These cross-cutting conventions apply to EVERY Phase 2 file. The planner should inline-cite them rather than re-state per file.

### Authored CSS + CSS Custom Properties (STACK.md "What NOT to Use")
**Source:** `src/app.css` lines 6–34, 43–66
**Apply to:** all new components + `app.css` edit
- NO Tailwind, NO component suite, NO shadcn. Typography/theme drive through `:root` custom properties + `[data-theme]` selector overrides + element selectors.
- New controls reuse the shipped tokens (`--surface`, `--ink`, `--accent`, `--space-*`, `--touch`, `--font-body`, `--font-ui`). Do NOT introduce new tokens unless UI-SPEC §Color/§Spacing defines them.
- Every interactive control: `min-height: var(--touch)` (44px).

### Defensive Global Gates (inherited — do NOT re-declare)
**Source:** `src/app.css` lines 43–66
**Apply to:** all new components + animations
- `@media (prefers-reduced-motion: reduce)` already sets `transition/animation: none !important` + `scroll-behavior: auto !important`. Location-restore scroll + panel slide + hairline are calm under reduced motion FOR FREE — do not re-add motion guards.
- `@media (forced-colors: active)` keeps link underlines. New controls MUST convey state by more than color (UI-SPEC §Color contrast contract line 290).
- `:focus-visible` baseline (2px `--focus-ring` outline + 2px offset) applies to every focusable element automatically.

### Zod-at-Boundary Validation (STATE-04)
**Source:** `src/content/schema.ts` lines 16–200 + `tests/unit/schema.test.ts`
**Apply to:** every persisted settings/location record
- Every record validated on READ (`.safeParse`) AND write. Enums/literals only (no free strings) — Pitfall 9 (CSS injection) defense.
- Types inferred from schemas (`z.infer<typeof ...>`); never hand-write a parallel type.
- `schemaVersion: z.literal(1)` field is the migration hook.

### Repository / Store Seam Pattern (D-08)
**Source:** `src/content/repository.ts` lines 1–25
**Apply to:** `settingsStore.ts`, `locationStore.ts`
- Header comment documenting the boundary. `import type` for types. Module-level exported functions as single-import surface. **Article reads stay in-memory** (D2-13 — Dexie is user-state only).

### Status Region Pattern (A11Y-08)
**Source:** `src/routes/ArticleView.tsx` lines 52–64, `src/routes/FixtureList.tsx` line 36, `src/app.css` lines 214–228
**Apply to:** ResumeBanner, SectionAnnouncer live region, storage-failure banner
- `<div role="status" aria-live="polite" aria-atomic="true" className="status">`. `.status` card styling (`--surface-raised`, `--hairline` border, 4px radius). Polite (never assertive) — calm.

### STATE-05 Error Handling (graceful, non-blocking)
**Source:** `02-RESEARCH.md` Code Examples lines 566–600
**Apply to:** all persistence calls
- Try/catch around every Dexie call. Named-error classification (`UpgradeError`/`VersionError`/`QuotaExceeded`). Fall back to in-memory defaults. Surface `.status` banner. **NEVER `db.delete()` outside the WipeConfirm destructive handler** (Pitfall 8). Article reading never depends on Dexie.

### Session-End Flush (D2-11, Pitfall 4)
**Source:** `02-RESEARCH.md` Pattern 4 + `src/App.tsx` listener+cleanup pattern
**Apply to:** `useScrollSave.ts` + `SettingsContext.tsx`
- BOTH `visibilitychange` (treat `hidden` as primary flush) AND `pagehide` (navigation/closure safety net). NEVER `beforeunload`/`unload` (breaks bfcache).

### Async Cancelled-Flag Pattern
**Source:** `src/routes/ArticleView.tsx` lines 31–48
**Apply to:** any new async effect (location load, restore)
- `let cancelled = false; … if (cancelled) return; … return () => { cancelled = true; }`.

### TypeScript Strictness (carried from Phase 1)
**Source:** `tsconfig.json` (Phase 1)
- `"strict": true`, `"noUncheckedIndexedAccess": true`, `"verbatimModuleSyntax": true` (enforces `import type`). Inferred types from Zod schemas.

### Single Content Tree (A11Y-03)
**Source:** `src/content/render/BlockRenderer.tsx` (single-mount design)
**Apply to:** SettingsPanel open/close
- Article rendered EXACTLY once by `<ArticleBody>`. When panel opens, article stays mounted; `<dialog>`/`showModal()` makes the rest `inert` (browser-provided). NEVER re-render or duplicate the article.

### Copywriting Microcopy (UI-SPEC §Copywriting)
**Apply to:** every user-facing string
- Verbatim from `02-UI-SPEC.md` §Copywriting lines 304–332. Never leak jargon ("fixture", "Dexie", "IndexedDB", "Zod", "schema", "normalized", "selector"). Dates via `Intl.DateTimeFormat(navigator.language, …)` with try/catch fallback (ArticleView lines 16–25).

---

## No Analog Found

| File(s) | Role | Reason | Fallback Authority |
|---------|------|--------|--------------------|
| `src/reader/SettingsPanel.tsx`, `src/reader/WipeConfirm.tsx` | renderer | First `<dialog>`/`showModal()` in codebase. SkipLink is structural but not a dialog. | `02-RESEARCH.md` Pattern 1 (lines 248–285) — full `<dialog>` + focus-restore excerpt. MDN `<dialog>` (cited). Verify focus-trap/restore/inert in Playwright (Pitfall 1/2). |
| `src/settings/SettingsContext.tsx` | provider | First React context in codebase. App.tsx is state+effect but not a provider. | `02-RESEARCH.md` Pattern 2 (lines 287–318) + STACK.md (sanctions React context). Shape: `SettingsProvider` + `useSettings()` hook. |
| `src/reader/SectionAnnouncer.tsx` | renderer | First `IntersectionObserver` in codebase. | `02-RESEARCH.md` Pattern 6 (lines 446–464) — full observer + rootMargin sentinel excerpt. MDN IntersectionObserver (cited). |
| `src/reader/useScrollSave.ts` | hook | First custom hook in codebase. App.tsx effect is structural analog only. | `02-RESEARCH.md` Pattern 4 (lines 378–404) — full debounce + dual-flush excerpt. |

---

## Metadata

**Analog search scope:** `src/**/*.{ts,tsx,css}` (14 files) + `tests/**/*.{ts,tsx}` (12 files) + `.planning/phases/01-canonical-article-foundation/01-PATTERNS.md` (precedent). All shipped Phase 1 source read directly.

**Files scanned:** 26 source/test files; every file that Phase 2 extends or parallels was read in full (all ≤200 lines; no large-file strategy needed).

**Pattern extraction date:** 2026-07-30

**Verification of source authority:**
- Shipped Phase 1 source (`src/`, `tests/`) — HIGH confidence, read directly with line numbers.
- `02-RESEARCH.md` §Architecture Patterns + §Code Examples — HIGH confidence (approved research, MDN/Dexie-cited).
- `02-UI-SPEC.md` — HIGH confidence (status `approved`; defines exact tokens, copy, geometry).
- `02-CONTEXT.md` decisions D2-01…D2-13 — HIGH confidence (locked).

**Downstream consumer:** `gsd-planner` — use the File Classification table to partition plans by role/flow; use the Per-File Pattern Assignments as `<read_first>` + `<action>` lift-targets (cite real source line numbers where an analog exists, RESEARCH.md Pattern numbers for the 4 novel mechanisms); apply Shared Patterns to every plan's action blocks.
