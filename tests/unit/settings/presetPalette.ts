/** Extract the literal preset palette blocks from app.css for contrast audits. */
export function presetPaletteBlocks(css: string) {
  const selectors = {
    daylight: ":root",
    sepia: '[data-theme="sepia"]',
    light: '[data-theme="light"]',
    dark: '[data-theme="dark"]',
    "trans-light": '[data-theme="trans-light"]',
    "bi-dark": '[data-theme="bi-dark"]',
    "marxism-light": '[data-theme="marxism-light"]',
    "marxism-dark": '[data-theme="marxism-dark"]',
  };
  return Object.fromEntries(
    Object.entries(selectors).map(([theme, selector]) => {
      const from = css.indexOf(`${selector} {`);
      const to = css.indexOf("}", from) + 1;
      if (from < 0 || to <= from) throw new Error(`Missing palette block: ${theme}`);
      return [theme, [from, to] as const];
    }),
  );
}
