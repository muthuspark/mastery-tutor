// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChapterPage } from "./chapter-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["passed", "open"])("loads a %s lesson and only prefetches assessments for active learning", async status => {
  const chapter = { id: "chapter", idx: 0, title: "Separation", status };
  const chapterResponse = { chapter: { ...chapter, pretest: null, contentGenerationVersion: 1, contentGenerationStatus: "ready", generatedAt: "2026-01-01" }, html: "Saved separation lesson" };
  const explanationResponse = { canonicalVersion: 1, baselineExplanationId: "original", effectiveLevel: 2, legacyBaseline: false, sections: [{ id: "original", ordinal: 1, kind: "original", sourceContentVersion: 1, level: 2, label: "Guided", content: "Saved separation lesson", html: "Saved separation lesson" }], activeRequest: null, failedRequest: null };
  const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () =>
    url === "/api/courses/course" ? { course: { topic: "Differential equations" }, chapters: [chapter, { id: "next", idx: 1, status: "open" }] }
      : url === "/api/chapters/chapter" ? chapterResponse
        : url === "/api/chapters/chapter/explanations" ? explanationResponse
          : { chapter: { ...chapter, pretest: null }, html: "Next chapter" },
  }));
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><ChapterPage /></QueryClientProvider>);
  await screen.findByText("Saved separation lesson");
  const title = screen.getByRole("heading", { level: 1, name: chapter.title });
  expect(title.compareDocumentPosition(screen.getByText("Saved separation lesson")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
  expect(screen.getByRole("region", { name: "Chapter practice" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/course/ch/0/quiz");
  expect(await screen.findByText("Current explanation: Guided (2 of 6)")).toBeVisible();
  if (status === "passed") {
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chapters/chapter/explanations"));
    expect(fetch.mock.calls.map(([url]) => url)).toContain("/api/chapters/chapter");
  } else {
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chapters/chapter/quiz"));
    expect(fetch).toHaveBeenCalledWith("/api/chapters/next");
  }
});
