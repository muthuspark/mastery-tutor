import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
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
