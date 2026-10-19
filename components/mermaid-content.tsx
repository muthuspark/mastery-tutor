"use client";

import { useEffect, useRef } from "react";

type MermaidContentProps = { html: string };

export function MermaidContent({ html }: MermaidContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const equations = contentRef.current?.querySelectorAll<HTMLElement>(".katex-display");
    if (!equations?.length) return;

    // Keep short equations out of the tab order; recheck after resizing or font loading.
    const updateOverflow = () => {
      equations.forEach((equation) => {
        if (equation.scrollWidth > equation.clientWidth) {
          equation.tabIndex = 0;
          equation.setAttribute("role", "region");
          equation.setAttribute("aria-label", "Equation (scroll horizontally)");
        } else {
          equation.removeAttribute("tabindex");
          equation.removeAttribute("role");
          equation.removeAttribute("aria-label");
        }
      });
    };
    const observer = new ResizeObserver(updateOverflow);
    equations.forEach((equation) => {
      observer.observe(equation);
      // The natural-width child also changes size when KaTeX fonts finish loading.
      if (equation.firstElementChild) observer.observe(equation.firstElementChild);
    });
    updateOverflow();
    return () => observer.disconnect();
  }, [html]);

  useEffect(() => {
    let cancelled = false;
    const blocks = contentRef.current?.querySelectorAll<HTMLElement>(".mermaid[data-chart]");
    if (!blocks?.length) return;

    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: { primaryColor: "#f5f3ef", primaryTextColor: "#1a1a1a", primaryBorderColor: "#8b7355", lineColor: "#c41e3a", secondaryColor: "#faf9f7", tertiaryColor: "#ffffff", fontFamily: "Georgia, serif" } });
      await Promise.all(Array.from(blocks).map(async (block, index) => {
        try {
          const { svg } = await mermaid.render(`mastery-tutor-diagram-${Date.now()}-${index}`, block.dataset.chart ?? "");
          if (!cancelled) { block.innerHTML = svg; block.setAttribute("role", "img"); block.setAttribute("aria-label", "Learning diagram"); }
        } catch {
          if (!cancelled) { block.textContent = "This diagram could not be rendered."; block.classList.add("mermaid-error"); }
        }
      }));
    });

    return () => { cancelled = true; };
  }, [html]);

  return <div ref={contentRef} className="prose prose-lg prose-editorial max-w-none prose-headings:font-[var(--display)] prose-headings:font-bold prose-headings:tracking-tight prose-a:text-[var(--accent)]" dangerouslySetInnerHTML={{ __html: html }} />;
}
