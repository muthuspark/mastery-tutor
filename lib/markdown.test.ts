import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders instructional images with alt text, lazy loading, and source links", async () => {
    const html = await renderMarkdown("A neuron carries signals.\n\n![A neuron and its axon](https://upload.wikimedia.org/neuron.svg)\n\n[Source: Wikipedia](https://en.wikipedia.org/wiki/Neuron)");
    expect(html).toContain('alt="A neuron and its axon"');
    expect(html).toContain('src="https://upload.wikimedia.org/neuron.svg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Neuron"');
    expect(html).toContain("A neuron carries signals.");
  });

  it("renders math and fenced code as HTML", async () => {
    const html = await renderMarkdown("Energy is $E=mc^2$.\n\n```ts\nconst answer = 42;\n```");
    expect(html).toContain("katex");
    expect(html).toContain("answer");
  }, 10_000);

  it("turns Mermaid fences into client-renderable diagram blocks", async () => {
    const html = await renderMarkdown("```mermaid\nflowchart TD\n  A[Start] --> B[Learn]\n```");
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("flowchart TD");
    expect(html).not.toContain("language-mermaid");
  });

  it("renders GitHub-Flavored Markdown tables as HTML tables", async () => {
    const html = await renderMarkdown("| Student | Payoff |\n| --- | --- |\n| 1 | (3, 3) |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Student</th>");
    expect(html).toContain("<td>(3, 3)</td>");
  });
});
