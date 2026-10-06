import "server-only";

import { unified } from "unified";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import rehypeShiki from "@shikijs/rehype";

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function rehypeMermaid() {
  return (tree: HastNode) => {
    function visit(parent: HastNode) {
      if (!parent.children) return;
      parent.children = parent.children.flatMap((node) => {
        const code = node.children?.[0];
        const className = code?.properties?.className;
        const isMermaid = node.tagName === "pre" && code?.tagName === "code" && Array.isArray(className) && className.includes("language-mermaid");
        if (isMermaid) {
          const chart = code.children?.map((child) => child.value ?? "").join("") ?? "";
          return [{ type: "element", tagName: "div", properties: { className: ["mermaid"], "data-chart": chart }, children: [] }];
        }
        visit(node);
        return [node];
      });
    }
    visit(tree);
  };
}

export async function renderMarkdown(markdown: string) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeMermaid)
    .use(rehypeKatex)
    .use(rehypeShiki, { themes: { light: "github-light" } })
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
