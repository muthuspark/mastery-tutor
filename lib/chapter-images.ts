import "server-only";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Root, RootContent } from "mdast";
import type { WikipediaImage } from "./wikipedia-images";

/** Edit by source offsets so code, math, diagrams, and lesson wording stay intact. */
export function filterChapterImages(content: string, candidates: WikipediaImage[]) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(content);
  const definitions = new Map(tree.children.flatMap((node) => node.type === "definition" ? [[node.identifier, node.url] as const] : []));
  const allowed = new Map(candidates.map((image) => [image.imageUrl, image]));
  const used = new Map<string, WikipediaImage>();
  const links = new Set<string>();
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  function visit(node: Root | RootContent) {
    if (node.type === "link") links.add(node.url);
    if (node.type === "linkReference") {
      const url = definitions.get(node.identifier);
      if (url) links.add(url);
    }
    if (node.type === "image" || node.type === "imageReference") {
      const url = node.type === "image" ? node.url : definitions.get(node.identifier);
      const candidate = url ? allowed.get(url) : undefined;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        if (!candidate || used.has(candidate.imageUrl) || used.size >= 2) {
          edits.push({ start, end, replacement: "" });
        } else {
          used.set(candidate.imageUrl, candidate);
          // A selected instructional image must have a nonempty text alternative.
          if (!node.alt?.trim()) {
            const alt = candidate.title.replace(/[\\[\]]/g, "\\$&");
            edits.push({ start, end, replacement: `![${alt}](<${candidate.imageUrl}>)` });
          }
        }
      }
    }
    if ("children" in node) node.children.forEach(visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end);
  }
  // Supply attribution even if the writer omitted a requested source link.
  for (const image of used.values()) {
    if (!links.has(image.pageUrl)) {
      content += `\n\n[Image source: Wikipedia](<${image.pageUrl}>)`;
      links.add(image.pageUrl);
    }
  }
  return content.trim();
}
