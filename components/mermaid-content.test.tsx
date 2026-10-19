// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MermaidContent } from "./mermaid-content";
import katex from "katex";

const diagram = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: '<svg aria-label="Flowchart"><text>Learn</text></svg>' })),
}));
vi.mock("mermaid", () => ({ default: diagram }));

let resize: () => void;
let overflowing: boolean;
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(() => {
  overflowing = true;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  // JSDOM has no layout: simulate measured overflow, not browser scrolling.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => overflowing ? 1200 : 320);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("makes overflowing real KaTeX output keyboard reachable without replacing accessible math", async () => {
  const html = `<p>Inline ${katex.renderToString("x^2")}.</p>${katex.renderToString("\\sum_{i=1}^{100} x_i = y", { displayMode: true })}`;
  const { container } = render(<MermaidContent html={html} />);
  const equation = screen.getByRole("region", { name: "Equation (scroll horizontally)" });
  expect(equation).toHaveAttribute("tabindex", "0");
  equation.focus();
  expect(equation).toHaveFocus();
  expect(equation.querySelector("math")?.getAttribute("display")).toBe("block");
  expect(equation.querySelector('annotation[encoding="application/x-tex"]')?.textContent).toBe("\\sum_{i=1}^{100} x_i = y");
  expect(equation.querySelector(".katex-html")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("p .katex")).not.toHaveAttribute("tabindex");
  expect(observe).toHaveBeenCalledWith(equation);
  expect(observe).toHaveBeenCalledWith(equation.firstElementChild);
});

it("updates keyboard access when overflow changes and disconnects on lesson replacement and unmount", async () => {
  overflowing = false;
  const html = katex.renderToString("x=1", { displayMode: true });
  const { container, rerender, unmount } = render(<MermaidContent html={html} />);
  const equation = container.querySelector(".katex-display")!;
  expect(equation).not.toHaveAttribute("tabindex");
  expect(screen.queryByRole("region")).toBeNull();
  overflowing = true;
  resize();
  expect(equation).toHaveAttribute("tabindex", "0");
  overflowing = false;
  resize();
  expect(equation).not.toHaveAttribute("tabindex");
  expect(equation).not.toHaveAttribute("aria-label");
  expect(equation).not.toHaveAttribute("role");
  rerender(<MermaidContent html={katex.renderToString("y=2", { displayMode: true })} />);
  expect(disconnect).toHaveBeenCalledTimes(1);
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("retains complete long prose, link destinations, code, and Mermaid rendering", async () => {
  const token = "uninterrupted".repeat(80);
  const url = `https://example.com/${token}`;
  const html = `<h1>Lesson</h1><p>${token}</p><p><a href="${url}">${url}</a></p><pre><code>const token = '${token}';</code></pre><div class="mermaid" data-chart="flowchart TD\n A[Start] --&gt; B[Learn]"></div>`;
  const { container } = render(<MermaidContent html={html} />);
  expect(screen.getByText(token, { selector: "p" })).toHaveTextContent(token);
  expect(screen.getByRole("link", { name: url })).toHaveAttribute("href", url);
  expect(container.querySelector("pre code")).toHaveTextContent(`const token = '${token}';`);
  await waitFor(() => expect(screen.getByRole("img", { name: "Learning diagram" }).querySelector("svg")).not.toBeNull());
  expect(diagram.render).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("A[Start] --> B[Learn]"));
});
