// src/routes/prototype/DesignSystemPrototype.tsx
// PROTOTYPE (issue #69) — throwaway design-system specimen sheet, dev-only.
//
// Question it answers: which shared visual grammar should Lem Reader lock —
// radius scale, elevation/shadow policy, button vocabulary, dialog anatomy,
// motion timings? Three radically different vocabularies render the same
// specimen sections (foundations, buttons, field, the rebuilt Edit-metadata
// dialog exemplar) so they can be compared against the real themes.
//
// Reachable only via the DEV-gated `#/prototype/design-system` route in
// App.parseHash. Throwaway from day one: never merge to main — the locked
// vocabulary graduates into app.css through the build ticket, and this file
// is captured on a prototype branch instead.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./design-system-prototype.css";

type VariantKey = "a" | "b" | "c";

interface VariantSpec {
  key: VariantKey;
  name: string;
  pov: string;
}

const VARIANTS: ReadonlyArray<VariantSpec> = [
  {
    key: "a",
    name: "Quiet Press",
    pov: "Booklike minimal — small radii, zero shadows, a filled accent primary, dialogs structured by hairline rules like book furniture. The closest evolution of today's surfaces.",
  },
  {
    key: "b",
    name: "Soft Paper",
    pov: "Tactile calm — generous radii, ONE earned elevation level for top-layer surfaces only, an outlined accent primary that fills softly on hover, spacing-only dialog rhythm.",
  },
  {
    key: "c",
    name: "Ink & Rule",
    pov: "Print-like precision — near-square corners, rules carry structure, ink (not accent) carries the primary action, dense UI type, dialog actions left-aligned.",
  },
];

const ROUTE_BASE = "#/prototype/design-system";

function parseVariantFromHash(): VariantKey {
  const m = /#\/prototype\/design-system\?variant=([abc])/.exec(window.location.hash);
  return (m?.[1] as VariantKey | undefined) ?? "a";
}

