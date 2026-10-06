import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders math and fenced code as HTML", async () => {
    const html = await renderMarkdown("Energy is $E=mc^2$.\n\n```ts\nconst answer = 42;\n```");
    expect(html).toContain("katex");
    expect(html).toContain("answer");
  });
});
