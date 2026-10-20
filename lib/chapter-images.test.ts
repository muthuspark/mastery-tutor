import { describe, expect, it, vi } from "vitest";
import { filterChapterImages } from "./chapter-images";
import type { WikipediaImage } from "./wikipedia-images";

vi.mock("server-only", () => ({}));
const candidate: WikipediaImage = { title: "Neuron", imageUrl: "https://upload.wikimedia.org/neuron.svg", pageUrl: "https://en.wikipedia.org/wiki/Neuron", caption: "Nerve cell" };

describe("chapter image filtering", () => {
  it("retains verified images and their source links without changing surrounding Markdown", () => {
    const content = `A nerve cell.\n\n![A neuron and its axon](${candidate.imageUrl})\n\n[Source: Wikipedia](${candidate.pageUrl})\n\n$E=mc^2$\n\n\`\`\`mermaid\nflowchart TD\n A --> B\n\`\`\``;
    expect(filterChapterImages(content, [candidate])).toBe(content);
  });

  it("removes invented inline and reference images while preserving code samples", () => {
    const content = "Lesson.\n\n![Invented](https://example.com/image.jpg)\n\n![Other][bad]\n\n[bad]: https://example.com/other.png\n\n`![Example](https://example.com/code.png)`";
    const result = filterChapterImages(content, []);
    expect(result).not.toContain("![Invented]");
    expect(result).not.toContain("![Other]");
    expect(result).toContain("`![Example](https://example.com/code.png)`");
    expect(result).toContain("Lesson.");
  });

  it("fills missing alt text and attribution for a verified reference image", () => {
    const content = `Lesson.\n\n![][image]\n\n[image]: ${candidate.imageUrl}`;
    const result = filterChapterImages(content, [candidate]);
    expect(result).toContain(`![Neuron](<${candidate.imageUrl}>)`);
    expect(result).toContain(`[Image source: Wikipedia](<${candidate.pageUrl}>)`);
  });

  it("does not repeat an image or attribution already linked by reference", () => {
    const result = filterChapterImages(`![A](${candidate.imageUrl})\n\n![B](${candidate.imageUrl})\n\n[Wikipedia][source]\n\n[source]: ${candidate.pageUrl}`, [candidate]);
    expect(result).toContain("![A]");
    expect(result).not.toContain("![B]");
    expect(result).not.toContain("Image source:");
  });
});
