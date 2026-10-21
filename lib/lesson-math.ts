import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { renderToString } from "katex";
import type { Root, RootContent } from "mdast";

/** Validate the same Markdown math nodes that rehype-katex will render. */
export function lessonMathIssues(markdown: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
  const lines = markdown.split(/\r?\n/);
  const issues: string[] = [];

  function visit(node: Root | RootContent) {
    if (node.type === "math" || node.type === "inlineMath") {
      const line = node.position?.start.line ?? 1;
      if (node.type === "math") {
        // remark-math treats text after the opening fence as metadata, and an
        // attached closing fence as formula text, potentially consuming prose.
        const column = (node.position?.start.column ?? 1) - 1;
        const opening = lines[line - 1].slice(column).trim();
        const end = node.position?.end.line ?? line;
        const closing = lines[end - 1].slice(column).trim();
        if (!/^\${2,}$/.test(opening) || end === line || closing !== opening) {
          issues.push(`Line ${line}: display math must open and close with matching standalone $$ delimiter lines. Keep prose outside the math block.`);
          return;
        }
      }
      try {
        renderToString(node.value, { displayMode: node.type === "math", throwOnError: true });
      } catch (error) {
        issues.push(`Line ${line}: ${error instanceof Error ? error.message : "Invalid LaTeX"}`);
      }
    }
    if ("children" in node) node.children.forEach(visit);
  }

  visit(tree);
  return issues;
}