/** Wrap-around lookup over the ordered variant list. */
function variantAt(i: number): VariantSpec {
  const v = VARIANTS[((i % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  return v as VariantSpec;
}

/* ── Shared icon anatomy proposal: 24 viewBox, 1.5 stroke, currentColor ──── */

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function EditGlyph() {
  return (
    <IconFrame>
      <path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" />
    </IconFrame>
  );
}
function TrashGlyph() {
  return (
    <IconFrame>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12" />
    </IconFrame>
  );
}
function CheckGlyph() {
  return (
    <IconFrame>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </IconFrame>
  );
}
function GearGlyph() {
  return (
    <IconFrame>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" />
    </IconFrame>
  );
}
function SpinnerGlyph() {
  return (
    <svg
      className="dsproto-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function FoundationsSection() {
  return (
    <section className="dsproto-section" aria-labelledby="ds-foundations">
      <h2 id="ds-foundations">Foundations</h2>
      <p className="dsproto-notep">
        Radius scale, elevation policy, motion timing, and the semantic z-layer
        ladder (identical across variants — it names what already exists).
      </p>
      <div className="dsproto-foundations">
        <div className="dsproto-fgroup">
          <h3>Radius</h3>
          <div className="dsproto-radius-row">
            <div className="dsproto-radius-chip sm">sm</div>
            <div className="dsproto-radius-chip md">md</div>
            <div className="dsproto-radius-chip lg">lg</div>
          </div>
          <p className="dsproto-hint" style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
            sm = controls · md = cards/pickers · lg = dialogs
          </p>
        </div>
        <div className="dsproto-fgroup">
          <h3>Elevation</h3>
          <div className="dsproto-elevation-row">
            <div className="dsproto-swatch-card none">content — none</div>
            <div className="dsproto-swatch-card raised">top layer</div>
          </div>
          <p className="dsproto-hint" style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
            Shadow is earned by top-layer surfaces only.
          </p>
        </div>
        <div className="dsproto-fgroup">
          <h3>Motion</h3>
          <button type="button" className="dsproto-motion-chip">
            Hover / press me
          </button>
          <p className="dsproto-hint" style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
            State-only transitions; reduced-motion kills all of it.
          </p>
        </div>
        <div className="dsproto-fgroup">
          <h3>Z layers (proposal)</h3>
          <ul className="dsproto-zladder">
            <li>
              <span>content</span>
              <span>--z-content: 1</span>
            </li>
            <li>
              <span>row action cluster</span>
              <span>--z-row-actions: 2</span>
            </li>
            <li>
              <span>reading chrome</span>
              <span>--z-chrome: 5</span>
            </li>
            <li>
              <span>popover</span>
              <span>--z-popover: 8</span>
            </li>
            <li>
              <span>app header</span>
              <span>--z-header: 10</span>
            </li>
            <li>
              <span>dialogs</span>
              <span>top layer (native)</span>
            </li>
            <li>
              <span>skip link</span>
              <span>--z-skip: 100</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ButtonRow({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dsproto-btnrow">
      <span className="dsproto-rowlabel">{label}</span>
      {children}
      <span className="dsproto-rownote">{note}</span>
    </div>
  );
}

function ButtonsSection() {
  return (
    <section className="dsproto-section" aria-labelledby="ds-buttons">
      <h2 id="ds-buttons">Button vocabulary</h2>
      <p className="dsproto-notep">
        One vocabulary, four kinds × states. Hover the live cells for
        rest→hover; the Disabled column shows the muted treatment; Loading
        keeps its label and width (the spinner never replaces the text).
      </p>
      <div className="dsproto-btngrid">
        <ButtonRow label="Primary" note="one per surface — the committing action">
          <button type="button" className="dsproto-btn primary">
            Save
          </button>
          <button type="button" className="dsproto-btn primary" disabled>
            Save
          </button>
          <button type="button" className="dsproto-btn primary">
            <SpinnerGlyph />
            Saving…
          </button>
        </ButtonRow>
        <ButtonRow label="Quiet" note="secondary + cancel actions">
          <button type="button" className="dsproto-btn quiet">
            Cancel
          </button>
          <button type="button" className="dsproto-btn quiet" disabled>
            Cancel
          </button>
          <button type="button" className="dsproto-btn quiet">
            Reset title
          </button>
        </ButtonRow>
        <ButtonRow label="Icon" note="aria-label required — edit / trash / gear">
          <button type="button" className="dsproto-btn icon" aria-label="Edit metadata">
            <EditGlyph />
          </button>
          <button type="button" className="dsproto-btn icon" aria-label="Edit metadata" disabled>
            <EditGlyph />
          </button>
          <button type="button" className="dsproto-btn icon" aria-label="Remove">
            <TrashGlyph />
          </button>
        </ButtonRow>
        <ButtonRow label="Destructive" note="reserved — removal confirms first">
          <button type="button" className="dsproto-btn danger">
            Remove
          </button>
          <button type="button" className="dsproto-btn danger" disabled>
            Remove
          </button>
          <button type="button" className="dsproto-btn danger">
            <CheckGlyph />
          </button>
        </ButtonRow>
      </div>
    </section>
  );
}

function FieldSection() {
  return (
    <section className="dsproto-section" aria-labelledby="ds-field">
      <h2 id="ds-field">Field anatomy</h2>
      <p className="dsproto-notep">
        Label, input, quiet hint — the same pieces every dialog composes. Tab
        in to see the shared focus ring (unchanged across variants).
      </p>
      <div className="dsproto-field">
        <label htmlFor="ds-field-title">Title</label>
        <input
          id="ds-field-title"
          type="text"
          autoComplete="off"
          placeholder="The canonical title"
        />
        <p className="dsproto-hint">Placeholder shows the canonical value; overrides replace it.</p>
      </div>
    </section>
  );
}

/* The rebuilt Edit-metadata dialog — same fields and validity copy as the
 * shipped worst-offender, dressed in the variant's dialog anatomy. Static
 * fields; nothing persists. */
function ExemplarDialog({
  variant,
  open,
  onClose,
}: {
  variant: VariantKey;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal();
      const initial =
        dlg.querySelector<HTMLElement>("[data-initial-focus]") ?? dlg;
      initial.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, variant]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => triggerRef.current?.focus();
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const handleScrim = (e: MouseEvent) => {
      if (e.target === dlg) onClose();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleCancel);
    dlg.addEventListener("click", handleScrim);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleCancel);
      dlg.removeEventListener("click", handleScrim);
    };
  }, [onClose]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      className="dsproto-exemplar"
      aria-labelledby="ds-exemplar-heading"
    >
      <div className="dsproto-exemplar-head">
        <h2 id="ds-exemplar-heading">Edit metadata</h2>
      </div>
      <form className="dsproto-exemplar-form" onSubmit={handleSubmit}>
        <div className="dsproto-field">
          <label htmlFor="ds-ex-title">Title</label>
          <input
            id="ds-ex-title"
            type="text"
            autoComplete="off"
            placeholder="The looting of science fiction"
          />
          <button type="button" className="dsproto-btn quiet" style={{ minHeight: 36 }}>
            Reset title
          </button>
        </div>
        <div className="dsproto-field">
          <label htmlFor="ds-ex-source">Source URL</label>
          <input
            id="ds-ex-source"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/original"
          />
          <p className="dsproto-hint">
            Enter a full http(s) link, or choose Reset source to keep the original.
          </p>
        </div>
        <div className="dsproto-exemplar-actions">
          <button type="button" className="dsproto-btn quiet" onClick={onClose} data-initial-focus>
            Cancel
          </button>
          <button type="submit" className="dsproto-btn primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DialogSection({ variant }: { variant: VariantKey }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="dsproto-section" aria-labelledby="ds-dialog">
      <h2 id="ds-dialog">Dialog exemplar</h2>
      <p className="dsproto-notep">
        The Edit-metadata dialog — today's worst offender — rebuilt with this
        variant's anatomy: same fields, same calm copy, shared button
        vocabulary, Esc and backdrop both close, focus returns to the opener.
      </p>
      <button type="button" className="dsproto-btn primary" onClick={() => setOpen(true)}>
        Open Edit metadata
      </button>
      {open && <ExemplarDialog variant={variant} open={open} onClose={() => setOpen(false)} />}
    </section>
  );
}

function IconsSection() {
  return (
    <section className="dsproto-section" aria-labelledby="ds-icons">
      <h2 id="ds-icons">Shared icon anatomy (proposal)</h2>
      <p className="dsproto-notep">
        One 24-grid, 1.5px stroke, round caps and joins, currentColor — the
        basis for a single icons module replacing the inline copies.
      </p>
      <div className="dsproto-iconrow">
        <figure>
          <EditGlyph />
          <figcaption>edit</figcaption>
        </figure>
        <figure>
          <TrashGlyph />
          <figcaption>trash</figcaption>
        </figure>
        <figure>
          <CheckGlyph />
          <figcaption>check</figcaption>
        </figure>
        <figure>
          <GearGlyph />
          <figcaption>gear</figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ── Floating variant switcher ────────────────────────────────────────────── */

function VariantSwitcher({
  current,
  onSwitch,
}: {
  current: VariantKey;
  onSwitch: (next: VariantKey) => void;
}) {
  const index = VARIANTS.findIndex((v) => v.key === current);
  const prev = variantAt(index - 1);
  const next = variantAt(index + 1);
  const active = variantAt(index);
  return (
    <div className="dsproto-switcher" role="group" aria-label="Prototype variant switcher">
      <button type="button" onClick={() => onSwitch(prev.key)} aria-label={`Previous variant: ${prev.name}`}>
        ◀
      </button>
      <span className="dsproto-switcher-label">
        {active.key.toUpperCase()} — {active.name}
      </span>
      <button type="button" onClick={() => onSwitch(next.key)} aria-label={`Next variant: ${next.name}`}>
        ▶
      </button>
    </div>
  );
}

export function DesignSystemPrototype() {
  const [variant, setVariant] = useState<VariantKey>(() => parseVariantFromHash());

  const switchVariant = useCallback((next: VariantKey) => {
    setVariant(next);
    history.replaceState(null, "", `${ROUTE_BASE}?variant=${next}`);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target !== null &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = VARIANTS.findIndex((v) => v.key === parseVariantFromHash());
        const delta = e.key === "ArrowRight" ? 1 : -1;
        switchVariant(variantAt(i + delta).key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchVariant]);

  const active = VARIANTS.find((v) => v.key === variant) ?? variantAt(0);

  return (
    <main className="dsproto" data-variant={active.key}>
      <p className="dsproto-kicker">Design-system prototype · issue #69</p>
      <h1 className="dsproto-title">
        {active.key.toUpperCase()} — {active.name}
      </h1>
      <p className="dsproto-pov">{active.pov}</p>

      <FoundationsSection />
      <ButtonsSection />
      <FieldSection />
      <DialogSection variant={active.key} />
      <IconsSection />

      <VariantSwitcher current={active.key} onSwitch={switchVariant} />
    </main>
  );
}
