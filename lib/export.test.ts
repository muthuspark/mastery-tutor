import { describe, expect, it } from "vitest";
import { courseToMarkdown } from "./export";

describe("course export", () => {
  it("exports cached content and labels chapters that are not generated", () => {
    const markdown = courseToMarkdown({
      topic: "System design",
      chapters: [
        { idx: 1, title: "Scale", objectives: ["Explain scale"], status: "locked", content: null, summary: null },
        { idx: 0, title: "Foundations", objectives: ["Define a system"], status: "open", content: "A system has parts.", summary: "Parts work together." },
      ],
    });
    expect(markdown).toContain("# System design");
    expect(markdown).toContain("A system has parts.");
    expect(markdown).toContain("This chapter has not been generated yet.");
    expect(markdown.indexOf("Foundations")).toBeLessThan(markdown.indexOf("Scale"));
  });
});
