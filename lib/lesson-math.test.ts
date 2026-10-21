import { describe, expect, it } from "vitest";
import { lessonMathIssues } from "./lesson-math";

const brokenLesson = String.raw`For $T(n)=an^2+bn+c$, expand and factor:

$$\frac{T(n+h)-T(n)}h
=\frac{2anh+ah^2+bh}{h}
=2an+ah+b,$$

provided $h\ne0$ and both inputs belong to the domain.

### Algebra and elementary functions

The expansion uses $(n+h)^2=n^2+2nh+h^2$.`;

describe("lesson math validation", () => {
  it("rejects the malformed multiline formula that consumed the following lesson", () => {
    expect(lessonMathIssues(brokenLesson)).toEqual([expect.stringContaining("standalone $$ delimiter lines")]);
  });

  it("accepts inline math and correctly fenced multiline equations", () => {
    expect(lessonMathIssues(String.raw`For $T(n)=an^2+bn+c$:

$$
\frac{T(n+h)-T(n)}{h}
=\frac{2anh+ah^2+bh}{h}
=2an+ah+b
$$

Provided $h\ne0$.

### Algebra

Ordinary prose.`)).toEqual([]);
  });

  it.each([
    "$$\nx^2\n\nUnclosed display math.",
    "$$\nx^2$$\n\nProse after an attached closing delimiter.",
    "$$x^2\n$$",
  ])("rejects missing or misplaced display delimiters: %s", (markdown) => {
    expect(lessonMathIssues(markdown)).not.toEqual([]);
  });

  it.each([String.raw`$\frac{1}{$`, String.raw`$\notARealCommand{x}$`])("reports KaTeX errors with a source line: %s", (markdown) => {
    expect(lessonMathIssues(markdown)).toEqual([expect.stringContaining("Line 1: KaTeX parse error")]);
  });

  it("leaves code, escaped dollars, currency, and ordinary Markdown alone", () => {
    expect(lessonMathIssues('Cost: \\$5.\n\n`$$not math`\n\n```js\nconst price = "$5";\n$$unfinished\n```\n\n| Item | Price |\n| --- | --- |\n| Book | $5 |')).toEqual([]);
  });

  it.each(["> $$\n> x^2\n> $$", "- $$\n  x^2\n  $$"])("accepts display math inside Markdown containers: %s", (markdown) => {
    expect(lessonMathIssues(markdown)).toEqual([]);
  });
});
