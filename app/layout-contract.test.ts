import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const containers = [".page-shell", ".reading-shell", ".site-header", ".generation-overlay__inner"];
// Inspect authored declarations only. Browser bounds and overflow are verified by
// the host; this contract guards against reintroducing independent container rules.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@(?:import|plugin) [^;]+;/gm, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({
    selectors: selector.trim().split(/,\s*/),
    declarations: Object.fromEntries(body.split(";").filter((value) => value.includes(":"))
      .map((value) => {
        const colon = value.indexOf(":");
        return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
      })),
  }));

describe("page container CSS contract", () => {
  it("keeps every container on one shared width and centering rule, including mobile", () => {
    for (const container of containers) {
      const widthRules = rules.filter((rule) => rule.selectors.includes(container) && "width" in rule.declarations);
      expect(widthRules, container).toHaveLength(1);
      expect(widthRules[0].selectors).toEqual(containers);
      expect(widthRules[0].declarations).toMatchObject({
        width: "min(calc(100% - 2 * var(--layout-gutter)), var(--container-max, var(--layout-max-wide)))",
        "margin-inline": "auto",
      });
    }
    // Compound selectors must not silently create a separate route width.
    const overrides = rules.filter((rule) => rule.selectors.some((selector) =>
      containers.some((container) => selector.includes(container))) &&
      ["width", "max-width", "margin-inline"].some((property) => property in rule.declarations));
    expect(overrides).toHaveLength(1);
  });

  it("preserves the published desktop and mobile tokens at the existing breakpoint", () => {
    const roots = rules.filter((rule) => rule.selectors.includes(":root"));
    expect(roots).toHaveLength(2);
    expect(roots[0].declarations).toMatchObject({
      "--layout-max-wide": "80rem",
      "--layout-max-reading": "48rem",
      "--layout-gutter": "1.5rem",
      "--layout-page-space": "3.5rem",
    });
    expect(roots[1].declarations).toEqual({ "--layout-gutter": "1rem", "--layout-page-space": "2.5rem" });
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*:root\s*\{/);
  });

  it("uses one explicit reading variant and shared page spacing with the home exception", () => {
    const variants = rules.filter((rule) => "--container-max" in rule.declarations);
    expect(variants).toEqual([{ selectors: [".reading-shell"], declarations: { "--container-max": "var(--layout-max-reading)" } }]);
    const pageSpacing = rules.filter((rule) => rule.selectors.includes(".page-shell") && "padding-block" in rule.declarations);
    expect(pageSpacing).toEqual([{ selectors: [".page-shell", ".reading-shell"], declarations: { "padding-block": "var(--layout-page-space)" } }]);
    const home = rules.filter((rule) => rule.selectors.includes(".page-shell.home-page"));
    expect(home).toEqual([{ selectors: [".page-shell.home-page"], declarations: { "padding-block": "0" } }]);
  });
});
